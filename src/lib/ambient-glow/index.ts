// Originally from https://codepen.io/luizcieslak/pen/bNeNKLK
export interface GlowOptions {
	gridSize?: number
	blur?: number
	fadeMs?: number
	sizeMultiplier?: number
	binSize?: number
	skipTransparent?: boolean
	skipBlack?: boolean
	blackThreshold?: number
	skipWhite?: boolean
	whiteThreshold?: number
	majorBlobCount?: number
	majorBlobOpacity?: number
	majorBlobRadius?: number
	majorBlobFeather?: number
	jitter?: number
	edgeBleed?: number
	horizontalStretch?: number
	verticalStretch?: number
	sideBloomCount?: number
	sideBloomOpacity?: number
	sideBloomRadius?: number
	/**
	 * Per-blob drift amplitude, in the same percentage units as `jitter`. 0 (the
	 * default) disables the animation entirely and renders exactly as before.
	 * Only used for recording promo videos — see docs/video-recording.md in the
	 * lofi-radio repo. Not enabled on any production surface.
	 */
	drift?: number
	/** Time multiplier for `drift`. 1 is a slow breathing drift. */
	driftSpeed?: number
}

export interface Rgb {
	r: number
	g: number
	b: number
}

export interface GlowHandle {
	setOptions(patch: Partial<GlowOptions>): void
	/**
	 * Start/stop the drift animation. Deliberately NOT driven by `setOptions`:
	 * the sandboxes call that on every slider tick, which would fight the loop
	 * for the layer it repaints.
	 */
	setDrift(enabled: boolean): void
	update(): void
	getColors(): Array<Rgb | null>
	destroy(): void
}

const EXTRACTION_KEYS: ReadonlyArray<keyof GlowOptions> = [
	'gridSize',
	'binSize',
	'skipTransparent',
	'skipBlack',
	'blackThreshold',
	'skipWhite',
	'whiteThreshold',
]

const DEFAULTS: Required<GlowOptions> = {
	gridSize: 4,
	blur: 40,
	fadeMs: 1000,
	sizeMultiplier: 1.5,
	binSize: 32,
	skipTransparent: true,
	skipBlack: true,
	blackThreshold: 20,
	skipWhite: true,
	whiteThreshold: 235,
	majorBlobCount: 5,
	majorBlobOpacity: 0.78,
	majorBlobRadius: 28,
	majorBlobFeather: 66,
	jitter: 18,
	edgeBleed: 22,
	horizontalStretch: 1.35,
	verticalStretch: 1.1,
	sideBloomCount: 2,
	sideBloomOpacity: 0.32,
	sideBloomRadius: 42,
	drift: 0,
	driftSpeed: 1,
}

export function extractColors(img: HTMLImageElement, userOptions: GlowOptions = {}): Array<Rgb | null> {
	if (!img.naturalWidth) return []
	const opts: Required<GlowOptions> = { ...DEFAULTS, ...userOptions }
	const canvas = document.createElement('canvas')
	const ctx = canvas.getContext('2d', { willReadFrequently: true })!
	return extractImageColors(img, opts, canvas, ctx)
}

// ~24fps. Each drift frame rebuilds a multi-stop radial-gradient string and
// repaints a heavily blurred layer, so the blur pass — not the string build — is
// the dominant cost. At a sub-pixel-per-frame drift on a blurred backdrop, 24fps
// is indistinguishable from 60 and buys real headroom at 1080x1920.
const DRIFT_FRAME_MS = 1000 / 24

