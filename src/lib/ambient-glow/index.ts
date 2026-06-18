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
}

export function extractColors(img: HTMLImageElement, userOptions: GlowOptions = {}): Array<Rgb | null> {
	if (!img.naturalWidth) return []
	const opts: Required<GlowOptions> = { ...DEFAULTS, ...userOptions }
	const canvas = document.createElement('canvas')
	const ctx = canvas.getContext('2d', { willReadFrequently: true })!
	return extractImageColors(img, opts, canvas, ctx)
}

export function mount(img: HTMLImageElement, userOptions: GlowOptions = {}): GlowHandle {
	const parent = img.parentElement
	if (!parent) throw new Error('ambient-glow: img must be attached to the DOM before mount()')

	let options: Required<GlowOptions> = { ...DEFAULTS, ...userOptions }
	let lastColors: Array<Rgb | null> = []
	let activeKey: 'a' | 'b' = 'a'
	let hasApplied = false

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
		next.style.opacity = '0.8'
		prev.style.opacity = '0'
		activeKey = activeKey === 'a' ? 'b' : 'a'
	}

	return {
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

function buildGradient(colors: Array<Rgb | null>, opts: Required<GlowOptions>): string {
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
	const major = weighted.slice(0, opts.majorBlobCount)
	for (const entry of major) {
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
		const y = clamp(50 + entry.centeredY * 18 + randomBetween(seed + 1, -10, 10), 4, 96)
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
