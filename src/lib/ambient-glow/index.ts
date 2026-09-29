// Originally from https://codepen.io/luizcieslak/pen/bNeNKLK
import type { PulseFrame } from '../audio-pulse'

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
	/** How strongly setPulse() frames deform the glow; 0 = static. */
	pulseAmount?: number
}

export interface Rgb {
	r: number
	g: number
	b: number
}

export interface GlowHandle {
	setOptions(patch: Partial<GlowOptions>): void
	update(): void
	getColors(): Array<Rgb | null>
	/** The blobs currently rendered, majors first in rank order. */
	getBlobs(): GlowBlob[]
	/**
	 * Drive the glow from audio features. The first frame swaps the static layers
	 * for a per-blob layer animated with transform/opacity only; null swaps back.
	 */
	setPulse(frame: PulseFrame | null): void
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
	pulseAmount: 1,
}

export function extractColors(img: HTMLImageElement, userOptions: GlowOptions = {}): Array<Rgb | null> {
	if (!img.naturalWidth) return []
	const opts: Required<GlowOptions> = { ...DEFAULTS, ...userOptions }
	const canvas = document.createElement('canvas')
	const ctx = canvas.getContext('2d', { willReadFrequently: true })!
	return extractImageColors(img, opts, canvas, ctx)
}