export function mount(img: HTMLImageElement, userOptions: GlowOptions = {}): GlowHandle {
	const parent = img.parentElement
	if (!parent) throw new Error('ambient-glow: img must be attached to the DOM before mount()')

	let options: Required<GlowOptions> = { ...DEFAULTS, ...userOptions }
	let lastColors: Array<Rgb | null> = []
	let activeKey: 'a' | 'b' = 'a'
	let hasApplied = false
	// The layer currently faded IN. `activeKey` can't serve this purpose: apply()
	// writes to the layer that is *not* activeKey and only flips afterwards, so
	// activeKey names the visible layer only between flips. The drift loop needs
	// an unambiguous answer on every frame, including mid-apply.
	let visibleLayer: HTMLDivElement | null = null
	let driftFrame: number | null = null
	let driftOrigin = 0
	let lastDriftPaint = -Infinity
	let destroyed = false

	const layerA = createLayer(options)
	const layerB = createLayer(options)
	parent.insertBefore(layerA, img)
	parent.insertBefore(layerB, img)

	const canvas = document.createElement('canvas')
	const ctx = canvas.getContext('2d', { willReadFrequently: true })!

	let pendingFrame: number | null = null
	let pendingExtract = false

	const onLoad = () => schedule(true)
	img.addEventListener('load', onLoad)
	if (img.complete && img.naturalWidth) schedule(true)

	function schedule(needsExtract: boolean) {
		if (needsExtract) pendingExtract = true
		if (pendingFrame !== null) return
		pendingFrame = requestAnimationFrame(() => {
			pendingFrame = null
			const doExtract = pendingExtract
			pendingExtract = false
			if (doExtract) extract()
			else apply(lastColors)
		})
	}

	function extract() {
		if (!img.naturalWidth) return
		lastColors = extractImageColors(img, options, canvas, ctx)
		if (lastColors.length === 0) return
		apply(lastColors)
	}

	function apply(colors: Array<Rgb | null>) {
		// Paint at the CURRENT drift phase, not phase 0. A track change while
		// drifting crossfades to the other layer, and that layer has to come in
		// already at the phase the drift loop is about to keep painting — otherwise
		// it fades in at the phase-0 positions and snaps on the next drift frame,
		// a visible jump exactly at the crossfade.
		const gradient = buildGradient(colors, options, currentPhase())
		const next = activeKey === 'a' ? layerB : layerA
		const prev = activeKey === 'a' ? layerA : layerB
		next.style.background = gradient
		// Only force the first reflow. Doing it for every slider tick makes the
		// interactive sandboxes stutter on lower-power/mobile browsers.
		if (!hasApplied) {
			void next.offsetHeight
			hasApplied = true
		}
		next.style.opacity = '0.8'
		prev.style.opacity = '0'
		activeKey = activeKey === 'a' ? 'b' : 'a'
		visibleLayer = next
		// Yield the incoming layer past THIS frame batch: both this and driftTick run
		// from rAF, so otherwise they can land in the same batch and drift would
		// immediately overwrite the gradient apply() just faded in.
		//
		// Capped at half an interval rather than a full one so repeated applies can't
		// compound into starving drift entirely. That matters if a consumer ever
		// drives setOptions per frame (the sandbox's coalesced slider drag) with
		// drift on: a full-interval stamp at >24Hz would silently mean zero drift
		// frames for the whole drag. No consumer does both today.
		lastDriftPaint = Math.max(lastDriftPaint, performance.now() - DRIFT_FRAME_MS / 2)
	}

	function currentPhase() {
		return driftFrame === null ? 0 : (performance.now() - driftOrigin) / 1000
	}

	function driftTick(now: number) {
		driftFrame = requestAnimationFrame(driftTick)
		if (now - lastDriftPaint < DRIFT_FRAME_MS) return
		lastDriftPaint = now
		// No-op until at least one apply() has landed: before that there is no
		// visible layer, and writing a background would race the first-reflow.
		if (!visibleLayer || lastColors.length === 0) return
		// Read visibleLayer/lastColors fresh each frame so a track change (which
		// re-extracts and crossfades to the other layer) is picked up on the next
		// frame. `phase` deliberately runs continuously across track changes —
		// resetting it would jump every blob at the exact moment of the crossfade.
		visibleLayer.style.background = buildGradient(lastColors, options, (now - driftOrigin) / 1000)
	}

	function stopDrift() {
		if (driftFrame === null) return
		cancelAnimationFrame(driftFrame)
		driftFrame = null
	}

	return {
		setDrift(enabled) {
			if (!enabled) {
				stopDrift()
				return
			}
			if (destroyed || driftFrame !== null) return
			// Checked once, not per frame. A recording-only feature doesn't need to
			// react to the setting changing mid-capture. Fails CLOSED: an environment
			// without matchMedia can't tell us motion is wanted, so we don't animate.
			if (typeof window.matchMedia !== 'function') return
			if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
			driftOrigin = performance.now()
			// Sentinel, not a timestamp: `now - -Infinity` is always past the throttle,
			// so the first frame paints regardless of how long the page has been open.
			lastDriftPaint = -Infinity
			driftFrame = requestAnimationFrame(driftTick)
		},
		setOptions(patch) {
			options = { ...options, ...patch }
			styleLayer(layerA, options)
			styleLayer(layerB, options)
			const needsExtract = Object.keys(patch).some(k => EXTRACTION_KEYS.includes(k as keyof GlowOptions))
			schedule(needsExtract)
		},
		update() {
			schedule(true)
		},
		getColors() {
			return [...lastColors]
		},
		destroy() {
			img.removeEventListener('load', onLoad)
			destroyed = true
			stopDrift()
			// Dropped so a later setDrift(true) can't restart the loop against the
			// detached layers below — the handle has to be genuinely inert after this.
			visibleLayer = null
			if (pendingFrame !== null) cancelAnimationFrame(pendingFrame)
			layerA.remove()
			layerB.remove()
		},
	}
}

