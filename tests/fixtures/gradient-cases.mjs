// Inputs for the buildGradient golden snapshot. gradient-golden.json was generated
// from these with the pre-pulse renderer, so the static output must stay byte-identical.
const DEFAULTS = {
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

function grid(n, seed) {
	const out = []
	for (let i = 0; i < n * n; i++) {
		if ((i + seed) % 7 === 3) {
			out.push(null)
			continue
		}
		out.push({ r: (i * 37 + seed * 11) % 256, g: (i * 71 + seed * 5) % 256, b: (i * 113 + seed * 3) % 256 })
	}
	return out
}

export const GLOW_DEFAULTS = DEFAULTS

export const GOLDEN_CASES = [
	{ colors: grid(4, 1), opts: DEFAULTS },
	{
		colors: grid(4, 2),
		opts: { ...DEFAULTS, majorBlobCount: 12, sideBloomCount: 6, jitter: 50, edgeBleed: 50 },
	},
	{
		colors: grid(6, 3),
		opts: { ...DEFAULTS, gridSize: 6, horizontalStretch: 0.5, verticalStretch: 2.5, majorBlobRadius: 60 },
	},
	{
		colors: grid(2, 4),
		opts: { ...DEFAULTS, gridSize: 2, majorBlobCount: 1, sideBloomCount: 0, majorBlobFeather: 20 },
	},
	{ colors: [null, null, null, null], opts: { ...DEFAULTS, gridSize: 2 } },
]
