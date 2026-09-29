import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
	bandBinRanges,
	createPulseAnalyzer,
	follow,
	rmsToLevel,
	timeDomainRms,
} from '../src/lib/audio-pulse.ts'

const SAMPLE_RATE = 48000
const FFT = 2048
const BINS = FFT / 2
const HZ_PER_BIN = SAMPLE_RATE / 2 / BINS
const FRAME_MS = 1000 / 60

function sine(amplitude, length = FFT) {
	const out = new Uint8Array(length)
	for (let i = 0; i < length; i++)
		out[i] = Math.round(128 + 127 * amplitude * Math.sin((i / length) * Math.PI * 16))
	return out
}

const SILENT_TIME = new Uint8Array(FFT).fill(128)
const SILENT_FREQ = new Uint8Array(BINS)

/** Spectrum with `value` in [loHz, hiHz) and `base` elsewhere. */
function spectrum(loHz, hiHz, value, base = 0) {
	const out = new Uint8Array(BINS).fill(base)
	for (let i = 0; i < BINS; i++) {
		const hz = i * HZ_PER_BIN
		if (hz >= loHz && hz < hiHz) out[i] = value
	}
	return out
}

function run(analyzer, frames) {
	let frame
	for (const [freq, time] of frames) frame = analyzer.step(freq, time, FRAME_MS)
	return frame
}

test('rmsToLevel maps -50..-6 dBFS onto 0..1 and clamps', () => {
	assert.equal(rmsToLevel(0), 0)
	assert.equal(rmsToLevel(10 ** (-60 / 20)), 0)
	assert.ok(Math.abs(rmsToLevel(10 ** (-28 / 20)) - 0.5) < 1e-9)
	assert.equal(rmsToLevel(1), 1)
})

test('timeDomainRms treats 128 as zero', () => {
	assert.equal(timeDomainRms(SILENT_TIME), 0)
	assert.equal(timeDomainRms(new Uint8Array(0)), 0)
	const full = timeDomainRms(sine(1))
	assert.ok(full > 0.65 && full < 0.75, `sine RMS ≈ 0.707, got ${full}`)
})

test('bandBinRanges are contiguous, non-empty, ascending and in bounds', () => {
	for (const [count, bins] of [
		[8, 1024],
		[12, 1024],
		[16, 64],
		[5, 8],
	]) {
		const ranges = bandBinRanges(count, bins, SAMPLE_RATE)
		assert.equal(ranges.length, count)
		ranges.forEach(([start, end], i) => {
			assert.ok(end > start, `band ${i} empty (${start}..${end})`)
			assert.ok(start >= 1 && end <= bins, `band ${i} out of bounds`)
			if (i > 0) assert.ok(start >= ranges[i - 1][0], 'bands must ascend')
		})
	}
})

test('follow attacks faster than it releases and is frame-rate independent', () => {
	const up = follow(0, 1, 16)
	const down = 1 - follow(1, 0, 16)
	assert.ok(up > down)
	// Two 8 ms steps land where one 16 ms step does.
	assert.ok(Math.abs(follow(follow(0, 1, 8), 1, 8) - up) < 1e-9)
})

test('silence stays at rest: no level, bands, beat or centroid', () => {
	const analyzer = createPulseAnalyzer({ bandCount: 8, sampleRate: SAMPLE_RATE, fftSize: FFT })
	const frame = run(
		analyzer,
		Array.from({ length: 120 }, () => [SILENT_FREQ, SILENT_TIME]),
	)
	assert.equal(frame.level, 0)
	assert.equal(frame.beat, 0)
	assert.equal(frame.centroid, 0)
	assert.deepEqual(frame.bands, new Array(8).fill(0))
	assert.ok(Math.abs(frame.time - 2) < 0.01)
})

test('low-level hiss is gated instead of being boosted by the AGC', () => {
	const analyzer = createPulseAnalyzer({ bandCount: 8, sampleRate: SAMPLE_RATE, fftSize: FFT })
	const hiss = spectrum(4000, 20000, 25)
	const frame = run(
		analyzer,
		Array.from({ length: 300 }, () => [hiss, SILENT_TIME]),
	)
	frame.bands.forEach((b, i) => assert.equal(b, 0, `band ${i}`))
})

test('bass energy drives the first band, treble the last', () => {
	const bass = createPulseAnalyzer({ bandCount: 8, sampleRate: SAMPLE_RATE, fftSize: FFT })
	const bassFrame = run(
		bass,
		Array.from({ length: 60 }, () => [spectrum(40, 70, 220), sine(0.5)]),
	)
	assert.ok(bassFrame.bands[0] > 0.8, `bass band ${bassFrame.bands[0]}`)
	assert.ok(bassFrame.bands[7] < 0.05)

	const treble = createPulseAnalyzer({ bandCount: 8, sampleRate: SAMPLE_RATE, fftSize: FFT })
	const trebleFrame = run(
		treble,
		Array.from({ length: 60 }, () => [spectrum(7000, 12000, 220), sine(0.5)]),
	)
	assert.ok(trebleFrame.bands[7] > 0.8, `treble band ${trebleFrame.bands[7]}`)
	assert.ok(trebleFrame.bands[0] < 0.05)
	assert.ok(trebleFrame.centroid > bassFrame.centroid + 0.5)
})

