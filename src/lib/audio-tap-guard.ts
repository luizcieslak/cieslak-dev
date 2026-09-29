// Decision logic behind RadioPlayer's "tapped && wantPlaying ⇒ context running"
// invariant, kept free of Web Audio so every branch can be unit-tested.

export type TapMode = 'capture' | 'routed'

export interface MediaCaptureSupport {
	/** HTMLMediaElement.captureStream exists (Chromium). */
	captureStream: boolean
	/** HTMLMediaElement.mozCaptureStream exists (Gecko). */
	mozCaptureStream: boolean
}

/**
 * How (and whether) to tap the radio's <audio> for analysis.
 * - capture: element.captureStream(); the element keeps its own output. Safe everywhere it exists.
 * - routed: createMediaElementSource(); reroutes the element's output for good.
 *   Only Gecko is allowed: WebKit's MediaElementAudioSourceNode outputs silence
 *   for length-less (chunked) streams like /stream, which would mute the radio.
 *   (mozCaptureStream itself isn't used — it mutes the element — it just
 *   identifies Gecko by feature.)
 * - null: no safe tap (Safari, and every iOS browser since they're all WebKit).
 */
export function chooseTapMode(support: MediaCaptureSupport): TapMode | null {
	if (support.captureStream) return 'capture'
	if (support.mozCaptureStream) return 'routed'
	return null
}

export type TapGuardOutcome =
	/** Nothing to do: radio not wanted, or context already running. */
	| 'noop'
	/** resume() brought the context back. */
	| 'resumed'
	/** Couldn't resume, but that's safe (capture mode) or not decidable yet (hidden tab). */
	| 'left'
	/** Routed mode couldn't resume while visible: playback was stopped to avoid silent "playing". */
	| 'stopped'

export interface TapGuardDeps {
	mode: TapMode
	isRunning: () => boolean
	wantPlaying: () => boolean
	isVisible: () => boolean
	/** Resolves true only if the context ended up running (never rejects). */
	resume: () => Promise<boolean>
	stop: () => void
}

export async function guardTap(deps: TapGuardDeps): Promise<TapGuardOutcome> {
	if (!deps.wantPlaying() || deps.isRunning()) return 'noop'
	const running = await deps.resume()
	if (running) return 'resumed'
	// Re-read state after the await: the user may have stopped meanwhile.
	if (deps.mode !== 'routed' || !deps.wantPlaying() || !deps.isVisible()) return 'left'
	deps.stop()
	return 'stopped'
}

/** Race ctx.resume() against a timeout — without user activation it can hang instead of rejecting. */
export function resumeWithTimeout(
	ctx: Pick<AudioContext, 'resume' | 'state'>,
	timeoutMs: number,
): Promise<boolean> {
	return Promise.race([
		ctx.resume().then(
			() => true,
			() => false,
		),
		new Promise<boolean>(resolve => setTimeout(() => resolve(false), timeoutMs)),
	]).then(ok => ok && ctx.state === 'running')
}
