// Offline evaluation of the audio-reactive glow's drum detectors.
//
// Renders a synthetic boom-bap loop with KNOWN hit times (kick, snare, swung hats,
// a mellow pad and vinyl crackle), feeds it through an emulation of the browser's
// AnalyserNode at 60fps, runs the real analyzer (src/lib/audio-pulse.ts), and
// scores each detector's precision/recall against the truth. Optionally also
// reports hit rates on real MP3s (no ground truth there; compare with the tempo).
//
//   node scripts/pulse-eval.mjs                 # synthetic loop
//   node scripts/pulse-eval.mjs song.mp3 ...    # + hit rates on real tracks (needs ffmpeg)
import { execFileSync } from 'node:child_process'
import { createPulseAnalyzer } from '../src/lib/audio-pulse.ts'

const RATE = 48000
const FFT = 2048
const FPS = 60
const TOLERANCE_MS = 70

// --- synthetic boom bap -------------------------------------------------------

function renderLoop({ bpm = 88, bars = 16, seed = 1 } = {}) {
	let s = seed
	const random = () => {
		s = (s * 16807) % 2147483647
		return s / 2147483647
	}
	const beat = 60 / bpm
	const seconds = bars * 4 * beat + 1
	const pcm = new Float32Array(Math.ceil(seconds * RATE))
	const truth = { kick: [], snare: [], hat: [] }
	const add = (at, len, fn) => {
		const start = Math.round(at * RATE)
		for (let i = 0; i < len * RATE && start + i < pcm.length; i++) pcm[start + i] += fn(i / RATE)
	}
	const kick = at => {
		truth.kick.push(at)
		add(at, 0.35, t => 0.9 * Math.sin(2 * Math.PI * (48 + 90 * Math.exp(-t * 30)) * t) * Math.exp(-t * 9))
	}
	/** Noise pushed up the spectrum by repeated differencing (each pass ~ +6dB/oct). */
	const highNoise = order => {
		const history = new Array(order + 1).fill(0)
		return () => {
			history.unshift(random() * 2 - 1)
			history.length = order + 1
			// Binomial difference of the last order+1 samples.
			let out = 0
			let coeff = 1
			for (let i = 0; i <= order; i++) {
				out += (i % 2 ? -1 : 1) * coeff * history[i]
				coeff = (coeff * (order - i)) / (i + 1)
			}
			return out / 2 ** order
		}
	}
	const crackNoise = highNoise(2)
	const hatNoise = highNoise(5)
	const snare = at => {
		truth.snare.push(at)
		// A ~200Hz shell tone (the body) plus a noisy crack.
		add(
			at,
			0.25,
			t => 0.4 * Math.sin(2 * Math.PI * 200 * t) * Math.exp(-t * 25) + 0.9 * crackNoise() * Math.exp(-t * 16),
		)
	}
	const hat = (at, gain) => {
		truth.hat.push(at)
		add(at, 0.06, t => gain * 2.5 * hatNoise() * Math.exp(-t * 70))
	}
	// A plucked bassline that changes note on beats 1 and 3: its onsets sit in the
	// kick's range, which is exactly what a real lofi mix throws at the detector.
	const bassNotes = [55, 55, 73.4, 65.4, 49, 49, 61.7, 55]
	const bass = (at, hz) =>
		add(at, 2 * beat, t => 0.35 * Math.sin(2 * Math.PI * hz * t) * Math.min(1, t / 0.01) * Math.exp(-t * 1.2))
	for (let bar = 0; bar < bars; bar++) {
		const t0 = 0.5 + bar * 4 * beat
		// Boom-bap: kick on 1 and the "and" of 2 (and sometimes 3), snare on 2 and 4.
		kick(t0)
		kick(t0 + 1.5 * beat)
		if (bar % 2 === 1) kick(t0 + 2.5 * beat)
		snare(t0 + beat)
		snare(t0 + 3 * beat)
		// Offset a little from the kick so the bass onsets are separately testable.
		bass(t0 + 0.25 * beat, bassNotes[(bar * 2) % 8])
		bass(t0 + 2.25 * beat, bassNotes[(bar * 2 + 1) % 8])
		// Swung 8th hats (the off-beats land late), with accents.
		for (let e = 0; e < 8; e++) hat(t0 + (e * beat) / 2 + (e % 2 ? 0.08 * beat : 0), e % 2 ? 0.25 : 0.35)
	}
	// Mellow chord pad (sustained, changes every bar) and vinyl crackle.
	const chords = [
		[220, 277, 330],
		[196, 247, 294],
	]
	for (let i = 0; i < pcm.length; i++) {
		const t = i / RATE
		const chord = chords[Math.floor(t / (4 * beat)) % 2]
		for (const f of chord) pcm[i] += 0.05 * Math.sin(2 * Math.PI * f * t)
		if (random() < 0.0004) pcm[i] += (random() * 2 - 1) * 0.3
	}
	return { pcm, truth }
}

// --- AnalyserNode emulation ---------------------------------------------------