test('louder signal gives higher level', () => {
	const quiet = run(
		createPulseAnalyzer({ bandCount: 8, sampleRate: SAMPLE_RATE, fftSize: FFT }),
		Array.from({ length: 60 }, () => [SILENT_FREQ, sine(0.02)]),
	)
	const loud = run(
		createPulseAnalyzer({ bandCount: 8, sampleRate: SAMPLE_RATE, fftSize: FFT }),
		Array.from({ length: 60 }, () => [SILENT_FREQ, sine(0.4)]),
	)
	assert.ok(loud.level > quiet.level + 0.3, `${quiet.level} vs ${loud.level}`)
})

test('kicks are detected as beats and respect the refractory period', () => {
	const analyzer = createPulseAnalyzer({ bandCount: 8, sampleRate: SAMPLE_RATE, fftSize: FFT })
	const pad = spectrum(300, 3000, 90)
	const kick = spectrum(40, 140, 240, 0)
	for (let i = 0; i < BINS; i++) kick[i] = Math.max(kick[i], pad[i])

	// ~120 BPM: a kick every 30 frames (500 ms).
	let beats = 0
	let prevBeat = 0
	for (let f = 0; f < 240; f++) {
		const isKick = f % 30 === 0 && f > 0
		const frame = analyzer.step(isKick ? kick : pad, sine(0.3), FRAME_MS)
		if (frame.beat === 1 && prevBeat !== 1) beats++
		prevBeat = frame.beat
	}
	assert.ok(beats >= 6 && beats <= 7, `expected ~7 beats, got ${beats}`)

	// Kicks every 5 frames (~83 ms) are faster than the 250 ms refractory period.
	const fast = createPulseAnalyzer({ bandCount: 8, sampleRate: SAMPLE_RATE, fftSize: FFT })
	let fastBeats = 0
	for (let f = 0; f < 120; f++) {
		const frame = fast.step(f % 5 === 0 && f > 10 ? kick : pad, sine(0.3), FRAME_MS)
		if (frame.beat === 1) fastBeats++
	}
	assert.ok(fastBeats <= Math.ceil(2000 / 250), `refractory breached: ${fastBeats}`)
})

test('beat decays after a kick', () => {
	const analyzer = createPulseAnalyzer({ bandCount: 8, sampleRate: SAMPLE_RATE, fftSize: FFT })
	const pad = spectrum(300, 3000, 90)
	const kick = spectrum(40, 140, 240)
	run(
		analyzer,
		Array.from({ length: 30 }, () => [pad, sine(0.3)]),
	)
	assert.equal(analyzer.step(kick, sine(0.3), FRAME_MS).beat, 1)
	const later = run(
		analyzer,
		Array.from({ length: 30 }, () => [pad, sine(0.3)]),
	)
	assert.ok(later.beat < 0.1, `beat still ${later.beat}`)
})

test('huge frame gaps (tab resume) are clamped', () => {
	const analyzer = createPulseAnalyzer({ bandCount: 8, sampleRate: SAMPLE_RATE, fftSize: FFT })
	const frame = analyzer.step(SILENT_FREQ, SILENT_TIME, 60_000)
	assert.ok(frame.time <= 0.1)
})

test('returned frames are snapshots, not shared state', () => {
	const analyzer = createPulseAnalyzer({ bandCount: 4, sampleRate: SAMPLE_RATE, fftSize: FFT })
	const first = analyzer.step(spectrum(40, 70, 220), sine(0.5), FRAME_MS)
	const firstBands = first.bands.slice()
	analyzer.step(SILENT_FREQ, SILENT_TIME, FRAME_MS)
	assert.deepEqual(first.bands, firstBands)
	analyzer.current.bands[0] = 99
	assert.notEqual(analyzer.current.bands[0], 99)
})

test('music resuming after silence is not mistaken for a kick', () => {
	const analyzer = createPulseAnalyzer({ bandCount: 8, sampleRate: SAMPLE_RATE, fftSize: FFT })
	const music = spectrum(40, 3000, 150)
	run(
		analyzer,
		Array.from({ length: 60 }, () => [music, sine(0.3)]),
	)
	run(
		analyzer,
		Array.from({ length: 120 }, () => [SILENT_FREQ, SILENT_TIME]),
	)
	let beats = 0
	for (let f = 0; f < 30; f++) if (analyzer.step(music, sine(0.3), FRAME_MS).beat === 1) beats++
	assert.equal(beats, 0)
})
