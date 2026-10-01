import { chooseTapMode, guardTap, resumeWithTimeout, type TapMode } from './audio-tap-guard'

export type RadioTrack = {
	/** Server-side path, e.g. "./songs/Novel.mp3"; its last segment is the filename. */
	path?: string
	title?: string
	artist?: string
	album?: string
	albumArtUrl?: string
	coverUrl?: string
	/**
	 * Styling the track asks for, set per-track in the radio server's admin UI.
	 * Absent means "no opinion" — leave the visitor's own theme alone.
	 */
	theme?: 'light' | 'dark'
}

export type RadioState = {
	wantPlaying: boolean
	playing: boolean
	hasInteracted: boolean
	track: RadioTrack | null
}

export type RadioPlayer = {
	toggle: () => void
	getState: () => RadioState
	subscribe: (listener: (state: RadioState) => void) => () => void
	/**
	 * Opt-in audio analysis for visualizers. Call it synchronously from a user
	 * gesture. Once it succeeds, the tap lasts for the page session (see AudioTap).
	 */
	enableAnalysis: () => Promise<AnalysisResult>
	/** The analyser if enableAnalysis() already succeeded, else null. */
	getAnalyser: () => AnalyserNode | null
	/**
	 * Whether enableAnalysis() could ever succeed in this browser. Known
	 * synchronously, so UIs can hide the feature instead of offering a dead end.
	 */
	canAnalyse: () => boolean
}

export type AnalysisFailure = Extract<AnalysisResult, { ok: false }>['reason']

export type AnalysisResult =
	| { ok: true; analyser: AnalyserNode }
	/**
	 * unsupported: no Web Audio, or no tap that can't mute the radio (WebKit). blocked: the context wouldn't start (no user
	 * activation) — retrying from a click can work. failed: tapping the element threw.
	 */
	| { ok: false; reason: 'unsupported' | 'blocked' | 'failed' }

/**
 * How the analyser is fed from the persisted <audio>:
 * - `capture` (Chromium): element.captureStream() feeds the analyser while the
 *   element keeps playing through its own output path, so a suspended context
 *   can only freeze the visual and never silence the radio.
 * - `routed` (Firefox only, see chooseTapMode): createMediaElementSource()
 *   reroutes the element's output through the context. It's permanent for the
 *   element, so this player must keep the context running whenever the radio
 *   should be audible.
 * Safari/iOS get no tap at all: WebKit's media-element source is silent for
 * chunked live streams, so routing would mute the radio.
 */
type AudioTap = {
	mode: TapMode
	ctx: AudioContext
	analyser: AnalyserNode
}

type CapturableAudio = HTMLAudioElement & { captureStream: () => MediaStream }

type Internal = {
	api: string
	audio: HTMLAudioElement
	listeners: Set<(state: RadioState) => void>
	state: RadioState
	reconnectAttempt: number
	reconnectTimer: ReturnType<typeof setTimeout> | null
	wakeLock: WakeLockSentinel | null
	events: EventSource | null
	heartbeatTimer: ReturnType<typeof setInterval> | null
	sseHeartbeatTimer: ReturnType<typeof setInterval> | null
	tap: AudioTap | null
	tapPending: Promise<AnalysisResult> | null
}

const BASE_BACKOFF_MS = 1000
const MAX_BACKOFF_MS = 30000
const HEARTBEAT_INTERVAL_MS = 150_000
const METADATA_RESUME_REFRESH_MIN_INTERVAL_MS = 5_000
// ctx.resume() can hang (not reject) when the browser withholds activation.
const AUDIO_RESUME_TIMEOUT_MS = 1000
const ANALYSER_FFT_SIZE = 2048

/**
 * Pinned mode's scene audio, for the promo-video recorder and the scene
 * editor's preview (see `createSceneAudio`).
 */
export type RadioScene = {
	/** Resolves once the source file is decoded; false if it couldn't be. */
	ready: Promise<boolean>
	/** Play the scene's audio (silently, into the analyser) from `atMs`. */
	play: (atMs: number) => void
	pause: () => void
}