export function mount(img: HTMLImageElement, userOptions: GlowOptions = {}): GlowHandle {
	const maybeParent = img.parentElement
	if (!maybeParent) throw new Error('ambient-glow: img must be attached to the DOM before mount()')
	const parent: HTMLElement = maybeParent

	let options: Required<GlowOptions> = { ...DEFAULTS, ...userOptions }
	let lastColors: Array<Rgb | null> = []
	let activeKey: 'a' | 'b' = 'a'
	let hasApplied = false

	// Pulse mode: layers with one element per major blob (plus one for the side
	// blooms) so audio frames only touch transform/opacity — no per-frame
	// gradient repaint or re-blur. Double-buffered like the static layers so a
	// new cover (e.g. a track change on /radio) crossfades instead of snapping.
	// Built lazily on the first frame.
	let pulseFrame: PulseFrame | null = null
	let pulseSlots: [PulseSlot, PulseSlot] | null = null
	let activePulse: 0 | 1 = 0

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
		const gradient = buildGradient(colors, options)
		const next = activeKey === 'a' ? layerB : layerA
		const prev = activeKey === 'a' ? layerA : layerB
		next.style.background = gradient
		// Only force the first reflow. Doing it for every slider tick makes the
		// interactive sandboxes stutter on lower-power/mobile browsers.
		if (!hasApplied) {
			void next.offsetHeight
			hasApplied = true
		}
		next.style.opacity = pulseFrame ? '0' : RESTING_OPACITY
		prev.style.opacity = '0'
		activeKey = activeKey === 'a' ? 'b' : 'a'
		if (pulseFrame && pulseSlots) {
			// Crossfade to freshly built pulse children, like the static layers do.
			const outgoing = pulseSlots[activePulse]
			activePulse = activePulse === 0 ? 1 : 0
			const incoming = pulseSlots[activePulse]
			fillPulseSlot(incoming)
			incoming.el.style.opacity = RESTING_OPACITY
			outgoing.el.style.opacity = '0'
			scheduleSlotClear(outgoing)
			renderPulse(pulseFrame)
		}
	}

	function ensurePulseSlots(): [PulseSlot, PulseSlot] {
		if (pulseSlots) return pulseSlots
		const make = (): PulseSlot => {
			const el = document.createElement('div')
			el.setAttribute('aria-hidden', 'true')
			stylePulseLayer(el, options)
			parent.insertBefore(el, img)
			return { el, blobs: [], majorEls: [], sideEl: null, clearTimer: null }
		}
		pulseSlots = [make(), make()]
		return pulseSlots
	}

	function fillPulseSlot(slot: PulseSlot) {
		if (slot.clearTimer !== null) {
			clearTimeout(slot.clearTimer)
			slot.clearTimer = null
		}
		slot.blobs = computeBlobs(lastColors, options)
		const majors = slot.blobs.filter(blob => blob.kind === 'major')
		const sides = slot.blobs.filter(blob => blob.kind === 'side')
		const children: HTMLDivElement[] = []

		// Side blooms only breathe with the bass as a group, so they share one
		// layer-sized element instead of costing a composited layer each.
		slot.sideEl = null
		if (sides.length) {
			slot.sideEl = createPulseChild(options.blur)
			slot.sideEl.style.inset = '0'
			slot.sideEl.style.background = sides.map(blob => blobGradient(blob)).join(', ')
			children.push(slot.sideEl)
		}

		// Each major blob gets a box exactly around its own ellipse rather than a
		// layer-sized one, to keep GPU memory small. No padding for the blur is
		// needed: filter output paints past the element's box.
		slot.majorEls = majors.map(blob => {
			const el = createPulseChild(options.blur)
			el.style.left = `${blob.x - blob.radiusX}%`
			el.style.top = `${blob.y - blob.radiusY}%`
			el.style.width = `${blob.radiusX * 2}%`
			el.style.height = `${blob.radiusY * 2}%`
			el.style.background = blobGradient(blob, '50% 50% at 50% 50%')
			return el
		})
		// The static string paints the first gradient on top; mirror that order.
		children.push(...[...slot.majorEls].reverse())
		slot.el.replaceChildren(...children)
	}

	// Drop a hidden slot's composited children once it has faded out, so they
	// don't hold GPU memory. Skipped if the slot became visible again meanwhile.
	function scheduleSlotClear(slot: PulseSlot) {
		if (slot.clearTimer !== null) clearTimeout(slot.clearTimer)
		slot.clearTimer = setTimeout(() => {
			slot.clearTimer = null
			if (pulseFrame && pulseSlots?.[activePulse] === slot) return
			slot.el.replaceChildren()
			slot.blobs = []
			slot.majorEls = []
			slot.sideEl = null
		}, options.fadeMs + 50)
	}

	function renderPulse(frame: PulseFrame) {
		// Render both slots so the outgoing one keeps moving while it fades.
		pulseSlots?.forEach(slot => {
			if (slot.majorEls.length === 0 && !slot.sideEl) return
			const t = pulseTransforms(slot.blobs, frame, options)
			slot.el.style.transform = `translate(-50%, -50%) scale(${t.layerScale})`
			if (slot.sideEl) slot.sideEl.style.transform = `scale(${t.sideScale})`
			slot.majorEls.forEach((el, i) => {
				const p = t.majors[i]
				if (!p) return
				el.style.transform = `translate(${p.dx}cqw, ${p.dy}cqh) scale(${p.scale})`
				el.style.opacity = `${p.opacity}`
			})
		})
	}

	function setPulse(frame: PulseFrame | null) {
		const active = activeKey === 'a' ? layerA : layerB
		if (!frame) {
			if (!pulseFrame) return
			pulseFrame = null
			pulseSlots?.forEach(slot => {
				slot.el.style.opacity = '0'
				scheduleSlotClear(slot)
			})
			if (hasApplied) active.style.opacity = RESTING_OPACITY
			return
		}

		const entering = !pulseFrame
		pulseFrame = frame
		if (entering) {
			const slots = ensurePulseSlots()
			// Always rebuild on entry: colours/options may have changed while the
			// previous children were fading out.
			fillPulseSlot(slots[activePulse])
			if (hasApplied) {
				slots[activePulse].el.style.opacity = RESTING_OPACITY
				active.style.opacity = '0'
			}
		}
		renderPulse(frame)
	}

	return {
		setOptions(patch) {
			options = { ...options, ...patch }
			// pulseAmount only scales the per-frame transforms: no geometry, no
			// rebuild, no crossfade. Just re-render the current frame.
			const keys = Object.keys(patch)
			if (keys.length > 0 && keys.every(k => k === 'pulseAmount')) {
				if (pulseFrame) renderPulse(pulseFrame)
				return
			}
			styleLayer(layerA, options)
			styleLayer(layerB, options)
			pulseSlots?.forEach(slot => stylePulseLayer(slot.el, options))
			const needsExtract = Object.keys(patch).some(k => EXTRACTION_KEYS.includes(k as keyof GlowOptions))
			schedule(needsExtract)
		},
		update() {
			schedule(true)
		},
		getColors() {
			return [...lastColors]
		},
		getBlobs() {
			return computeBlobs(lastColors, options)
		},
		setPulse,
		destroy() {
			img.removeEventListener('load', onLoad)
			if (pendingFrame !== null) cancelAnimationFrame(pendingFrame)
			layerA.remove()
			layerB.remove()
			pulseSlots?.forEach(slot => {
				if (slot.clearTimer !== null) clearTimeout(slot.clearTimer)
				slot.el.remove()
			})
		},
	}
}

