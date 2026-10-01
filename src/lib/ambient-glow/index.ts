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
	/** Which audio-reactive behaviour setPulse() frames drive (see PULSE_MODES). */
	pulseMode?: PulseMode
	/**
	 * Per-feature multipliers for experimenting (1 = the mode's default). Bass and
	 * treble weight the low/high bands, kick and snare the drum impulses, and
	 * shimmer the positional wobble.
	 */
	pulseBass?: number
	pulseTreble?: number
	pulseKick?: number
	pulseSnare?: number
	pulseShimmer?: number
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
	pulseMode: 'bands',
	pulseBass: 1,
	pulseTreble: 1,
	pulseKick: 1,
	pulseSnare: 1,
	pulseShimmer: 1,
	drift: 0,
	driftSpeed: 1,
}

// ~24fps. Each static drift frame rebuilds a multi-stop radial-gradient string
// and repaints a heavily blurred layer, so the blur pass — not the string build —
// is the dominant cost. At a sub-pixel-per-frame drift on a blurred backdrop,
// 24fps is indistinguishable from 60 and buys real headroom at 1080x1920. (While
// pulsing, drift rides along as a compositor transform at the pulse's own rate.)
const DRIFT_FRAME_MS = 1000 / 24

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

	// Pulse mode: layers with one element per blob, so audio frames only touch
	// transform/opacity — no per-frame gradient repaint or re-blur. Double-buffered like the static layers so a
	// new cover (e.g. a track change on /radio) crossfades instead of snapping.
	// Built lazily on the first frame.
	let pulseFrame: PulseFrame | null = null
	let pulseSlots: [PulseSlot, PulseSlot] | null = null
	let activePulse: 0 | 1 = 0

	// Drift (recording mode). The layer currently faded IN: `activeKey` can't
	// serve this purpose — apply() writes to the layer that is *not* activeKey and
	// only flips afterwards, so activeKey names the visible layer only between
	// flips. The drift loop needs an unambiguous answer on every frame.
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

	// The page colour behind the glow, so the pulse can hand the spectrum only to
	// blobs that actually show against it (see audioSlots). Re-read when the
	// theme flips — a class/data attribute on <html> — since a blob that stands
	// out on a dark page can vanish on a light one and vice versa.
	let backdrop = readBackdrop(parent)
	const themeObserver = new MutationObserver(() => {
		backdrop = readBackdrop(parent)
		if (pulseFrame) renderPulse(pulseFrame)
	})
	themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'data-theme'] })
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
		// Paint at the CURRENT drift phase, not phase 0: a track change while
		// drifting crossfades to the other layer, which has to come in already at
		// the phase the drift loop is about to keep painting, or it snaps.
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
		next.style.opacity = pulseFrame ? '0' : RESTING_OPACITY
		prev.style.opacity = '0'
		activeKey = activeKey === 'a' ? 'b' : 'a'
		visibleLayer = next
		// Yield the incoming layer past THIS frame batch: both this and driftTick run
		// from rAF, so otherwise drift could immediately overwrite the gradient just
		// faded in. Capped at half an interval so repeated applies (a slider drag)
		// can't starve drift entirely.
		lastDriftPaint = Math.max(lastDriftPaint, performance.now() - DRIFT_FRAME_MS / 2)
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
			return { el, colors: [], opts: options, blobs: [], els: [], clearTimer: null }
		}
		pulseSlots = [make(), make()]
		return pulseSlots
	}

	function fillPulseSlot(slot: PulseSlot) {
		if (slot.clearTimer !== null) {
			clearTimeout(slot.clearTimer)
			slot.clearTimer = null
		}
		// Geometry at drift phase 0; renderPulse adds the drift as a translate. The
		// build inputs are snapshotted so drift is always recomputed against the
		// same colours AND options the children were built from (a slot fading out
		// after setOptions must not be measured against the new geometry).
		slot.colors = lastColors
		slot.opts = options
		slot.blobs = computeBlobs(lastColors, options)
		slot.els = slot.blobs.map(blob => {
			const el = createPulseChild(options.blur)
			if (blob.kind === 'major') {
				// A box exactly around the ellipse rather than a layer-sized one, to
				// keep GPU memory small. No padding for the blur is needed: filter
				// output paints past the element's box.
				el.style.left = `${blob.x - blob.radiusX}%`
				el.style.top = `${blob.y - blob.radiusY}%`
				el.style.width = `${blob.radiusX * 2}%`
				el.style.height = `${blob.radiusY * 2}%`
				el.style.background = blobGradient(blob, '50% 50% at 50% 50%')
			} else {
				// Side blooms are huge (wider than the layer) and sit at its edges, so
				// they stay layer-sized: that clips them to the layer like the static
				// render, costs one layer-area each, and scaling about the layer
				// centre makes them swing outward on bass. Still one per bloom, so
				// each can drift on its own.
				el.style.inset = '0'
				el.style.background = blobGradient(blob)
			}
			return el
		})
		// The static string paints the first gradient on top; mirror that order.
		slot.el.replaceChildren(...[...slot.els].reverse())
	}

	// Drop a hidden slot's composited children once it has faded out, so they
	// don't hold GPU memory. Skipped if the slot became visible again meanwhile.
	function scheduleSlotClear(slot: PulseSlot) {
		if (slot.clearTimer !== null) clearTimeout(slot.clearTimer)
		slot.clearTimer = setTimeout(() => {
			slot.clearTimer = null
			if (pulseFrame && pulseSlots?.[activePulse] === slot) return
			slot.el.replaceChildren()
			slot.colors = []
			slot.blobs = []
			slot.els = []
		}, options.fadeMs + 50)
	}

	function renderPulse(frame: PulseFrame) {
		const phase = currentPhase()
		// Render both slots so the outgoing one keeps moving while it fades.
		pulseSlots?.forEach(slot => {
			if (slot.els.length === 0) return
			const t = pulseTransforms(slot.blobs, frame, options, backdrop)
			const drift = phase !== 0 ? driftDelta(slot.blobs, slot.colors, slot.opts, phase) : null
			slot.el.style.transform = `translate(-50%, -50%) scale(${t.layerScale})`
			slot.el.style.filter = t.filter
			let majorIndex = 0
			slot.blobs.forEach((blob, i) => {
				const el = slot.els[i]
				const p = blob.kind === 'major' ? t.majors[majorIndex++] : null
				const ddx = drift?.[i]?.dx ?? 0
				const ddy = drift?.[i]?.dy ?? 0
				const scale = p ? p.scale : t.sideScale
				el.style.transform = `translate(${(p?.dx ?? 0) + ddx}cqw, ${(p?.dy ?? 0) + ddy}cqh) scale(${scale})`
				if (p) el.style.opacity = `${p.opacity}`
			})
		})
	}

	function currentPhase() {
		return driftFrame === null ? 0 : (performance.now() - driftOrigin) / 1000
	}

	function driftTick(now: number) {
		driftFrame = requestAnimationFrame(driftTick)
		// While pulsing the static layers are hidden and renderPulse carries the
		// drift, so repainting them would be pure cost.
		if (pulseFrame) return
		if (now - lastDriftPaint < DRIFT_FRAME_MS) return
		lastDriftPaint = now
		// No-op until at least one apply() has landed: before that there is no
		// visible layer, and writing a background would race the first reflow.
		if (!visibleLayer || lastColors.length === 0) return
		// Phase runs continuously across track changes; resetting it would jump
		// every blob at the exact moment of the crossfade.
		visibleLayer.style.background = buildGradient(lastColors, options, (now - driftOrigin) / 1000)
	}

	function stopDrift() {
		if (driftFrame === null) return
		cancelAnimationFrame(driftFrame)
		driftFrame = null
	}

	function setPulse(frame: PulseFrame | null) {
		const active = activeKey === 'a' ? layerA : layerB
		if (!frame) {
			if (!pulseFrame) return
			pulseFrame = null
			// Bring the static layer to the current drift phase before it fades
			// back in; it was last painted when pulsing started.
			if (driftFrame !== null && lastColors.length > 0) {
				active.style.background = buildGradient(lastColors, options, currentPhase())
			}
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
		setDrift(enabled) {
			if (!enabled) {
				stopDrift()
				return
			}
			if (destroyed || driftFrame !== null) return
			// Checked once, not per frame: a recording-only feature doesn't need to
			// react to the setting changing mid-capture. Fails CLOSED: without
			// matchMedia we can't tell motion is wanted, so we don't animate.
			if (typeof window.matchMedia !== 'function') return
			if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
			driftOrigin = performance.now()
			// Sentinel, not a timestamp: the first frame paints regardless of how
			// long the page has been open.
			lastDriftPaint = -Infinity
			driftFrame = requestAnimationFrame(driftTick)
		},
		setOptions(patch) {
			options = { ...options, ...patch }
			// The pulse options only change the per-frame transforms: no geometry,
			// no rebuild, no crossfade. Just re-render the current frame.
			const keys = Object.keys(patch)
			if (keys.length > 0 && keys.every(k => k.startsWith('pulse'))) {
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
			themeObserver.disconnect()
			destroyed = true
			stopDrift()
			// Dropped so a later setDrift(true) can't restart the loop against the
			// detached layers below; the handle has to be genuinely inert after this.
			visibleLayer = null
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
	/** Colours and options the children were built from (drift is recomputed from these). */
	colors: Array<Rgb | null>
	opts: Required<GlowOptions>
	/** Majors first in rank order, then side blooms, as computeBlobs returns them. */
	blobs: GlowBlob[]
	/** One element per blob, aligned with `blobs`. */
	els: HTMLDivElement[]
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

export function computeBlobs(colors: Array<Rgb | null>, opts: Required<GlowOptions>, phase = 0): GlowBlob[] {
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
	// Resolved once. `driftSpeed` falls back to 1 rather than riding along as
	// undefined, so a partially-built options object degrades to unscaled drift
	// instead of silently killing all motion.
	const driftPhase = phase * (Number.isFinite(opts.driftSpeed) ? opts.driftSpeed : 1)
	const major = weighted.slice(0, opts.majorBlobCount)
	major.forEach((entry, rank) => {
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
		const bloomDrift = driftOffset(entry.color, entry.index + 91, driftPhase, opts.drift * 0.5)
		const y = clamp(50 + entry.centeredY * 18 + randomBetween(seed + 1, -10, 10) + bloomDrift.y, 4, 96)
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

/**
 * Per-blob drift offset. The frequencies and phase offsets are seeded (so each
 * blob keeps its own stable, independent motion), but the time term is
 * continuous — so blobs drift smoothly instead of re-rolling discontinuously
 * the way changing `jitter` would.
 *
 * `drift: 0` renders byte-identically to the pre-drift version (golden-tested).
 * That rests on `randomBetween` being a pure function of its seed — there is no
 * PRNG stream to advance — so a drift-side draw can never perturb a static one.
 *
 * DRIFT_SALT keeps drift draws clear of the static ones for legibility, NOT for
 * correctness — `colorSeed` is linear, so at fine `binSize` the salt spaces do
 * collide. A collision only means two independent reads are correlated, which at
 * `drift: 0` are never consumed.
 */
const DRIFT_SALT = 401

function driftOffset(color: Rgb, index: number, phase: number, amplitude: number) {
	// `!(amplitude > 0)` so NaN and negatives fall back to static too, rather than
	// emitting `NaN%` into the CSS; Infinity likewise (`Infinity * 0` is NaN).
	// `phase` is guarded too: driftSpeed multiplies into it upstream.
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

/**
 * Drift of each blob at `phase`, as the offset from its phase-0 position (in %
 * of the layer). Measured against the clamped phase-0 geometry so that
 * `blob + delta` lands exactly where the static drift render puts it. Blob order
 * doesn't depend on phase (it's sorted by colour intensity), so indices line up.
 */
export function driftDelta(
	base: GlowBlob[],
	colors: Array<Rgb | null>,
	opts: Required<GlowOptions>,
	phase: number,
): Array<{ dx: number; dy: number }> {
	const drifted = computeBlobs(colors, opts, phase)
	return base.map((blob, i) => {
		const now = drifted[i]
		return now ? { dx: now.x - blob.x, dy: now.y - blob.y } : { dx: 0, dy: 0 }
	})
}

export function buildGradient(colors: Array<Rgb | null>, opts: Required<GlowOptions>, phase = 0): string {
	const blobs = computeBlobs(colors, opts, phase)
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
	/** CSS filter for the whole pulse layer ('none' when unused). */
	filter: string
}

/**
 * The experimental audio-reactive behaviours, selectable per mount (and via the
 * `?pulseMode=` URL param on /radio and the sandbox). All of them are the
 * identity on a silent frame.
 * - bands: each blob swells with its own frequency band (the original).
 * - kick: mostly still; a big whole-glow thump on each detected kick.
 * - transients: blobs pop on sudden hits in their band, not sustained energy.
 * - colour: brightness shifts hue/saturation/brightness; size barely moves.
 * - breathe: one slow, smoothed swell with the loudness.
 * - orbit: blobs circle the cover at a speed set by treble and kicks.
 * - boombap: kick thumps, snare flashes and spreads, hats sparkle the small blobs.
 */
export const PULSE_MODES = ['bands', 'kick', 'transients', 'colour', 'breathe', 'orbit', 'boombap'] as const
export type PulseMode = (typeof PULSE_MODES)[number]

export function isPulseMode(value: unknown): value is PulseMode {
	return typeof value === 'string' && (PULSE_MODES as readonly string[]).includes(value)
}

/**
 * WCAG contrast ratio between two colours: 1 = identical, 21 = black on white.
 * Used to judge whether a blob can be seen against the page behind the glow.
 */
export function contrastRatio(a: Rgb, b: Rgb): number {
	const channel = (value: number) => {
		const c = value / 255
		return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
	}
	const luminance = ({ r, g, b: blue }: Rgb) => 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(blue)
	const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
	return (hi + 0.05) / (lo + 0.05)
}

/**
 * Below this contrast with the page, a blurred, semi-transparent blob reads as
 * background rather than colour. Calibrated on a real case: a deep maroon
 * (64,0,0) blob on the dark radio page measures 1.12 and is invisible, while the
 * cover's red (192,64,64) measures 3.7 and reads clearly.
 */
export const VISIBLE_CONTRAST = 1.6

/**
 * Which "audio slot" each major blob gets, by rank — the position it takes when
 * the spectrum is spread across blobs.
 *
 * Only blobs visible against `backdrop` get a slot, in their original rank
 * (intensity) order, so the whole spectrum — bass to treble, and the kick and
 * hats that boombap reads off the first and last slots — always lands on colour
 * you can see. Without this, a cover whose upper ranks are dark is "deaf" from
 * the mids up on a dark page (and a pale one on a light page): that half of the
 * music moves nothing visible, so the motion that remains looks out of step.
 *
 * With no backdrop, or fewer than two visible blobs, every blob keeps its rank
 * as its slot — exactly the original mapping.
 */
export function audioSlots(majors: GlowBlob[], backdrop: Rgb | null): { slotOf: Array<number | null>; count: number } {
	const all = { slotOf: majors.map((_, rank) => rank), count: majors.length }
	if (!backdrop) return all
	const ordered = [...majors].sort((a, b) => a.rank - b.rank)
	const visible = ordered.filter(blob => contrastRatio(blob.color, backdrop) >= VISIBLE_CONTRAST)
	if (visible.length < 2) return all
	const slotOf: Array<number | null> = majors.map(() => null)
	visible.forEach((blob, slot) => {
		slotOf[blob.rank] = slot
	})
	return { slotOf, count: visible.length }
}

/**
 * The first opaque background behind `el`, walking up the tree; null when there
 * is none (nothing to judge visibility against, so the pulse keeps its
 * original, theme-blind mapping).
 */
function readBackdrop(el: Element | null): Rgb | null {
	let node = el
	while (node) {
		const match = /rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?\)/.exec(
			getComputedStyle(node).backgroundColor,
		)
		const alpha = match?.[4] === undefined ? 1 : Number(match[4])
		if (match && alpha >= 0.5) return { r: Number(match[1]), g: Number(match[2]), b: Number(match[3]) }
		node = node.parentElement
	}
	return null
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
 * Map an audio frame onto per-blob deformations. Each visible blob's audio slot
 * (see audioSlots; 0 = most intense visible colour) listens to the band at the
 * same relative position, so bass drives the dominant blob and treble the
 * faintest. Blobs that can't be seen against `backdrop` get no band. A silent
 * frame is the identity.
 */
export function pulseTransforms(
	blobs: GlowBlob[],
	frame: PulseFrame,
	opts: Required<GlowOptions>,
	backdrop: Rgb | null = null,
): GlowPulse {
	const a = Math.max(0, opts.pulseAmount)
	const knob = (value: number) => (Number.isFinite(value) ? Math.max(0, value) : 1)
	const k = {
		bass: knob(opts.pulseBass),
		treble: knob(opts.pulseTreble),
		kick: knob(opts.pulseKick),
		snare: knob(opts.pulseSnare),
		shimmer: knob(opts.pulseShimmer),
	}
	const { bands, onsets, level, swell, beat, snare, orbit, centroid, time } = frame
	const n = bands.length
	const majors = blobs.filter(blob => blob.kind === 'major')
	const trebleStart = Math.ceil((n * 2) / 3)
	let treble = 0
	for (let i = trebleStart; i < n; i++) treble += bands[i]
	treble = n > trebleStart ? treble / (n - trebleStart) : 0
	const bass = n ? bands[0] : 0
	const { slotOf, count } = audioSlots(majors, backdrop)
	const slot = (rank: number) => slotOf[rank] ?? null
	/** The band a blob listens to, or -1 for an unseen blob (it hears nothing). */
	const bandIndex = (rank: number) => {
		const s = slot(rank)
		return n && s !== null ? bandForRank(s, count, n) : -1
	}
	const bandOf = (rank: number) => bands[bandIndex(rank)] ?? 0
	const onsetOf = (rank: number) => onsets[bandIndex(rank)] ?? 0
	/** Blend of the bass and treble knobs by where the rank's band sits (0 = lowest). */
	const bandWeight = (rank: number) => {
		const index = bandIndex(rank)
		if (index < 0) return 0
		const position = n > 1 ? index / (n - 1) : 0
		return k.bass + (k.treble - k.bass) * position
	}
	/** The blob carrying the kick: the dominant colour that can actually be seen. */
	const isLead = (rank: number) => slot(rank) === 0
	/** The upper half of the visible blobs, where boombap puts the hats. */
	const isUpper = (rank: number) => (slot(rank) ?? -1) >= count / 2
	const still: BlobPulse = { scale: 1, dx: 0, dy: 0, opacity: 1 }
	const base = { layerScale: 1, sideScale: 1, filter: 'none' }

	switch (opts.pulseMode) {
		case 'kick':
			return {
				...base,
				layerScale: 1 + a * (0.03 * level + 0.2 * beat * k.kick),
				sideScale: 1 + a * 0.25 * beat * k.kick,
				majors: majors.map(blob => ({
					...still,
					scale: 1 + a * beat * k.kick * (isLead(blob.rank) ? 0.3 : 0.12),
				})),
			}

		case 'transients':
			return {
				...base,
				layerScale: 1 + a * (0.04 * level + 0.06 * beat * k.kick),
				sideScale: 1 + a * 0.2 * (onsets[0] ?? 0) * k.bass,
				majors: majors.map(blob => {
					const hit = onsetOf(blob.rank) * bandWeight(blob.rank)
					return {
						scale: 1 + a * 0.6 * hit,
						// Pop outward from the centre on a hit.
						dx: (blob.x - 50) * 0.1 * a * hit,
						dy: (blob.y - 50) * 0.1 * a * hit,
						// Blobs that aren't being hit sink back a little, so hits read as flickers.
						opacity: 1 - Math.min(1, a) * 0.35 * (1 - Math.min(1, hit)) * level,
					}
				}),
			}

		case 'colour': {
			// Scaled by level so a silent frame is the identity.
			const hue = -40 * (centroid - 0.45) * level * a * k.treble
			const saturate = 1 + a * (0.7 * bass * k.bass - 0.25 * treble * k.treble)
			const brightness = 1 + a * (0.18 * level + 0.25 * snare * k.snare + 0.15 * beat * k.kick)
			// 'none' rather than a no-op filter string: a filter costs compositor work.
			const active = a > 0 && (level > 0 || beat > 0 || snare > 0 || bass > 0 || treble > 0)
			return {
				...base,
				layerScale: 1 + a * 0.03 * level,
				majors: majors.map(() => still),
				filter: active
					? `hue-rotate(${hue}deg) saturate(${Math.max(0, saturate)}) brightness(${brightness})`
					: 'none',
			}
		}

		case 'breathe':
			return {
				...base,
				layerScale: 1 + a * 0.2 * swell,
				sideScale: 1 + a * 0.1 * swell,
				majors: majors.map(blob => {
					const sway = Math.sin(time * 0.25 + blob.rank * 1.3) * a * 2 * swell * k.shimmer
					return { ...still, scale: 1 + a * 0.15 * swell * (1 - blob.rank * 0.08), dx: sway, dy: sway * 0.5 }
				}),
			}

		case 'orbit':
			return {
				...base,
				layerScale: 1 + a * 0.05 * level,
				majors: majors.map(blob => {
					// Alternate directions and speeds per blob so they weave, not spin as one.
					const direction = blob.rank % 2 === 0 ? 1 : -1
					const angle = orbit * a * (0.6 + 0.15 * blob.rank) * direction
					const rx = blob.x - 50
					const ry = blob.y - 50
					return {
						...still,
						scale: 1 + a * 0.2 * bandOf(blob.rank) * bandWeight(blob.rank),
						dx: rx * Math.cos(angle) - ry * Math.sin(angle) - rx,
						dy: rx * Math.sin(angle) + ry * Math.cos(angle) - ry,
					}
				}),
			}

		case 'boombap': {
			const flash = snare * k.snare
			return {
				...base,
				// Boom: the whole glow thumps on the kick, over a slow sway with the mix.
				layerScale: 1 + a * (0.05 * swell + 0.14 * beat * k.kick),
				// Bap: the side blooms and the brightness flash on the snare.
				sideScale: 1 + a * 0.35 * flash,
				filter: a > 0 && flash > 0.02 ? `brightness(${1 + a * 0.18 * flash})` : 'none',
				majors: majors.map(blob => {
					const hats = isUpper(blob.rank) ? onsetOf(blob.rank) * k.treble : 0
					const phase = time * (0.5 + 0.13 * blob.rank) * Math.PI * 2 + blob.rank * 1.7
					const wobble = a * hats * 1.5 * k.shimmer
					return {
						scale: 1 + a * ((isLead(blob.rank) ? 0.35 : 0.08) * beat * k.kick + 0.15 * hats),
						// The snare spreads the blobs outward; hats jitter the small ones.
						dx: (blob.x - 50) * 0.12 * a * flash + Math.sin(phase) * wobble,
						dy: (blob.y - 50) * 0.12 * a * flash + Math.cos(phase) * wobble * 0.6,
						opacity: 1,
					}
				}),
			}
		}

		default: {
			// 'bands': the original behaviour (byte-identical with all knobs at 1).
			// Bright passages spread the blobs outwards, dull ones pull them in.
			const spread = a * 0.25 * (centroid - 0.4) * level
			return {
				...base,
				layerScale: 1 + a * (0.12 * level + 0.08 * beat * k.kick),
				sideScale: 1 + a * 0.2 * bass * k.bass,
				majors: majors.map(blob => {
					const band = bandOf(blob.rank) * bandWeight(blob.rank)
					const kickBump = beat * k.kick * (isLead(blob.rank) ? 0.15 : 0.06)
					const phase = time * (0.35 + 0.11 * blob.rank) * Math.PI * 2 + blob.rank * 1.7
					const wobble = a * treble * (2 + opts.jitter * 0.12) * k.shimmer
					return {
						scale: 1 + a * (0.45 * band + kickBump),
						dx: (blob.x - 50) * spread + Math.sin(phase) * wobble,
						dy: Math.cos(phase * 0.8) * wobble * 0.6,
						opacity: 1 - Math.min(1, a) * 0.35 * (1 - Math.min(1, band)) * level,
					}
				}),
			}
		}
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
