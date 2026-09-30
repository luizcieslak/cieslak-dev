// URL params for experimenting with the audio-reactive glow, shared by /radio and
// the blog sandbox. Pure (URLSearchParams only) so it can be unit-tested.
import { isPulseMode, type GlowOptions, type PulseMode } from './ambient-glow/index.ts'
import { DEFAULT_DRUM_DETECTION, type DrumDetection } from './audio-pulse.ts'

export type PulseKnob = 'pulseBass' | 'pulseTreble' | 'pulseKick' | 'pulseSnare' | 'pulseShimmer'

/** Knob params, in display order, with their slider ranges. */
export const PULSE_KNOBS: ReadonlyArray<{ key: PulseKnob; label: string; max: number }> = [
	{ key: 'pulseBass', label: 'Bass', max: 4 },
	{ key: 'pulseTreble', label: 'Treble', max: 4 },
	{ key: 'pulseKick', label: 'Kick', max: 4 },
	{ key: 'pulseSnare', label: 'Snare', max: 4 },
	{ key: 'pulseShimmer', label: 'Shimmer', max: 4 },
]

export const PULSE_SMOOTH_RANGE = { min: 0.25, max: 4 } as const

/** Drum-detector params (analyzer thresholds, not visual strength). */
export const PULSE_DETECTION_PARAMS: ReadonlyArray<{
	param: string
	key: keyof DrumDetection
	label: string
	min: number
	max: number
}> = [
	{ param: 'pulseKickShape', key: 'kickLowOverAir', label: 'Kick shape', min: 1, max: 6 },
	{ param: 'pulseSnareStrict', key: 'snareSensitivity', label: 'Snare strict', min: 1, max: 6 },
]

export interface PulseExperiment {
	/** Present only when `?pulseMode=` names a known mode. */
	mode?: PulseMode
	/** Only the knobs given (validly) in the URL; the rest keep their defaults. */
	knobs: Partial<Pick<Required<GlowOptions>, PulseKnob>>
	/** Release/decay scale for the analyzer (`?pulseSmooth=`); absent = 1. */
	smooth?: number
	/** Drum-detector thresholds given in the URL (`?pulseKickShape=`, `?pulseSnareStrict=`). */
	detection: Partial<DrumDetection>
}

function numberParam(params: URLSearchParams, name: string, min: number, max: number): number | undefined {
	const raw = params.get(name)
	if (raw === null || raw.trim() === '') return undefined
	const value = Number(raw)
	return Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : undefined
}

/**
 * Read `?pulseMode=`, the knob params and `?pulseSmooth=`. Invalid values are
 * ignored (not half-applied), so a typo falls back to the defaults.
 */
export function parsePulseExperiment(params: URLSearchParams): PulseExperiment {
	const experiment: PulseExperiment = { knobs: {}, detection: {} }
	const mode = params.get('pulseMode')
	if (isPulseMode(mode)) experiment.mode = mode
	for (const { key, max } of PULSE_KNOBS) {
		const value = numberParam(params, key, 0, max)
		if (value !== undefined) experiment.knobs[key] = value
	}
	const smooth = numberParam(params, 'pulseSmooth', PULSE_SMOOTH_RANGE.min, PULSE_SMOOTH_RANGE.max)
	if (smooth !== undefined) experiment.smooth = smooth
	for (const { param, key, min, max } of PULSE_DETECTION_PARAMS) {
		const value = numberParam(params, param, min, max)
		if (value !== undefined) experiment.detection[key] = value
	}
	return experiment
}

/** Whether the URL asks for the experiment controls at all. */
export function hasPulseExperiment(params: URLSearchParams): boolean {
	return (
		params.has('pulseMode') ||
		PULSE_KNOBS.some(({ key }) => params.has(key)) ||
		params.has('pulseSmooth') ||
		PULSE_DETECTION_PARAMS.some(({ param }) => params.has(param))
	)
}

/** The query string that reproduces an experiment (defaults omitted). */
export function pulseExperimentQuery(
	amount: number,
	mode: PulseMode,
	knobs: Partial<Record<PulseKnob, number>>,
	smooth: number,
	detection: Partial<DrumDetection> = {},
): string {
	const params = new URLSearchParams()
	params.set('pulse', String(amount))
	params.set('pulseMode', mode)
	for (const { key } of PULSE_KNOBS) {
		const value = knobs[key]
		if (value !== undefined && value !== 1) params.set(key, String(value))
	}
	if (smooth !== 1) params.set('pulseSmooth', String(smooth))
	for (const { param, key } of PULSE_DETECTION_PARAMS) {
		const value = detection[key]
		if (value !== undefined && value !== DEFAULT_DRUM_DETECTION[key]) params.set(param, String(value))
	}
	return params.toString()
}