function createLayer(opts: Required<GlowOptions>): HTMLDivElement {
	const el = document.createElement('div')
	el.setAttribute('aria-hidden', 'true')
	styleLayer(el, opts)
	return el
}

const RESTING_OPACITY = '0.8'

/** One buffer of the double-buffered pulse layer. */
interface PulseSlot {
	el: HTMLDivElement
	blobs: GlowBlob[]
	/** Aligned with the major blobs in `blobs`, in rank order. */
	majorEls: HTMLDivElement[]
	sideEl: HTMLDivElement | null
	clearTimer: ReturnType<typeof setTimeout> | null
}

function createPulseChild(blur: number): HTMLDivElement {
	const el = document.createElement('div')
	const s = el.style
	s.position = 'absolute'
	s.filter = `blur(${blur}px)`
	s.willChange = 'transform, opacity'
	s.pointerEvents = 'none'
	return el
}

/** Like styleLayer, minus filter/transform: blur lives on the children and the
 * transform is owned by the per-frame pulse render. */
function stylePulseLayer(el: HTMLDivElement, opts: Required<GlowOptions>) {
	const s = el.style
	s.position = 'absolute'
	s.top = '50%'
	s.left = '50%'
	if (!s.transform) s.transform = 'translate(-50%, -50%)'
	s.zIndex = '0'
	s.width = `${opts.sizeMultiplier * 100}%`
	s.height = `${Math.max(100, opts.verticalStretch * 100)}%`
	// Lets the children express shimmer offsets in cqw/cqh (% of this layer).
	s.containerType = 'size'
	// Scaled every frame while pulsing; keep it on its own compositor layer.
	s.willChange = 'transform'
	s.pointerEvents = 'none'
	s.transition = `opacity ${opts.fadeMs}ms ease`
	if (s.opacity === '') s.opacity = '0'
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

type GradientStop = { kind: 'color'; alpha: number; at: number } | { kind: 'transparent'; at: number }

/** One radial-gradient blob, in % of the glow layer. Shared by the static CSS
 * string and the per-blob pulse layer so both render the same geometry. */
export interface GlowBlob {
	kind: 'major' | 'side'
	/** Rank among blobs of the same kind (0 = most intense colour). */
	rank: number
	color: Rgb
	x: number
	y: number
	radiusX: number
	radiusY: number
	/** Colour stops, positions in % of the gradient ray. */
	stops: GradientStop[]
}

export function computeBlobs(colors: Array<Rgb | null>, opts: Required<GlowOptions>): GlowBlob[] {
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

	const blobs: GlowBlob[] = []
	const major = weighted.slice(0, opts.majorBlobCount)
	major.forEach((entry, rank) => {
		const seed = colorSeed(entry.color, entry.index)
		const x = clamp(
			50 + entry.centeredX * (24 * opts.horizontalStretch) + randomBetween(seed, -opts.jitter, opts.jitter),
			-opts.edgeBleed,
			100 + opts.edgeBleed,
		)
		const y = clamp(
			50 + entry.centeredY * 24 + randomBetween(seed + 1, -opts.jitter * 0.6, opts.jitter * 0.6),
			-12,
			112,
		)
		const radiusX = opts.majorBlobRadius * randomBetween(seed + 2, 0.9, 1.45) * opts.horizontalStretch
		const radiusY = opts.majorBlobRadius * randomBetween(seed + 3, 0.75, 1.25) * opts.verticalStretch
		const opacity = clamp(opts.majorBlobOpacity * randomBetween(seed + 4, 0.82, 1.08), 0.12, 0.95)
		const feather = clamp(opts.majorBlobFeather * randomBetween(seed + 5, 0.85, 1.15), radiusX + 10, 96)
		blobs.push({
			kind: 'major',
			rank,
			color: entry.color,
			x,
			y,
			radiusX,
			radiusY,
			stops: [
				{ kind: 'color', alpha: opacity, at: 0 },
				{ kind: 'color', alpha: opacity * 0.5, at: Math.max(radiusX * 0.55, 18) },
				{ kind: 'transparent', at: feather },
			],
		})
	})

	for (let i = 0; i < Math.min(opts.sideBloomCount, major.length); i++) {
		const entry = major[i]
		const seed = colorSeed(entry.color, entry.index + 91)
		const side = i % 2 === 0 ? -1 : 1
		const x =
			side < 0 ? randomBetween(seed, -opts.edgeBleed, 14) : randomBetween(seed, 86, 100 + opts.edgeBleed)
		const y = clamp(50 + entry.centeredY * 18 + randomBetween(seed + 1, -10, 10), 4, 96)
		const radiusX = opts.sideBloomRadius * randomBetween(seed + 2, 1.2, 1.8) * opts.horizontalStretch
		const radiusY = opts.sideBloomRadius * randomBetween(seed + 3, 0.75, 1.15) * opts.verticalStretch
		const opacity = clamp(opts.sideBloomOpacity * randomBetween(seed + 4, 0.8, 1.1), 0.08, 0.5)
		blobs.push({
			kind: 'side',
			rank: i,
			color: entry.color,
			x,
			y,
			radiusX,
			radiusY,
			stops: [
				{ kind: 'color', alpha: opacity, at: 0 },
				{ kind: 'transparent', at: 72 },
			],
		})
	}

	return blobs
}

/** CSS for one blob. `shape` defaults to the blob's own size/position in the layer. */
function blobGradient(
	blob: GlowBlob,
	shape = `${blob.radiusX}% ${blob.radiusY}% at ${blob.x}% ${blob.y}%`,
): string {
	const { r, g, b } = blob.color
	const stops = blob.stops
		.map(stop =>
			stop.kind === 'transparent'
				? `transparent ${stop.at}%`
				: `rgba(${r},${g},${b},${stop.alpha}) ${stop.at}%`,
		)
		.join(', ')
	return `radial-gradient(${shape}, ${stops})`
}

export function buildGradient(colors: Array<Rgb | null>, opts: Required<GlowOptions>): string {
	const blobs = computeBlobs(colors, opts)
	if (blobs.length === 0) return 'none'
	return blobs.map(blob => blobGradient(blob)).join(', ')
}

export interface BlobPulse {
	scale: number
	/** Offset in % of the glow layer (rendered as cqw/cqh). */
	dx: number
	dy: number
	opacity: number
}

export interface GlowPulse {
	layerScale: number
	/** Aligned with the major blobs, in rank order. */
	majors: BlobPulse[]
	sideScale: number
}

/**
 * Which spectrum band drives the major blob of this rank. Ranks are spread
 * across the whole spectrum: first blob = lowest band, last = highest.
 */
export function bandForRank(rank: number, majorCount: number, bandCount: number): number {
	if (majorCount <= 1 || bandCount <= 1) return 0
	return Math.round((rank * (bandCount - 1)) / (majorCount - 1))
}

/**
 * Map an audio frame onto per-blob deformations. Blob rank r (0 = most intense
 * colour) listens to the band at the same relative position, so bass drives the
 * dominant blob and treble the faintest. A silent frame is the identity.
 */
export function pulseTransforms(
	blobs: GlowBlob[],
	frame: PulseFrame,
	opts: Required<GlowOptions>,
): GlowPulse {
	const a = Math.max(0, opts.pulseAmount)
	const { bands, level, beat, centroid, time } = frame
	const n = bands.length
	const majors = blobs.filter(blob => blob.kind === 'major')
	const trebleStart = Math.ceil((n * 2) / 3)
	let treble = 0
	for (let i = trebleStart; i < n; i++) treble += bands[i]
	treble = n > trebleStart ? treble / (n - trebleStart) : 0
	const bass = n ? bands[0] : 0
	// Bright passages spread the blobs outwards, dull ones pull them in.
	const spread = a * 0.25 * (centroid - 0.4) * level

	return {
		layerScale: 1 + a * (0.12 * level + 0.08 * beat),
		sideScale: 1 + a * 0.2 * bass,
		majors: majors.map(blob => {
			const band = n ? bands[bandForRank(blob.rank, majors.length, n)] : 0
			const kick = beat * (blob.rank === 0 ? 0.15 : 0.06)
			const phase = time * (0.35 + 0.11 * blob.rank) * Math.PI * 2 + blob.rank * 1.7
			const wobble = a * treble * (2 + opts.jitter * 0.12)
			return {
				scale: 1 + a * (0.45 * band + kick),
				dx: (blob.x - 50) * spread + Math.sin(phase) * wobble,
				dy: Math.cos(phase * 0.8) * wobble * 0.6,
				opacity: 1 - Math.min(1, a) * 0.35 * (1 - band) * level,
			}
		}),
	}
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
