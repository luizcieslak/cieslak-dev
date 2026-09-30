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
	/**
	 * Snare impulse: jumps to 1 on a detected snare/clap (a hit in the snare's
	 * body AND crack ranges, with the kick range excluded), decays exponentially.
	 */
	snare: number
	/** Per-band transient impulses: 1 on a sudden rise in that band, decaying fast. */
	onsets: number[]
	/** Heavily smoothed loudness, 0..1 — a slow breath rather than a pulse. */
	swell: number
	/**
	 * Accumulated rotation in radians. Only advances while music plays, faster
	 * with treble and on kicks, so motion keeps time with the track.
	 */
	orbit: number
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
	/** Drum-detector thresholds; the defaults are tuned with scripts/pulse-eval.mjs. */
	detection?: Partial<DrumDetection>
}

export interface DrumDetection {
	/** How much more unusual the low-end rise must be than the air rise to be a kick. */
	kickLowOverAir: number
	/**
	 * Adaptive-threshold strictness (σ above the recent mean) for the snare. High,
	 * because swung 8th hats are the same shape and keep the recent mean busy.
	 */
	snareSensitivity: number
}

export interface PulseAnalyzer {
	step(freq: Uint8Array, time: Uint8Array, dtMs: number): PulseFrame
	/**
	 * Scale every release and impulse decay (1 = default; 2 = twice as slow to
	 * relax, i.e. smoother; 0.5 = snappier). Attacks are unaffected.
	 */
	setSmoothing(scale: number): void
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
const SNARE_DECAY_S = 0.15
const SNARE_REFRACTORY_MS = 200
const SNARE_MIN_FLUX = 0.03
/**
 * Drums are told apart by how UNUSUAL each region's rise is compared with its
 * own recent typical rise (tuned on a synthetic boom-bap loop with a bassline,
 * see scripts/pulse-eval.mjs). Raw rises don't work: any sharp attack smears
 * across the whole spectrum, and a lofi bassline keeps the low end busy.
 * - kick: the low-end rise is far more unusual than the air (hats/cymbals) rise;
 * - snare: the loudest broadband rises (body + crack + air together) that aren't
 *   kick-shaped; hats are the same shape but weaker and more frequent, so the
 *   adaptive threshold passes over them.
 */
/**
 * Swept on synthetic boom-bap loops (88 and 93 BPM, with bassline, swung hats,
 * pad and crackle): kick F1 0.62 (the original low-end-only detector: 0.52,
 * precision 0.38 — bass notes and snares read as kicks), snare F1 0.59.
 */
export const DEFAULT_DRUM_DETECTION: DrumDetection = {
	kickLowOverAir: 2,
	snareSensitivity: 3.5,
}
/** Time constant of each region's "typical rise" average. */
const REGION_MEAN_S = 2
/**
 * A snare must also move its shell (body) or crack range this much above
 * typical: an air-only rise is a hat, even when nothing else is playing (a
 * hats-only intro would otherwise read as a run of snares).
 */
const SNARE_MIN_MID_UNUSUAL = 2
const ONSET_DECAY_S = 0.12
// Hats can be fast (swung 16ths at ~90 BPM are ~170ms apart).
const ONSET_REFRACTORY_MS = 90
const ONSET_MIN_FLUX = 0.08
const SWELL_ATTACK_S = 0.6
const SWELL_RELEASE_S = 1.8

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

/**
 * Onset detection by positive flux against an adaptive threshold: a value that
 * jumps well above its own recent average (mean + k·σ over ~1s) fires an
 * impulse, with a refractory period so one hit can't fire twice.
 */
function createOnsetDetector(config: {
	refractoryMs: number
	minFlux: number
	sensitivity?: number
	historyMs?: number
}) {
	const { refractoryMs, minFlux, sensitivity = BEAT_SENSITIVITY, historyMs = BEAT_HISTORY_MS } = config
	const history: Array<{ at: number; flux: number }> = []
	let lastAt = -Infinity
	return {
		/**
		 * Feed this frame's flux; returns true on an onset. `accept` vetoes a
		 * candidate (e.g. the spectral shape says it's another drum) without
		 * starting the refractory period.
		 */
		push(flux: number, clockMs: number, accept = true): boolean {
			while (history.length && clockMs - history[0].at > historyMs) history.shift()
			let mean = 0
			for (const h of history) mean += h.flux
			mean = history.length ? mean / history.length : 0
			let variance = 0
			for (const h of history) variance += (h.flux - mean) ** 2
			const std = history.length ? Math.sqrt(variance / history.length) : 0
			history.push({ at: clockMs, flux })
			const fired =
				accept &&
				history.length > 5 &&
				flux > minFlux &&
				flux > mean + sensitivity * std &&
				clockMs - lastAt >= refractoryMs
			if (fired) lastAt = clockMs
			return fired
		},
		reset() {
			history.length = 0
		},
	}
}

/** Mean positive per-bin rise between two spectra over [start, end). */
function binFlux(now: Float32Array, prev: Float32Array | null, start: number, end: number): number {
	if (!prev || end <= start) return 0
	let flux = 0
	for (let i = start; i < end; i++) flux += Math.max(0, now[i] - prev[i])
	return flux / (end - start)
}

export function createPulseAnalyzer(options: PulseAnalyzerOptions): PulseAnalyzer {
	const { bandCount, sampleRate, fftSize, minHz = 40, maxHz = 12000 } = options
	const detection = { ...DEFAULT_DRUM_DETECTION, ...options.detection }
	const binCount = fftSize / 2
	const ranges = bandBinRanges(bandCount, binCount, sampleRate, minHz, maxHz)
	const hzPerBin = sampleRate / 2 / binCount
	const binAt = (hz: number) => Math.min(binCount, Math.max(1, Math.round(hz / hzPerBin)))
	// Kick energy lives roughly under 150 Hz; a snare's shell ("body") around
	// 150-800 Hz and its crack (the wires / clap) around 1.5-5 kHz; hats and
	// cymbals up in the air, 6-12 kHz.
	const regionBins = {
		low: [1, Math.max(2, binAt(150))],
		body: [binAt(150), binAt(800)],
		crack: [binAt(1500), binAt(5000)],
		air: [binAt(6000), binAt(12000)],
	} as const
	type Region = keyof typeof regionBins
	const regionMean: Record<Region, number> = { low: 0, body: 0, crack: 0, air: 0 }

	const peaks = new Array<number>(bandCount).fill(AGC_PEAK_FLOOR)
	const gatedBands = new Array<number>(bandCount).fill(0)
	let prevGated: number[] | null = null
	let prevSpectrum: Float32Array | null = null
	const kick = createOnsetDetector({ refractoryMs: BEAT_REFRACTORY_MS, minFlux: BEAT_MIN_FLUX })
	const snare = createOnsetDetector({
		refractoryMs: SNARE_REFRACTORY_MS,
		minFlux: SNARE_MIN_FLUX,
		sensitivity: detection.snareSensitivity,
	})
	const bandOnsets = ranges.map(() =>
		createOnsetDetector({ refractoryMs: ONSET_REFRACTORY_MS, minFlux: ONSET_MIN_FLUX }),
	)
	let clockMs = 0
	let smoothing = 1

	const frame: PulseFrame = {
		level: 0,
		bands: new Array<number>(bandCount).fill(0),
		beat: 0,
		snare: 0,
		onsets: new Array<number>(bandCount).fill(0),
		swell: 0,
		orbit: 0,
		centroid: 0,
		time: 0,
	}

	function step(freq: Uint8Array, time: Uint8Array, dtMs: number): PulseFrame {
		// Guard against tab-resume spikes: a huge dt would snap every envelope.
		const dt = Math.min(Math.max(dtMs, 0), 100)
		clockMs += dt
		frame.time = clockMs / 1000
		const release = RELEASE_S * smoothing
		const decay = (seconds: number) => Math.exp(-dt / 1000 / (seconds * smoothing))

		const level = rmsToLevel(timeDomainRms(time))
		frame.level = follow(frame.level, level, dt, ATTACK_S, release)
		frame.swell = follow(frame.swell, level, dt, SWELL_ATTACK_S, SWELL_RELEASE_S * smoothing)

		const agcDecay = Math.exp((-AGC_DECAY_PER_S * dt) / 1000)
		for (let b = 0; b < bandCount; b++) {
			const [start, end] = ranges[b]
			let sum = 0
			for (let i = start; i < end && i < freq.length; i++) sum += freq[i]
			const raw = sum / Math.max(1, end - start) / 255
			const gated = raw <= NOISE_FLOOR ? 0 : (raw - NOISE_FLOOR) / (1 - NOISE_FLOOR)
			peaks[b] = Math.max(AGC_PEAK_FLOOR, gated, peaks[b] * agcDecay)
			gatedBands[b] = clamp01(gated / peaks[b])
			frame.bands[b] = follow(frame.bands[b], gatedBands[b], dt, ATTACK_S, release)
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
		frame.centroid = follow(frame.centroid, weight > 0 ? weighted / weight : 0, dt, 0.15, 0.6 * smoothing)

		frame.beat *= decay(BEAT_DECAY_S)
		frame.snare *= decay(SNARE_DECAY_S)
		for (let b = 0; b < bandCount; b++) frame.onsets[b] *= decay(ONSET_DECAY_S)

		// Silence (paused, or the gap between tracks) resets onset tracking, so the
		// first frame of music isn't measured against an all-zero history and
		// mistaken for a hit.
		if (weight === 0) {
			// True silence (paused, between tracks): let the slow swell fall at the
			// normal release too, or the glow would keep breathing for ~8s after a pause.
			frame.swell = follow(frame.swell, 0, dt, SWELL_ATTACK_S, release)
			prevSpectrum = null
			prevGated = null
			kick.reset()
			snare.reset()
			for (const detector of bandOnsets) detector.reset()
			return snapshot()
		}

		const spectrum = new Float32Array(freq.length)
		for (let i = 0; i < freq.length; i++) spectrum[i] = freq[i] / 255

		// Each region's rise relative to its own recent typical rise.
		const meanStep = 1 - Math.exp(-dt / 1000 / REGION_MEAN_S)
		const rise = {} as Record<Region, number>
		const unusual = {} as Record<Region, number>
		for (const region of Object.keys(regionBins) as Region[]) {
			const [start, end] = regionBins[region]
			rise[region] = binFlux(spectrum, prevSpectrum, start, end)
			unusual[region] = rise[region] / (regionMean[region] + 0.005)
			regionMean[region] += (rise[region] - regionMean[region]) * meanStep
		}
		const kickShaped = unusual.low >= detection.kickLowOverAir * Math.max(unusual.air, 0.5)
		// Kick: an unusual low-end rise that the air range doesn't share.
		if (kick.push(rise.low, clockMs, kickShaped)) frame.beat = 1
		// Snare: an exceptionally strong broadband rise that isn't kick-shaped.
		const broadband = (unusual.body + unusual.crack + unusual.air) / 3
		const midInvolved = Math.max(unusual.body, unusual.crack) >= SNARE_MIN_MID_UNUSUAL
		if (snare.push(broadband, clockMs, !kickShaped && midInvolved)) frame.snare = 1
		// Per-band transients, on the AGC-normalized band values so a quiet band's
		// hits count as much as a loud one's.
		for (let b = 0; b < bandCount; b++) {
			const rise = prevGated ? Math.max(0, gatedBands[b] - prevGated[b]) : 0
			if (bandOnsets[b].push(rise, clockMs)) frame.onsets[b] = 1
		}
		prevSpectrum = spectrum
		prevGated = gatedBands.slice()

		// Orbit only turns while there's music: a slow base drift with loudness,
		// faster on bright passages, and a nudge on each kick.
		const trebleStart = Math.ceil((bandCount * 2) / 3)
		let treble = 0
		for (let b = trebleStart; b < bandCount; b++) treble += frame.bands[b]
		treble = bandCount > trebleStart ? treble / (bandCount - trebleStart) : 0
		frame.orbit += (dt / 1000) * (0.25 * frame.level + 0.5 * treble + 1.5 * frame.beat)

		return snapshot()
	}

	function snapshot(): PulseFrame {
		return { ...frame, bands: frame.bands.slice(), onsets: frame.onsets.slice() }
	}

	return {
		step,
		setSmoothing(scale) {
			smoothing = Number.isFinite(scale) && scale > 0 ? scale : 1
		},
		get current() {
			return snapshot()
		},
	}
}

function clamp01(v: number): number {
	return v < 0 ? 0 : v > 1 ? 1 : v
}

const REST_EPSILON = 0.01

/** True once every envelope has decayed to (visually) zero. */
export function isAtRest(frame: PulseFrame): boolean {
	return (
		frame.level < REST_EPSILON &&
		frame.swell < REST_EPSILON &&
		frame.beat < REST_EPSILON &&
		frame.snare < REST_EPSILON &&
		frame.bands.every(b => b < REST_EPSILON) &&
		frame.onsets.every(o => o < REST_EPSILON)
	)
}
