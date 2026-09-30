// Drives a mounted ambient glow from the radio's audio analyser. Shared by the
// blog sandbox and the /radio page so the loop, the silence-fed tail and — most
// importantly — the opt-in tap sequence live in exactly one place.
import type { GlowHandle } from './ambient-glow'
import {
	createPulseAnalyzer,
	isAtRest,
	type DrumDetection,
	type PulseAnalyzer,
	type PulseFrame,
} from './audio-pulse'
import type { AnalysisResult, RadioPlayer, RadioState } from './radio-player'

const BAND_COUNT = 8

export interface PulseDriverOptions {
	glow: GlowHandle
	player: RadioPlayer
	/** Element whose visibility gates the loop (off-screen = no frames). */
	observe: Element
	/** Current pulse strength; 0 stops all motion immediately (no tail). */
	getAmount: () => number
	/** Called with every frame, e.g. to draw a spectrum. */
	onFrame?: (frame: PulseFrame) => void
	/** Called whenever the radio state changes. */
	onState?: (state: RadioState) => void
	/** Release/decay scale for the audio analyzer (see PulseAnalyzer.setSmoothing); default 1. */
	smoothing?: number
	/** Drum-detector threshold overrides (experiments). */
	detection?: Partial<DrumDetection>
}

export interface PulseDriver {
	hasAnalyser(): boolean
	/**
	 * The only sanctioned way to tap the radio's audio. MUST be called
	 * synchronously from a click handler: enableAnalysis() runs first so the
	 * AudioContext starts inside the gesture and the stream opens in CORS mode,
	 * then the radio starts if it was stopped.
	 */
	requestTap(): Promise<AnalysisResult>
	/** Re-read getAmount() and start/stop the loop accordingly. */
	refresh(): void
	/** Change the analyzer's release/decay scale live. */
	setSmoothing(scale: number): void
	/** Change drum-detector thresholds live (restarts detection from rest). */
	setDetection(detection: Partial<DrumDetection>): void
	destroy(): void
}

export function createPulseDriver(options: PulseDriverOptions): PulseDriver {
	const { glow, player, observe, getAmount, onFrame, onState } = options
	let smoothing = options.smoothing ?? 1
	let detection = options.detection ?? {}

	let analyser: AnalyserNode | null = null
	let pulse: PulseAnalyzer | null = null
	let freq = new Uint8Array(0)
	let time = new Uint8Array(0)
	let state: RadioState = player.getState()
	let inView = false
	let rafId: number | null = null
	let lastTs = 0
	let destroyed = false

	const useAnalyser = (node: AnalyserNode) => {
		analyser = node
		pulse = createPulseAnalyzer({
			bandCount: BAND_COUNT,
			sampleRate: node.context.sampleRate,
			fftSize: node.fftSize,
			detection,
		})
		pulse.setSmoothing(smoothing)
		freq = new Uint8Array(node.frequencyBinCount)
		time = new Uint8Array(node.fftSize)
	}
	const existing = player.getAnalyser()
	if (existing) useAnalyser(existing)

	const stopNow = () => {
		lastTs = 0
		// Stopping without the silence-fed tail would freeze the envelopes
		// mid-swell and replay them later; start the next run from rest.
		if (analyser) useAnalyser(analyser)
		glow.setPulse(null)
	}

	const tick = (ts: number) => {
		rafId = null
		if (!analyser || !pulse) return
		if (!inView || getAmount() === 0) return stopNow()
		const dt = lastTs ? ts - lastTs : 1000 / 60
		lastTs = ts
		const live = state.playing
		if (live) {
			analyser.getByteFrequencyData(freq)
			analyser.getByteTimeDomainData(time)
		} else {
			// Paused: feed silence so the envelopes ease the glow back to rest.
			freq.fill(0)
			time.fill(128)
		}
		const frame = pulse.step(freq, time, dt)
		onFrame?.(frame)
		if (!live && isAtRest(frame)) {
			lastTs = 0
			glow.setPulse(null)
			return
		}
		glow.setPulse(frame)
		rafId = requestAnimationFrame(tick)
	}

	const ensureLoop = () => {
		if (destroyed || rafId !== null || !analyser || !pulse || !inView) return
		if (getAmount() === 0) {
			// Only reset if something is actually moving; emits are frequent enough
			// not to reallocate the analyzer on every one while the pulse is off.
			if (!isAtRest(pulse.current)) stopNow()
			return
		}
		if (!state.playing && isAtRest(pulse.current)) return
		rafId = requestAnimationFrame(tick)
	}

	const unsubscribe = player.subscribe(next => {
		// Adopt a tap made elsewhere (another surface, or one still pending when
		// this page mounted): enableAnalysis() doesn't emit, but playback does.
		if (!analyser) {
			const tapped = player.getAnalyser()
			if (tapped) useAnalyser(tapped)
		}
		state = next
		onState?.(next)
		ensureLoop()
	})

	// rAF already stops in hidden tabs; this also pauses it while scrolled away.
	const observer = new IntersectionObserver(entries => {
		inView = entries.some(entry => entry.isIntersecting)
		ensureLoop()
	})
	observer.observe(observe)

	return {
		hasAnalyser: () => analyser !== null,
		requestTap() {
			const pending = player.enableAnalysis()
			if (!player.getState().wantPlaying) player.toggle()
			return pending.then(result => {
				if (result.ok && !destroyed) {
					useAnalyser(result.analyser)
					ensureLoop()
				}
				return result
			})
		},
		refresh: ensureLoop,
		setSmoothing(scale) {
			smoothing = scale
			pulse?.setSmoothing(scale)
		},
		setDetection(next) {
			detection = next
			if (analyser) useAnalyser(analyser)
		},
		destroy() {
			destroyed = true
			unsubscribe()
			observer.disconnect()
			if (rafId !== null) cancelAnimationFrame(rafId)
			glow.setPulse(null)
		},
	}
}

// Session-scoped choice for the /radio pulse toggle. It lives on window so it
// survives Astro client-side navigation, like the player singleton, and resets
// on a full reload, like the tap itself.
export type PulseIntent = 'on' | 'off'

declare global {
	interface Window {
		__radioPulseIntent?: PulseIntent
	}
}

export function getPulseIntent(): PulseIntent | null {
	return window.__radioPulseIntent ?? null
}

export function setPulseIntent(intent: PulseIntent): void {
	window.__radioPulseIntent = intent
}