declare global {
	interface Window {
		__radioPlayer?: RadioPlayer
		__radioScene?: RadioScene
	}
}

/**
 * Messages the scene editor (the parent frame) sends to a pinned preview, and
 * the one the preview sends back. Prefixed so they can't collide with anything
 * else posting to the window.
 */
type SceneMessage = { type: 'radio-scene:play'; atMs: number } | { type: 'radio-scene:pause' }

function readSceneMessage(data: unknown): SceneMessage | null {
	if (typeof data !== 'object' || data === null || !('type' in data)) return null
	if (data.type === 'radio-scene:pause') return { type: 'radio-scene:pause' }
	if (data.type === 'radio-scene:play' && 'atMs' in data && typeof data.atMs === 'number' && Number.isFinite(data.atMs)) {
		return { type: 'radio-scene:play', atMs: Math.max(0, data.atMs) }
	}
	return null
}

export function getRadioPlayer(audio: HTMLAudioElement, api: string): RadioPlayer {
	if (window.__radioPlayer) return window.__radioPlayer

	const internal: Internal = {
		api,
		audio,
		listeners: new Set(),
		state: { wantPlaying: false, playing: false, hasInteracted: false, track: null },
		reconnectAttempt: 0,
		reconnectTimer: null,
		wakeLock: null,
		events: null,
		heartbeatTimer: null,
		sseHeartbeatTimer: null,
		tap: null,
		tapPending: null,
	}

	audio.volume = 0.45
	audio.preload = 'none'

	// Recording-only pinned mode (`?track=<filename>`, lofi-radio's promo-video
	// workflow): show one specific track instead of whatever the station is
	// playing, without touching the stream or the live metadata feed. The recorder
	// and the scene editor's preview both open the page this way, so what is in
	// frame no longer depends on the broadcast. `?theme=` then wins over the
	// track's own theme, since a scene can ask for a different look than its track.
	const params = new URLSearchParams(location.search)
	const pinnedFilename = params.get('track')
	const themeParam = params.get('theme')
	const pinnedTheme: RadioTrack['theme'] = themeParam === 'light' || themeParam === 'dark' ? themeParam : undefined
	// `?at=<ms>`: where the scene starts, for a play click on a pinned page.
	const pinnedAtMs = Math.max(0, Number(params.get('at')) || 0)

	// Per-page-lifetime id so duplicated tabs cannot inherit the same sessionStorage
	// value and fight over one listener slot. Astro client-side navigation keeps
	// this singleton alive, so the id still survives normal in-site navigation.
	const sessionId = crypto.randomUUID()

	const emit = () => {
		const snapshot = { ...internal.state }
		internal.listeners.forEach(l => l(snapshot))
	}

	// Tracks can ask for a light/dark look, used when recording promo videos so the
	// page matches the song. Applied on CHANGE only, so it doesn't fight the
	// visitor's theme toggle: a manual click stands until the next track wants
	// something different. Deliberately not persisted to localStorage — the
	// visitor's own preference stays the stored one.
	let appliedTrackTheme: RadioTrack['theme'] | null = null

	const applyTrackTheme = (theme: RadioTrack['theme']) => {
		if (!theme || theme === appliedTrackTheme) return
		appliedTrackTheme = theme
		document.documentElement.classList.toggle('dark', theme === 'dark')
	}

	const setTrack = (track: RadioTrack | null | undefined) => {
		if (!track) return
		internal.state = { ...internal.state, track }
		updateMediaSession(track)
		applyTrackTheme(track.theme)
		emit()
	}

	const refreshNowPlaying = async () => {
		try {
			const response = await fetch(internal.api + '/now-playing?t=' + Date.now(), { cache: 'no-store' })
			if (!response.ok) return

			const data = await response.json()
			setTrack(data && data.track)
		} catch {}
	}

	const connectMetadataEvents = () => {
		internal.events?.close()
		// Pass the session id so the server can heartbeat-expire this SSE connection
		// if we vanish without a clean close (mobile sleep, dropped TCP). Without it,
		// silently-dropped SSE sockets leak on the server for ~11 min (OS keepalive).
		internal.events = new EventSource(
			internal.api + '/now-playing/events?sid=' + encodeURIComponent(sessionId),
		)
		internal.events.onmessage = ev => {
			try {
				const data = JSON.parse(ev.data)
				setTrack(data.track || data)
			} catch {}
		}
		startSSEHeartbeat()
	}

	/**
	 * Pinned mode plays the SCENE'S OWN AUDIO — the source file, decoded and
	 * started at the scene's offset — so the glow pulses to exactly the audio the
	 * recorder later muxes in, not to whatever the station is playing.
	 *
	 * It plays silently: the analyser feeds a zero-gain sink. In the editor's
	 * preview the editor itself is what you hear, and a recording takes its audio
	 * from the source file, so an audible copy here would only double it. Decoded
	 * rather than played through <audio> because the library is VBR, where element
	 * seeks are only as precise as the file's coarse Xing table — hundreds of ms
	 * off, which would put every kick out of step with the muxed audio.
	 */
	const createSceneAudio = (filename: string): { scene: RadioScene; analyser: AnalyserNode; resume: () => Promise<void> } => {
		const ctx = new AudioContext()
		const analyser = ctx.createAnalyser()
		analyser.fftSize = ANALYSER_FFT_SIZE
		analyser.smoothingTimeConstant = 0.3
		const sink = ctx.createGain()
		sink.gain.value = 0
		analyser.connect(sink).connect(ctx.destination)

		let buffer: AudioBuffer | null = null
		let source: AudioBufferSourceNode | null = null

		const setPlaying = (playing: boolean) => {
			internal.state = { ...internal.state, wantPlaying: playing, playing, hasInteracted: true }
			emit()
		}

		const stopSource = () => {
			if (!source) return
			const current = source
			source = null
			current.onended = null
			try {
				current.stop()
			} catch {}
		}

		const ready = (async () => {
			try {
				const url = `${internal.api}/api/tracks/${encodeURIComponent(filename)}/audio`
				const response = await fetch(url)
				if (!response.ok) throw new Error(`HTTP ${response.status}`)
				buffer = await ctx.decodeAudioData(await response.arrayBuffer())
				return true
			} catch (err) {
				console.error('[radio] could not load the pinned track audio', err)
				return false
			}
		})()

		const scene: RadioScene = {
			ready,
			play: atMs => {
				if (!buffer) return
				// Without activation (a cross-origin preview, a headless recorder) this
				// may not start; the editor's iframe allows autoplay and the recorder
				// launches with a no-gesture autoplay policy for exactly that reason.
				void ctx.resume()
				stopSource()
				const next = ctx.createBufferSource()
				next.buffer = buffer
				next.connect(analyser)
				next.onended = () => {
					if (source !== next) return
					source = null
					setPlaying(false)
				}
				next.start(0, Math.min(atMs / 1000, buffer.duration))
				source = next
				setPlaying(true)
			},
			pause: () => {
				stopSource()
				setPlaying(false)
			},
		}

		const resume = async () => {
			await ctx.resume()
		}

		return { scene, analyser, resume }
	}

	const pinnedScene = pinnedFilename ? createSceneAudio(pinnedFilename) : null

	const loadPinnedTrack = async (filename: string) => {
		try {
			const response = await fetch(internal.api + '/api/tracks', { cache: 'no-store' })
			if (!response.ok) throw new Error(`HTTP ${response.status}`)

			const data = await response.json()
			const tracks: RadioTrack[] = Array.isArray(data?.tracks) ? data.tracks : []
			const track = tracks.find(candidate => candidate.path?.split('/').pop() === filename)
			if (!track) {
				// Left blank on purpose: the recorder waits for the artwork, so a wrong
				// filename fails the render with this in the console instead of filming
				// some other track.
				console.error(`[radio] pinned track not found: ${filename}`)
				return
			}

			setTrack({ ...track, theme: pinnedTheme ?? track.theme })
		} catch (err) {
			console.error('[radio] could not load pinned track', err)
		}
	}

	let lastMetadataResumeRefreshAt = 0
	const refreshMetadataAfterResume = () => {
		if (pinnedFilename) return
		if (document.visibilityState !== 'visible') return

		const now = Date.now()
		if (now - lastMetadataResumeRefreshAt < METADATA_RESUME_REFRESH_MIN_INTERVAL_MS) return
		lastMetadataResumeRefreshAt = now

		void refreshNowPlaying()
		connectMetadataEvents()
	}

	const listenerUrl = (action: 'heartbeat' | 'end') => {
		return `${internal.api}/api/listeners/${action}?sid=${encodeURIComponent(sessionId)}`
	}

	const sendHeartbeat = () => {
		fetch(listenerUrl('heartbeat'), { method: 'POST', keepalive: true }).catch(() => {})
	}

	// The metadata SSE is open for the whole page lifetime (even before play), so it
	// needs its own heartbeat, separate from the play-gated listener heartbeat above.
	const sendSSEHeartbeat = () => {
		const url = `${internal.api}/api/sse/heartbeat?sid=${encodeURIComponent(sessionId)}`
		fetch(url, { method: 'POST', keepalive: true }).catch(() => {})
	}

	const startSSEHeartbeat = () => {
		if (internal.sseHeartbeatTimer) return
		sendSSEHeartbeat()
		internal.sseHeartbeatTimer = setInterval(sendSSEHeartbeat, HEARTBEAT_INTERVAL_MS)
	}

	const sendEnd = () => {
		const url = listenerUrl('end')
		if (navigator.sendBeacon?.(url)) return
		fetch(url, { method: 'POST', keepalive: true }).catch(() => {})
	}

	const startHeartbeat = () => {
		if (internal.heartbeatTimer) return
		sendHeartbeat()
		internal.heartbeatTimer = setInterval(sendHeartbeat, HEARTBEAT_INTERVAL_MS)
	}

	const stopHeartbeat = (notifyServer: boolean) => {
		if (internal.heartbeatTimer) {
			clearInterval(internal.heartbeatTimer)
			internal.heartbeatTimer = null
		}
		if (notifyServer) sendEnd()
	}

	const updateMediaSession = (track: RadioTrack) => {
		if (!('mediaSession' in navigator)) return
		const cover = track.albumArtUrl || track.coverUrl
		const artwork = cover
			? [96, 128, 192, 256, 384, 512].map(s => ({
					src: cover,
					sizes: `${s}x${s}`,
					type: 'image/jpeg',
				}))
			: undefined
		navigator.mediaSession.metadata = new MediaMetadata({
			title: track.title || 'lofi radio',
			artist: track.artist || 'cieslak.dev',
			album: track.album || '',
			artwork,
		})
	}

	const requestWakeLock = async () => {
		if (!internal.state.wantPlaying || !('wakeLock' in navigator) || internal.wakeLock) return
		try {
			internal.wakeLock = await navigator.wakeLock.request('screen')
			internal.wakeLock.addEventListener('release', () => {
				internal.wakeLock = null
			})
		} catch {}
	}

	const releaseWakeLock = async () => {
		if (!internal.wakeLock) return
		const lock = internal.wakeLock
		internal.wakeLock = null
		await lock.release().catch(() => {})
	}

	const connect = () => {
		// Every path that (re)opens /stream comes through here — the watchdog,
		// visibility and pageshow recovery included — so this one guard keeps a
		// pinned page off the broadcast whatever its playback state says.
		if (pinnedFilename) return
		if (internal.reconnectTimer) {
			clearTimeout(internal.reconnectTimer)
			internal.reconnectTimer = null
		}
		console.warn(`[radio] connect() attempt=${internal.reconnectAttempt}`)
		// Every way playback (re)starts funnels through here, so this is where a
		// routed tap's context is brought back up.
		ensureTapRunning()
		audio.src = internal.api + '/stream?sid=' + sessionId + '&hb=1&t=' + Date.now()
		audio.play().catch(err => {
			console.warn('[radio] play() rejected', err && err.name, err && err.message)
			scheduleReconnect()
		})
	}

	const scheduleReconnect = () => {
		if (!internal.state.wantPlaying || internal.reconnectTimer) return
		// While the tab is hidden the browser throttles the backgrounded <audio>
		// element and drains its shallow live-edge buffer, so reconnecting now just
		// re-drains and loops. Suspend reconnects until the tab is visible again;
		// the visibilitychange handler does one clean reconnect on resume.
		if (document.visibilityState === 'hidden') return
		const delay = Math.min(BASE_BACKOFF_MS * Math.pow(1.5, internal.reconnectAttempt), MAX_BACKOFF_MS)
		internal.reconnectAttempt++
		internal.reconnectTimer = setTimeout(connect, delay)
	}

	const stop = () => {
		internal.state = { ...internal.state, wantPlaying: false, playing: false }
		if (internal.reconnectTimer) {
			clearTimeout(internal.reconnectTimer)
			internal.reconnectTimer = null
		}
		internal.reconnectAttempt = 0
		stopHeartbeat(true)
		void releaseWakeLock()
		audio.pause()
		audio.removeAttribute('src')
		audio.load()
		// Free the audio device while the radio is off; connect() resumes it.
		void internal.tap?.ctx.suspend().catch(() => {})
		if ('mediaSession' in navigator) {
			navigator.mediaSession.playbackState = 'paused'
		}
		emit()
	}

	// Invariant for a routed tap: wantPlaying ⇒ context running. If the context
	// can't come back while the page is visible, stop instead of "playing" in
	// silence (the watchdog can't see that — currentTime keeps advancing). The
	// next play click is a user gesture, which lets resume() succeed.
	const ensureTapRunning = () => {
		const tap = internal.tap
		if (!tap) return
		void guardTap({
			mode: tap.mode,
			isRunning: () => tap.ctx.state === 'running',
			wantPlaying: () => internal.state.wantPlaying,
			isVisible: () => document.visibilityState === 'visible',
			resume: () => resumeWithTimeout(tap.ctx, AUDIO_RESUME_TIMEOUT_MS),
			stop,
		}).then(outcome => {
			if (outcome === 'stopped') console.warn(`[radio] audio context stuck in "${tap.ctx.state}", stopped`)
		})
	}

	const tapMode = (): TapMode | null => {
		if (typeof window.AudioContext !== 'function') return null
		return chooseTapMode({
			captureStream: canCapture(audio),
			mozCaptureStream: 'mozCaptureStream' in audio,
		})
	}

	const canCapture = (el: HTMLAudioElement): el is CapturableAudio =>
		'captureStream' in el && typeof el.captureStream === 'function'

	const attachCapture = (el: CapturableAudio, ctx: AudioContext, analyser: AnalyserNode) => {
		// Keep the graph pulled without making a second audible copy.
		const sink = ctx.createGain()
		sink.gain.value = 0
		analyser.connect(sink).connect(ctx.destination)

		const stream = el.captureStream()
		let source: MediaStreamAudioSourceNode | null = null
		// connect() swaps audio.src on every reconnect, which replaces the captured
		// track, so rebind the source whenever the track set changes.
		const rebind = () => {
			source?.disconnect()
			source = null
			const track = stream.getAudioTracks().find(t => t.readyState === 'live')
			if (!track) return
			source = ctx.createMediaStreamSource(new MediaStream([track]))
			source.connect(analyser)
		}
		stream.addEventListener('addtrack', rebind)
		stream.addEventListener('removetrack', rebind)
		rebind()
	}

	const enableAnalysis = (): Promise<AnalysisResult> => {
		// Pinned: the analyser is the scene audio's, ready as soon as it decodes.
		// Resumed here so a click inside the page counts as the activation.
		if (pinnedScene) {
			const { analyser, resume, scene } = pinnedScene
			void resume()
			return scene.ready.then((ok): AnalysisResult => (ok ? { ok: true, analyser } : { ok: false, reason: 'failed' }))
		}
		if (internal.tap) {
			ensureTapRunning()
			return Promise.resolve({ ok: true, analyser: internal.tap.analyser })
		}
		if (internal.tapPending) return internal.tapPending

		const mode = tapMode()
		if (!mode) return Promise.resolve({ ok: false, reason: 'unsupported' })

		// Analysis needs CORS-clean samples. Only opted-in listeners switch the
		// stream request to CORS mode (lofi-radio sends ACAO: *); reopen now if a
		// non-CORS stream is already loaded.
		if (audio.crossOrigin !== 'anonymous') {
			audio.crossOrigin = 'anonymous'
			if (internal.state.wantPlaying) connect()
		}

		// Created and resumed synchronously inside the caller's gesture.
		const ctx = new AudioContext()
		internal.tapPending = resumeWithTimeout(ctx, AUDIO_RESUME_TIMEOUT_MS).then((running): AnalysisResult => {
			internal.tapPending = null
			if (!running) {
				// Never route the element into a context that isn't running.
				void ctx.close().catch(() => {})
				return { ok: false, reason: 'blocked' }
			}
			const analyser = ctx.createAnalyser()
			analyser.fftSize = ANALYSER_FFT_SIZE
			// Light smoothing: the visualizer runs its own envelopes and needs
			// transients intact for beat detection.
			analyser.smoothingTimeConstant = 0.3

			try {
				switch (mode) {
					case 'capture':
						// Re-narrowed for the type; tapMode() only picks capture when this holds.
						if (!canCapture(audio)) throw new Error('captureStream vanished')
						attachCapture(audio, ctx, analyser)
						break
					case 'routed':
						ctx.createMediaElementSource(audio).connect(analyser)
						analyser.connect(ctx.destination)
						break
				}
			} catch (err) {
				console.warn('[radio] audio analysis unavailable', err)
				void ctx.close().catch(() => {})
				return { ok: false, reason: 'failed' }
			}
			internal.tap = { mode, ctx, analyser }
			ctx.addEventListener('statechange', ensureTapRunning)
			if (!internal.state.wantPlaying) void ctx.suspend().catch(() => {})
			return { ok: true, analyser }
		})
		return internal.tapPending
	}

	const toggle = () => {
		// Pinned mode never opens /stream: play/pause drives the scene's own audio,
		// starting at `?at=`.
		if (pinnedScene) {
			if (internal.state.wantPlaying) pinnedScene.scene.pause()
			else pinnedScene.scene.play(pinnedAtMs)
			return
		}
		if (!internal.state.wantPlaying) {
			internal.state = { ...internal.state, wantPlaying: true, hasInteracted: true }
			void requestWakeLock()
			connect()
			startHeartbeat()
			emit()
			return
		}
		stop()
	}

	audio.addEventListener('play', () => {
		internal.state = { ...internal.state, playing: true }
		void requestWakeLock()
		if ('mediaSession' in navigator) {
			navigator.mediaSession.playbackState = 'playing'
		}
		emit()
	})

	audio.addEventListener('pause', () => {
		internal.state = { ...internal.state, playing: false }
		if ('mediaSession' in navigator) {
			navigator.mediaSession.playbackState = 'paused'
		}
		emit()
		// Don't reconnect here: `pause` fires on our own src swaps and OS pauses.
		// Real underruns surface as `waiting`; the watchdog handles genuine stalls.
	})

	// Logs why each reconnect fired — esp. mediaError.code (code 3 = decode error at a
	// track-boundary format change). Kept in prod for ongoing diagnosis.
	const logReconnect = (trigger: string) => {
		const e = audio.error
		console.warn(
			`[radio] reconnect via ${trigger}`,
			`t=${audio.currentTime.toFixed(2)}`,
			`readyState=${audio.readyState}`,
			`networkState=${audio.networkState}`,
			e ? `mediaError.code=${e.code} (${e.message || 'no msg'})` : 'mediaError=none',
		)
	}

	// `ended`/`error` mean the connection dropped (or a track-boundary decode error,
	// recoverable only by reopening), so reconnect. We deliberately ignore
	// `stalled`/`waiting` — they're normal jitter on a shallow-buffer live stream.
	audio.addEventListener('ended', () => {
		logReconnect('ended')
		if (internal.state.wantPlaying) scheduleReconnect()
	})
	audio.addEventListener('error', () => {
		logReconnect('error')
		if (internal.state.wantPlaying) scheduleReconnect()
	})

	// Silent-death watchdog: if currentTime stops advancing for ~6s while we want to
	// play, the stream is dead with no event (mobile background / dropped TCP). Reconnect.
	let lastTime = 0
	let stalledTicks = 0
	setInterval(() => {
		if (!internal.state.wantPlaying || !internal.state.playing) {
			stalledTicks = 0
			lastTime = audio.currentTime
			return
		}
		if (audio.currentTime === lastTime) {
			if (++stalledTicks >= 3) {
				// ~6s of no progress
				stalledTicks = 0
				// A hidden tab stalls because the browser throttled it, not because
				// the stream died — reconnecting now would loop. Let it sit; the
				// visibilitychange handler reconnects once on resume.
				if (document.visibilityState === 'hidden') return
				logReconnect('watchdog-stall')
				connect()
			}
		} else {
			stalledTicks = 0
			internal.reconnectAttempt = 0 // reset backoff only on *real* progress
		}
		lastTime = audio.currentTime
	}, 2000)

	document.addEventListener('visibilitychange', () => {
		if (document.visibilityState === 'hidden') {
			// Going hidden: cancel any pending reconnect and reset backoff so we
			// don't churn while backgrounded. We keep wantPlaying true and leave the
			// (soon-to-stall) stream as-is; resume happens when we become visible.
			if (internal.reconnectTimer) {
				clearTimeout(internal.reconnectTimer)
				internal.reconnectTimer = null
			}
			internal.reconnectAttempt = 0
			return
		}

		// Becoming visible again.
		if (internal.state.wantPlaying) {
			void requestWakeLock()
			// A routed context can be suspended while hidden even though the element
			// kept "playing"; recheck it whether or not we reconnect below.
			ensureTapRunning()
			// The backgrounded stream almost certainly stalled/dropped. If the audio
			// isn't actively progressing, do exactly one clean reconnect to resume.
			if (audio.paused || audio.readyState < 3) {
				internal.reconnectAttempt = 0
				connect()
			}
		}
		refreshMetadataAfterResume()
	})

	window.addEventListener('focus', refreshMetadataAfterResume)

	window.addEventListener('pagehide', () => {
		if (internal.state.wantPlaying) stopHeartbeat(true)
	})

	window.addEventListener('pageshow', () => {
		refreshMetadataAfterResume()
		if (!internal.state.wantPlaying) return
		connect()
		startHeartbeat()
	})

	if ('mediaSession' in navigator) {
		navigator.mediaSession.setActionHandler('play', () => {
			if (!internal.state.wantPlaying) toggle()
		})
		navigator.mediaSession.setActionHandler('pause', () => {
			if (internal.state.wantPlaying) toggle()
		})
	}

	const player: RadioPlayer = {
		toggle,
		getState: () => ({ ...internal.state }),
		subscribe: listener => {
			internal.listeners.add(listener)
			listener({ ...internal.state })
			return () => internal.listeners.delete(listener)
		},
		enableAnalysis,
		getAnalyser: () => (pinnedScene ? pinnedScene.analyser : (internal.tap?.analyser ?? null)),
		canAnalyse: () => (pinnedScene ? true : tapMode() !== null),
	}

	window.__radioPlayer = player

	if (pinnedFilename && pinnedScene) {
		void loadPinnedTrack(pinnedFilename)

		// The recorder drives the scene through this hook; the scene editor, which
		// embeds the page in an iframe, drives it with postMessage and is told when
		// the audio is ready so it can sync a preview that is already playing.
		window.__radioScene = pinnedScene.scene
		const inFrame = window.parent !== window
		if (inFrame) {
			window.addEventListener('message', event => {
				if (event.source !== window.parent) return
				const message = readSceneMessage(event.data)
				if (message?.type === 'radio-scene:play') pinnedScene.scene.play(message.atMs)
				else if (message?.type === 'radio-scene:pause') pinnedScene.scene.pause()
			})
			void pinnedScene.scene.ready.then(ok => {
				if (ok) window.parent.postMessage({ type: 'radio-scene:ready' }, '*')
			})
		}
	} else {
		void refreshNowPlaying()
		connectMetadataEvents()
	}

	return player
}
