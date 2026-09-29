// Pure audio feature extraction for the audio-reactive ambient glow. No DOM or
// Web Audio here — it consumes the byte arrays an AnalyserNode fills
// (getByteFrequencyData / getByteTimeDomainData) so it can be unit-tested with
// synthetic frames.

export interface PulseFrame {
	/** Overall loudness, 0..1 (RMS mapped from dBFS, envelope-followed). */
	level: number
	/** Per-band energy, 0..1, log-spaced from bass (index 0) to treble. */
	bands: number[]
	/** Beat impulse: jumps to 1 on a detected kick, decays exponentially. */
	beat: number
	/** Spectral brightness (log-frequency centroid), 0..1. */
	centroid: number
	/** Seconds since the analyzer started; drives shimmer phase. */
	time: number
}

export interface PulseAnalyzerOptions {
	bandCount: number
	sampleRate: number
	/** AnalyserNode.fftSize — frequency arrays hold fftSize / 2 bins. */
	fftSize: number
	minHz?: number
	maxHz?: number
}

export interface PulseAnalyzer {
	step(freq: Uint8Array, time: Uint8Array, dtMs: number): PulseFrame
	/** Latest frame (all zeros before the first step). */
	readonly current: PulseFrame
}

const MIN_DB = -50
const MAX_DB = -6
// Byte spectrum values at or below this are treated as noise (vinyl hiss, the
// silence between tracks) so the AGC can't blow them up into flicker.
const NOISE_FLOOR = 0.12
// AGC peaks never drop below this, so a quiet band can't be normalized to 1.
const AGC_PEAK_FLOOR = 0.2
const AGC_DECAY_PER_S = 0.25
const ATTACK_S = 0.03
const RELEASE_S = 0.25
const BEAT_DECAY_S = 0.18
const BEAT_REFRACTORY_MS = 250
const BEAT_HISTORY_MS = 1000
const BEAT_SENSITIVITY = 1.5
// Absolute minimum low-end flux for a beat, so near-silence can't trigger one.
const BEAT_MIN_FLUX = 0.04

/** Map RMS (linear, 0..1) to 0..1 over the MIN_DB..MAX_DB window. */
export function rmsToLevel(rms: number): number {
	if (rms <= 0) return 0
	const db = 20 * Math.log10(rms)
	return clamp01((db - MIN_DB) / (MAX_DB - MIN_DB))
}

/** RMS of an unsigned-byte time-domain buffer (128 = zero). */
export function timeDomainRms(time: Uint8Array): number {
	if (time.length === 0) return 0
	let sum = 0
	for (let i = 0; i < time.length; i++) {
		const v = (time[i] - 128) / 128
		sum += v * v
	}
	return Math.sqrt(sum / time.length)
}

/**
 * Log-spaced band edges as [startBin, endBin) pairs. Every band gets at least
 * one bin, and bands never overlap or run past the spectrum.
 */
export function bandBinRanges(
	bandCount: number,
	binCount: number,
	sampleRate: number,
	minHz = 40,
	maxHz = 12000,
): Array<[number, number]> {
	const hzPerBin = sampleRate / 2 / binCount
	const top = Math.min(maxHz, sampleRate / 2)
	const ranges: Array<[number, number]> = []
	let prevEnd = Math.max(1, Math.floor(minHz / hzPerBin))
	for (let i = 0; i < bandCount; i++) {
		const hiHz = minHz * Math.pow(top / minHz, (i + 1) / bandCount)
		let end = Math.min(binCount, Math.round(hiHz / hzPerBin))
		if (end <= prevEnd) end = Math.min(binCount, prevEnd + 1)
		const start = Math.min(prevEnd, binCount - 1)
		ranges.push([start, Math.max(end, start + 1)])
		prevEnd = end
	}
	return ranges
}

/** Frame-rate independent attack/release smoothing towards `target`. */
export function follow(
	current: number,
	target: number,
	dtMs: number,
	attackS = ATTACK_S,
	releaseS = RELEASE_S,
): number {
	const tau = target > current ? attackS : releaseS
	const k = 1 - Math.exp(-dtMs / 1000 / tau)
	return current + (target - current) * k
}