function createLayer(opts: Required<GlowOptions>): HTMLDivElement {
	const el = document.createElement('div')
	el.setAttribute('aria-hidden', 'true')
	styleLayer(el, opts)
	return el
}

function styleLayer(el: HTMLDivElement, opts: Required<GlowOptions>) {
	const s = el.style
	s.position = 'absolute'
	s.top = '50%'
	s.left = '50%'
	s.transform = 'translate(-50%, -50%)'
	s.zIndex = '0'
	s.width = `${opts.sizeMultiplier * 100}%`
	s.height = `${Math.max(100, opts.verticalStretch * 100)}%`
	s.filter = `blur(${opts.blur}px)`
	s.pointerEvents = 'none'
	s.transition = `opacity ${opts.fadeMs}ms ease`
	if (s.opacity === '') s.opacity = '0'
}

function extractImageColors(
	img: HTMLImageElement,
	opts: Required<GlowOptions>,
	canvas: HTMLCanvasElement,
	ctx: CanvasRenderingContext2D,
): Array<Rgb | null> {
	const maxSide = Math.max(96, Math.min(360, opts.gridSize * 8))
	const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight))
	canvas.width = Math.max(opts.gridSize, Math.round(img.naturalWidth * scale))
	canvas.height = Math.max(opts.gridSize, Math.round(img.naturalHeight * scale))
	ctx.clearRect(0, 0, canvas.width, canvas.height)
	try {
		ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
	} catch {
		// CORS-tainted canvas; consumer must set crossorigin + server CORS headers
		return []
	}
	return extractGridColors(ctx.getImageData(0, 0, canvas.width, canvas.height), opts)
}

function extractGridColors(imageData: ImageData, opts: Required<GlowOptions>): Array<Rgb | null> {
	const { gridSize } = opts
	const cellW = Math.max(1, Math.floor(imageData.width / gridSize))
	const cellH = Math.max(1, Math.floor(imageData.height / gridSize))
	const out: Array<Rgb | null> = []
	for (let row = 0; row < gridSize; row++) {
		for (let col = 0; col < gridSize; col++) {
			const x0 = col * cellW
			const y0 = row * cellH
			const x1 = col === gridSize - 1 ? imageData.width : x0 + cellW
			const y1 = row === gridSize - 1 ? imageData.height : y0 + cellH
			out.push(dominantColor(imageData, x0, y0, x1, y1, opts))
		}
	}
	return out
}