function fft(re, im) {
	const n = re.length
	for (let i = 1, j = 0; i < n; i++) {
		let bit = n >> 1
		for (; j & bit; bit >>= 1) j ^= bit
		j ^= bit
		if (i < j) {
			;[re[i], re[j]] = [re[j], re[i]]
			;[im[i], im[j]] = [im[j], im[i]]
		}
	}
	for (let len = 2; len <= n; len <<= 1) {
		const angle = (-2 * Math.PI) / len
		for (let i = 0; i < n; i += len) {
			for (let k = 0; k < len / 2; k++) {
				const cos = Math.cos(angle * k)
				const sin = Math.sin(angle * k)
				const ar = re[i + k + len / 2]
				const ai = im[i + k + len / 2]
				const tr = ar * cos - ai * sin
				const ti = ar * sin + ai * cos
				re[i + k + len / 2] = re[i + k] - tr
				im[i + k + len / 2] = im[i + k] - ti
				re[i + k] += tr
				im[i + k] += ti
			}
		}
	}
}

/**
 * The byte spectra an AnalyserNode (fftSize 2048, smoothingTimeConstant 0.3,
 * dB range -100..-30, Blackman window) would give a page reading it at 60fps.
 */
function* spectra(pcm) {
	const blackman = Float64Array.from({ length: FFT }, (_, i) => {
		const x = (2 * Math.PI * i) / FFT
		return 0.42 - 0.5 * Math.cos(x) + 0.08 * Math.cos(2 * x)
	})
	const smoothed = new Float64Array(FFT / 2)
	const hop = RATE / FPS
	for (let end = FFT; end < pcm.length; end += hop) {
		const start = Math.floor(end) - FFT
		const re = new Float64Array(FFT)
		const im = new Float64Array(FFT)
		const time = new Uint8Array(FFT)
		for (let i = 0; i < FFT; i++) {
			const x = pcm[start + i]
			re[i] = x * blackman[i]
			time[i] = Math.max(0, Math.min(255, Math.round(128 * (1 + x))))
		}
		fft(re, im)
		const freq = new Uint8Array(FFT / 2)
		for (let k = 0; k < FFT / 2; k++) {
			const mag = Math.hypot(re[k], im[k]) / FFT
			smoothed[k] = 0.3 * smoothed[k] + 0.7 * mag
			const db = 20 * Math.log10(smoothed[k] || 1e-12)
			freq[k] = Math.max(0, Math.min(255, Math.round((255 * (db + 100)) / 70)))
		}
		yield { t: end / RATE, freq, time }
	}
}

/** Steps `pcm` through the real analyzer the way the page does; returns detections (s). */
function analyse(pcm) {
	const analyzer = createPulseAnalyzer({ bandCount: 8, sampleRate: RATE, fftSize: FFT })
	const found = { kick: [], snare: [], hat: [] }
	let prev = { beat: 0, snare: 0, hat: 0 }
	for (const { t, freq, time } of spectra(pcm)) {
		const frame = analyzer.step(freq, time, 1000 / FPS)
		const hat = frame.onsets[7] ?? 0
		if (frame.beat === 1 && prev.beat !== 1) found.kick.push(t)
		if (frame.snare === 1 && prev.snare !== 1) found.snare.push(t)
		if (hat === 1 && prev.hat !== 1) found.hat.push(t)
		prev = { beat: frame.beat, snare: frame.snare, hat }
	}
	return found
}

function score(found, truth) {
	const used = new Set()
	let hits = 0
	for (const t of found) {
		const match = truth.findIndex(
			(x, i) => !used.has(i) && Math.abs(x - t) * 1000 <= TOLERANCE_MS + 1000 / FPS,
		)
		if (match >= 0) {
			used.add(match)
			hits++
		}
	}
	return {
		detected: found.length,
		truth: truth.length,
		precision: found.length ? +(hits / found.length).toFixed(2) : 0,
		recall: truth.length ? +(hits / truth.length).toFixed(2) : 0,
	}
}

const { pcm, truth } = renderLoop()
const found = analyse(pcm)
console.log('synthetic boom bap @88 BPM, 16 bars:')
for (const drum of ['kick', 'snare', 'hat'])
	console.log(`  ${drum.padEnd(5)}`, JSON.stringify(score(found[drum], truth[drum])))

for (const file of process.argv.slice(2)) {
	const raw = execFileSync(
		'ffmpeg',
		['-v', 'error', '-i', file, '-t', '60', '-ac', '1', '-ar', String(RATE), '-f', 'f32le', '-'],
		{
			maxBuffer: 1 << 30,
		},
	)
	const song = new Float32Array(raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.length))
	const hits = analyse(song)
	const seconds = song.length / RATE
	const rate = list => +(list.length / seconds).toFixed(2)
	console.log(
		`${file.split('/').pop()} (first ${Math.round(seconds)}s): per second`,
		JSON.stringify({ kick: rate(hits.kick), snare: rate(hits.snare), hat: rate(hits.hat) }),
	)
}
