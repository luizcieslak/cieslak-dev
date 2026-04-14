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
}

export function mount(img: HTMLImageElement, userOptions: GlowOptions = {}): GlowHandle {
	const parent = img.parentElement
	if (!parent) throw new Error('ambient-glow: img must be attached to the DOM before mount()')

	let options: Required<GlowOptions> = { ...DEFAULTS, ...userOptions }
	let lastColors: Array<Rgb | null> = []
	let activeKey: 'a' | 'b' = 'a'

	const layerA = createLayer(options)
	const layerB = createLayer(options)
	parent.insertBefore(layerA, img)
	parent.insertBefore(layerB, img)

	const canvas = document.createElement('canvas')
	const ctx = canvas.getContext('2d', { willReadFrequently: true })!

	const onLoad = () => extract()
	img.addEventListener('load', onLoad)
	if (img.complete && img.naturalWidth) extract()

	function extract() {
		if (!img.naturalWidth) return
		canvas.width = img.naturalWidth
		canvas.height = img.naturalHeight
		try {
			ctx.drawImage(img, 0, 0)
		} catch {
			// CORS-tainted canvas; consumer must set crossorigin + server CORS headers
			return
		}
		lastColors = extractGridColors(ctx, options)
		apply(lastColors)
	}

	function apply(colors: Array<Rgb | null>) {
		const gradient = buildGradient(colors, options.gridSize)
		const next = activeKey === 'a' ? layerB : layerA
		const prev = activeKey === 'a' ? layerA : layerB
		next.style.background = gradient
		next.style.opacity = '0.8'
		prev.style.opacity = '0'
		activeKey = activeKey === 'a' ? 'b' : 'a'
	}

	return {
		setOptions(patch) {
			options = { ...options, ...patch }
			styleLayer(layerA, options)
			styleLayer(layerB, options)
			extract()
		},
		update() {
			extract()
		},
		getColors() {
			return [...lastColors]
		},
		destroy() {
			img.removeEventListener('load', onLoad)
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
	s.height = '100%'
	s.filter = `blur(${opts.blur}px)`
	s.pointerEvents = 'none'
	s.transition = `opacity ${opts.fadeMs}ms ease`
	if (s.opacity === '') s.opacity = '0'
}

function extractGridColors(ctx: CanvasRenderingContext2D, opts: Required<GlowOptions>): Array<Rgb | null> {
	const { gridSize } = opts
	const cellW = Math.floor(ctx.canvas.width / gridSize)
	const cellH = Math.floor(ctx.canvas.height / gridSize)
	const out: Array<Rgb | null> = []
	for (let row = 0; row < gridSize; row++) {
		for (let col = 0; col < gridSize; col++) {
			const data = ctx.getImageData(col * cellW, row * cellH, cellW, cellH)
			out.push(dominantColor(data, opts))
		}
	}
	return out
}

function dominantColor(imageData: ImageData, opts: Required<GlowOptions>): Rgb | null {
	const { binSize, skipTransparent, skipBlack, blackThreshold, skipWhite, whiteThreshold } = opts
	const d = imageData.data
	const counts = new Map<string, number>()
	for (let i = 0; i < d.length; i += 4) {
		const r = d[i]
		const g = d[i + 1]
		const b = d[i + 2]
		const a = d[i + 3]
		if (skipTransparent && a < 128) continue
		const lum = 0.299 * r + 0.587 * g + 0.114 * b
		if (skipBlack && lum < blackThreshold) continue
		if (skipWhite && lum > whiteThreshold) continue
		const key = `${Math.floor(r / binSize)},${Math.floor(g / binSize)},${Math.floor(b / binSize)}`
		counts.set(key, (counts.get(key) || 0) + 1)
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

function buildGradient(colors: Array<Rgb | null>, gridSize: number): string {
	const parts: string[] = []
	for (let i = 0; i < colors.length; i++) {
		const c = colors[i]
		if (!c) continue
		const col = i % gridSize
		const row = Math.floor(i / gridSize)
		const x = ((col + 0.5) / gridSize) * 100
		const y = ((row + 0.5) / gridSize) * 100
		parts.push(`radial-gradient(circle at ${x}% ${y}%, rgba(${c.r},${c.g},${c.b},0.8) 0%, transparent 50%)`)
	}
	return parts.join(', ')
}