function dominantColor(
	imageData: ImageData,
	x0: number,
	y0: number,
	x1: number,
	y1: number,
	opts: Required<GlowOptions>,
): Rgb | null {
	const { binSize, skipTransparent, skipBlack, blackThreshold, skipWhite, whiteThreshold } = opts
	const { data, width } = imageData
	const counts = new Map<string, number>()
	for (let y = y0; y < y1; y++) {
		let i = (y * width + x0) * 4
		const end = (y * width + x1) * 4
		for (; i < end; i += 4) {
			const r = data[i]
			const g = data[i + 1]
			const b = data[i + 2]
			const a = data[i + 3]
			if (skipTransparent && a < 128) continue
			const lum = 0.299 * r + 0.587 * g + 0.114 * b
			if (skipBlack && lum < blackThreshold) continue
			if (skipWhite && lum > whiteThreshold) continue
			const key = `${Math.floor(r / binSize)},${Math.floor(g / binSize)},${Math.floor(b / binSize)}`
			counts.set(key, (counts.get(key) || 0) + 1)
		}
	}
	let bestKey: string | null = null
	let bestCount = 0
	for (const [key, count] of counts) {
		if (count > bestCount) {
			bestCount = count
			bestKey = key
		}
	}
	if (!bestKey) return null
	const [br, bg, bb] = bestKey.split(',').map(Number)
	return { r: br * binSize, g: bg * binSize, b: bb * binSize }
}

/**
 * Per-blob drift offset. The frequencies and phase offsets are seeded (so each
 * blob keeps its own stable, independent motion), but the time term is
 * continuous — so blobs drift smoothly instead of re-rolling discontinuously
 * the way changing `jitter` would.
 *
 * `drift: 0` renders byte-identically to the pre-drift version. That rests on
 * `randomBetween` being a pure function of its seed — there is no PRNG stream to
 * advance — so a drift-side draw can never perturb a static one, and on
 * `x + 0 === x`. (Exact cancellation to `-0`, the one value that would break it,
 * isn't reachable here: round-to-nearest gives `+0`.)
 *
 * DRIFT_SALT keeps drift draws clear of the static ones for legibility, NOT for
 * correctness — `colorSeed` is linear, so at fine `binSize` the salt spaces do
 * collide. A collision only means two independent reads are correlated, which at
 * `drift: 0` are never consumed. Don't treat this constant as load-bearing.
 */
const DRIFT_SALT = 401

function driftOffset(color: Rgb, index: number, phase: number, amplitude: number) {
	// Written as `!(amplitude > 0)` so NaN and negatives fall back to static too,
	// rather than emitting `NaN%` into the CSS. `Infinity` is excluded for the same
	// reason: `Infinity * 0` in the offset math is NaN.
	// At 0 this is a fast path rather than a correctness guard — `Math.sin(...) * 0`
	// is already `±0` and `x + ±0 === x` — but it matters for cost, since
	// buildGradient runs on every apply() for the consumers that never set `drift`.
	// `phase` is guarded alongside it: driftSpeed multiplies into it upstream, so a
	// non-finite speed would otherwise slip past the amplitude check.
	if (!(amplitude > 0) || !Number.isFinite(amplitude) || !Number.isFinite(phase)) return { x: 0, y: 0 }
	const seed = colorSeed(color, index + DRIFT_SALT)
	// Incommensurate frequencies, so a blob's path never visibly repeats within
	// the ~60s of a promo clip.
	const fx = randomBetween(seed, 0.031, 0.073)
	const fy = randomBetween(seed + 1, 0.037, 0.089)
	const px = randomBetween(seed + 2, 0, Math.PI * 2)
	const py = randomBetween(seed + 3, 0, Math.PI * 2)
	return {
		x: Math.sin(phase * fx * Math.PI * 2 + px) * amplitude,
		y: Math.cos(phase * fy * Math.PI * 2 + py) * amplitude * 0.6,
	}
}