export function createPulseAnalyzer(options: PulseAnalyzerOptions): PulseAnalyzer {
	const { bandCount, sampleRate, fftSize, minHz = 40, maxHz = 12000 } = options
	const binCount = fftSize / 2
	const ranges = bandBinRanges(bandCount, binCount, sampleRate, minHz, maxHz)
	// Kick energy lives roughly under 150 Hz.
	const hzPerBin = sampleRate / 2 / binCount
	const lowEndBin = Math.max(2, Math.round(150 / hzPerBin))

	const peaks = new Array<number>(bandCount).fill(AGC_PEAK_FLOOR)
	let prevLow: Float32Array | null = null
	const fluxHistory: Array<{ at: number; flux: number }> = []
	let clockMs = 0
	let lastBeatAt = -Infinity

	const frame: PulseFrame = {
		level: 0,
		bands: new Array<number>(bandCount).fill(0),
		beat: 0,
		centroid: 0,
		time: 0,
	}

	function step(freq: Uint8Array, time: Uint8Array, dtMs: number): PulseFrame {
		// Guard against tab-resume spikes: a huge dt would snap every envelope.
		const dt = Math.min(Math.max(dtMs, 0), 100)
		clockMs += dt
		frame.time = clockMs / 1000

		frame.level = follow(frame.level, rmsToLevel(timeDomainRms(time)), dt)

		const agcDecay = Math.exp((-AGC_DECAY_PER_S * dt) / 1000)
		for (let b = 0; b < bandCount; b++) {
			const [start, end] = ranges[b]
			let sum = 0
			for (let i = start; i < end && i < freq.length; i++) sum += freq[i]
			const raw = sum / Math.max(1, end - start) / 255
			const gated = raw <= NOISE_FLOOR ? 0 : (raw - NOISE_FLOOR) / (1 - NOISE_FLOOR)
			peaks[b] = Math.max(AGC_PEAK_FLOOR, gated, peaks[b] * agcDecay)
			frame.bands[b] = follow(frame.bands[b], clamp01(gated / peaks[b]), dt)
		}

		// Centroid over log frequency, so it reads as perceived brightness.
		let weight = 0
		let weighted = 0
		const logMin = Math.log(minHz)
		const logSpan = Math.log(Math.min(maxHz, sampleRate / 2)) - logMin
		for (let i = 1; i < freq.length; i++) {
			const mag = freq[i] / 255
			if (mag <= NOISE_FLOOR) continue
			const pos = clamp01((Math.log(i * hzPerBin) - logMin) / logSpan)
			weighted += pos * mag
			weight += mag
		}
		frame.centroid = follow(frame.centroid, weight > 0 ? weighted / weight : 0, dt, 0.15, 0.6)

		frame.beat *= Math.exp(-dt / 1000 / BEAT_DECAY_S)

		// Silence (paused, or the gap between tracks) resets beat tracking, so the
		// first frame of music isn't measured against an all-zero history and
		// mistaken for a kick.
		if (weight === 0) {
			prevLow = null
			fluxHistory.length = 0
			return snapshot()
		}

		// Beat: positive spectral flux on the low end vs an adaptive threshold.
		const low = new Float32Array(lowEndBin)
		let flux = 0
		for (let i = 0; i < lowEndBin && i < freq.length; i++) {
			low[i] = freq[i] / 255
			if (prevLow) flux += Math.max(0, low[i] - prevLow[i])
		}
		flux /= lowEndBin
		prevLow = low

		while (fluxHistory.length && clockMs - fluxHistory[0].at > BEAT_HISTORY_MS) fluxHistory.shift()
		let mean = 0
		for (const h of fluxHistory) mean += h.flux
		mean = fluxHistory.length ? mean / fluxHistory.length : 0
		let variance = 0
		for (const h of fluxHistory) variance += (h.flux - mean) ** 2
		const std = fluxHistory.length ? Math.sqrt(variance / fluxHistory.length) : 0
		fluxHistory.push({ at: clockMs, flux })

		const isBeat =
			fluxHistory.length > 4 &&
			flux > BEAT_MIN_FLUX &&
			flux > mean + BEAT_SENSITIVITY * std &&
			clockMs - lastBeatAt >= BEAT_REFRACTORY_MS
		if (isBeat) {
			lastBeatAt = clockMs
			frame.beat = 1
		}

		return snapshot()
	}

	function snapshot(): PulseFrame {
		return { ...frame, bands: frame.bands.slice() }
	}

	return {
		step,
		get current() {
			return snapshot()
		},
	}
}

function clamp01(v: number): number {
	return v < 0 ? 0 : v > 1 ? 1 : v
}
