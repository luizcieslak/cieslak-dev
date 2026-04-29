export type RadioTrack = {
	title?: string
	artist?: string
	album?: string
	albumArtUrl?: string
	coverUrl?: string
}

export type RadioState = {
	wantPlaying: boolean
	playing: boolean
	track: RadioTrack | null
}

export type RadioPlayer = {
	toggle: () => void
	getState: () => RadioState
	subscribe: (listener: (state: RadioState) => void) => () => void
}

type Internal = {
	api: string
	audio: HTMLAudioElement
	listeners: Set<(state: RadioState) => void>
	state: RadioState
	reconnectAttempt: number
	reconnectTimer: ReturnType<typeof setTimeout> | null
	wakeLock: WakeLockSentinel | null
	events: EventSource | null
}

const BASE_BACKOFF_MS = 1000
const MAX_BACKOFF_MS = 30000

declare global {
	interface Window {
		__radioPlayer?: RadioPlayer
	}
}

export function getRadioPlayer(audio: HTMLAudioElement, api: string): RadioPlayer {
	if (window.__radioPlayer) return window.__radioPlayer

	const internal: Internal = {
		api,
		audio,
		listeners: new Set(),
		state: { wantPlaying: false, playing: false, track: null },
		reconnectAttempt: 0,
		reconnectTimer: null,
		wakeLock: null,
		events: null,
	}

	audio.volume = 0.7
	audio.preload = 'none'

	const emit = () => {
		const snapshot = { ...internal.state }
		internal.listeners.forEach(l => l(snapshot))
	}

	const setTrack = (track: RadioTrack | null | undefined) => {
		if (!track) return
		internal.state = { ...internal.state, track }
		updateMediaSession(track)
		emit()
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
		if (internal.reconnectTimer) {
			clearTimeout(internal.reconnectTimer)
			internal.reconnectTimer = null
		}
		audio.src = internal.api + '/stream?t=' + Date.now()
		audio.play().catch(() => scheduleReconnect())
	}

	const scheduleReconnect = () => {
		if (!internal.state.wantPlaying || internal.reconnectTimer) return
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
		void releaseWakeLock()
		audio.pause()
		audio.removeAttribute('src')
		audio.load()
		if ('mediaSession' in navigator) {
			navigator.mediaSession.playbackState = 'paused'
		}
		emit()
	}

	const toggle = () => {
		if (!internal.state.wantPlaying) {
			internal.state = { ...internal.state, wantPlaying: true }
			void requestWakeLock()
			connect()
			emit()
			return
		}
		stop()
	}

	audio.addEventListener('play', () => {
		internal.reconnectAttempt = 0
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
		if (internal.state.wantPlaying) scheduleReconnect()
	})

	audio.addEventListener('ended', () => scheduleReconnect())
	audio.addEventListener('error', () => scheduleReconnect())
	audio.addEventListener('stalled', () => scheduleReconnect())

	document.addEventListener('visibilitychange', () => {
		if (internal.state.wantPlaying && document.visibilityState === 'visible') {
			void requestWakeLock()
		}
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
	}

	window.__radioPlayer = player

	fetch(api + '/now-playing')
		.then(r => r.json())
		.then(data => setTrack(data && data.track))
		.catch(() => {})

	internal.events = new EventSource(api + '/now-playing/events')
	internal.events.onmessage = ev => {
		try {
			const data = JSON.parse(ev.data)
			setTrack(data.track || data)
		} catch {}
	}

	return player
}