function buildGradient(colors: Array<Rgb | null>, opts: Required<GlowOptions>, phase = 0): string {
	const weighted = colors
		.map((color, index) => {
			if (!color) return null
			const { row, col } = getGridPosition(index, opts.gridSize)
			const centeredX = ((col + 0.5) / opts.gridSize - 0.5) * 2
			const centeredY = ((row + 0.5) / opts.gridSize - 0.5) * 2
			const intensity =
				channelSpread(color) + saturation(color) * 0.8 + (1 - Math.min(Math.abs(centeredY), 1)) * 24
			return { color, index, row, col, centeredX, centeredY, intensity }
		})
		.filter((entry): entry is NonNullable<typeof entry> => entry !== null)
		.sort((a, b) => b.intensity - a.intensity)

	if (weighted.length === 0) return 'none'

	const parts: string[] = []
	// Resolved once. `driftSpeed` falls back to 1 rather than riding along as
	// undefined, so a partially-built options object degrades to unscaled drift
	// instead of silently killing all motion.
	const driftPhase = phase * (Number.isFinite(opts.driftSpeed) ? opts.driftSpeed : 1)
	const major = weighted.slice(0, opts.majorBlobCount)
	for (const entry of major) {
		const seed = colorSeed(entry.color, entry.index)
		const drift = driftOffset(entry.color, entry.index, driftPhase, opts.drift)
		const x = clamp(
			50 +
				entry.centeredX * (24 * opts.horizontalStretch) +
				randomBetween(seed, -opts.jitter, opts.jitter) +
				drift.x,
			-opts.edgeBleed,
			100 + opts.edgeBleed,
		)
		const y = clamp(
			50 + entry.centeredY * 24 + randomBetween(seed + 1, -opts.jitter * 0.6, opts.jitter * 0.6) + drift.y,
			-12,
			112,
		)
		const radiusX = opts.majorBlobRadius * randomBetween(seed + 2, 0.9, 1.45) * opts.horizontalStretch
		const radiusY = opts.majorBlobRadius * randomBetween(seed + 3, 0.75, 1.25) * opts.verticalStretch
		const opacity = clamp(opts.majorBlobOpacity * randomBetween(seed + 4, 0.82, 1.08), 0.12, 0.95)
		const feather = clamp(opts.majorBlobFeather * randomBetween(seed + 5, 0.85, 1.15), radiusX + 10, 96)
		parts.push(
			`radial-gradient(${radiusX}% ${radiusY}% at ${x}% ${y}%, rgba(${entry.color.r},${entry.color.g},${entry.color.b},${opacity}) 0%, rgba(${entry.color.r},${entry.color.g},${entry.color.b},${opacity * 0.5}) ${Math.max(radiusX * 0.55, 18)}%, transparent ${feather}%)`,
		)
	}

	for (let i = 0; i < Math.min(opts.sideBloomCount, major.length); i++) {
		const entry = major[i]
		const seed = colorSeed(entry.color, entry.index + 91)
		const side = i % 2 === 0 ? -1 : 1
		const x =
			side < 0 ? randomBetween(seed, -opts.edgeBleed, 14) : randomBetween(seed, 86, 100 + opts.edgeBleed)
		const bloomDrift = driftOffset(entry.color, entry.index + 91, driftPhase, opts.drift * 0.5)
		const y = clamp(50 + entry.centeredY * 18 + randomBetween(seed + 1, -10, 10) + bloomDrift.y, 4, 96)
		const radiusX = opts.sideBloomRadius * randomBetween(seed + 2, 1.2, 1.8) * opts.horizontalStretch
		const radiusY = opts.sideBloomRadius * randomBetween(seed + 3, 0.75, 1.15) * opts.verticalStretch
		const opacity = clamp(opts.sideBloomOpacity * randomBetween(seed + 4, 0.8, 1.1), 0.08, 0.5)
		parts.push(
			`radial-gradient(${radiusX}% ${radiusY}% at ${x}% ${y}%, rgba(${entry.color.r},${entry.color.g},${entry.color.b},${opacity}) 0%, transparent 72%)`,
		)
	}

	return parts.join(', ')
}

function getGridPosition(index: number, gridSize: number) {
	return {
		col: index % gridSize,
		row: Math.floor(index / gridSize),
	}
}

function colorSeed(color: Rgb, salt: number): number {
	return color.r * 3 + color.g * 5 + color.b * 7 + salt * 11
}

function randomBetween(seed: number, min: number, max: number): number {
	const value = Math.sin(seed * 12.9898) * 43758.5453
	const normalized = value - Math.floor(value)
	return min + normalized * (max - min)
}

function saturation(color: Rgb): number {
	const max = Math.max(color.r, color.g, color.b)
	const min = Math.min(color.r, color.g, color.b)
	if (max === 0) return 0
	return ((max - min) / max) * 100
}

function channelSpread(color: Rgb): number {
	return Math.max(color.r, color.g, color.b) - Math.min(color.r, color.g, color.b)
}

function clamp(value: number, min: number, max: number): number {
	return Math.min(Math.max(value, min), max)
}
