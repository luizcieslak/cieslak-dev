import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { buildGradient } from '../src/lib/ambient-glow/index.ts'
import { GOLDEN_CASES } from './fixtures/gradient-cases.mjs'

const golden = JSON.parse(readFileSync(new URL('./fixtures/gradient-golden.json', import.meta.url), 'utf8'))

test('static gradient output is byte-identical to the pre-pulse renderer', () => {
	GOLDEN_CASES.forEach((c, i) => {
		assert.equal(buildGradient(c.colors, c.opts), golden[i], `case ${i}`)
	})
})

import { computeBlobs, pulseTransforms } from '../src/lib/ambient-glow/index.ts'
import { GLOW_DEFAULTS } from './fixtures/gradient-cases.mjs'

const OPTS = { ...GLOW_DEFAULTS, pulseAmount: 1 }
const blobs = computeBlobs(GOLDEN_CASES[0].colors, OPTS)
const majorCount = blobs.filter(b => b.kind === 'major').length

function frame(overrides = {}) {
	return { level: 0, bands: new Array(8).fill(0), beat: 0, centroid: 0, time: 0, ...overrides }
}

test('a silent frame is the identity transform', () => {
	const t = pulseTransforms(blobs, frame({ time: 12.3 }), OPTS)
	assert.equal(t.layerScale, 1)
	assert.equal(t.sideScale, 1)
	assert.equal(t.majors.length, majorCount)
	t.majors.forEach(p =>
		assert.deepEqual({ ...p, dx: p.dx + 0, dy: p.dy + 0 }, { scale: 1, dx: 0, dy: 0, opacity: 1 }),
	)
})

test('pulseAmount 0 keeps the glow static for any frame', () => {
	const loud = frame({ level: 1, beat: 1, centroid: 1, time: 3.7, bands: new Array(8).fill(1) })
	const t = pulseTransforms(blobs, loud, { ...OPTS, pulseAmount: 0 })
	assert.equal(t.layerScale, 1)
	assert.equal(t.sideScale, 1)
	t.majors.forEach(p => {
		assert.equal(p.scale, 1)
		assert.equal(p.opacity, 1)
		assert.equal(Math.abs(p.dx), 0)
		assert.equal(Math.abs(p.dy), 0)
	})
})

test('loudness and beats grow the whole glow', () => {
	const quiet = pulseTransforms(blobs, frame({ level: 0.2 }), OPTS).layerScale
	const loud = pulseTransforms(blobs, frame({ level: 0.9 }), OPTS).layerScale
	const kick = pulseTransforms(blobs, frame({ level: 0.9, beat: 1 }), OPTS).layerScale
	assert.ok(1 < quiet && quiet < loud && loud < kick)
})

test('bass swells the dominant blob, treble the faintest', () => {
	const bass = frame({ level: 0.6, bands: [1, 0, 0, 0, 0, 0, 0, 0] })
	const tb = pulseTransforms(blobs, bass, OPTS)
	assert.ok(tb.majors[0].scale > 1.4)
	assert.equal(tb.majors[majorCount - 1].scale, 1)
	assert.ok(tb.majors[0].opacity > tb.majors[majorCount - 1].opacity)
	assert.ok(tb.sideScale > 1)

	// The faintest blob owns the top of the spectrum (bands 6–7 with 5 blobs).
	const treble = frame({ level: 0.6, bands: [0, 0, 0, 0, 0, 0, 1, 1] })
	const tt = pulseTransforms(blobs, treble, OPTS)
	assert.equal(tt.majors[0].scale, 1)
	assert.ok(tt.majors[majorCount - 1].scale > 1.4)
})

test('treble shimmers blob positions over time', () => {
	const at = time =>
		pulseTransforms(blobs, frame({ level: 0.5, time, bands: [0, 0, 0, 0, 0, 1, 1, 1] }), OPTS)
	const a = at(0.1).majors[0]
	const b = at(0.9).majors[0]
	assert.notEqual(a.dx, b.dx)
	assert.ok(Math.abs(a.dx) < 10 && Math.abs(a.dy) < 10, 'shimmer stays subtle')
})

test('pulse transforms tolerate an empty spectrum and no blobs', () => {
	const t = pulseTransforms(blobs, frame({ level: 1, bands: [] }), OPTS)
	t.majors.forEach(p => assert.ok(Number.isFinite(p.scale) && Number.isFinite(p.dx)))
	assert.deepEqual(pulseTransforms([], frame({ level: 1 }), OPTS).majors, [])
})

import { bandRange } from '../src/lib/ambient-glow/index.ts'

test('bandRange splits the spectrum so every band drives a blob', () => {
	assert.deepEqual(
		[0, 1, 2, 3, 4].map(slot => bandRange(slot, 5, 8)),
		[[0, 1], [1, 3], [3, 4], [4, 6], [6, 8]],
	)
	// Two visible blobs: the lows and the highs, nothing in between dropped.
	assert.deepEqual([0, 1].map(slot => bandRange(slot, 2, 8)), [[0, 4], [4, 8]])
	assert.deepEqual(bandRange(0, 1, 8), [0, 8])
	assert.deepEqual(bandRange(0, 3, 0), [0, 0])
	// For every slider-reachable count: each range is non-empty and inside the
	// spectrum, and when there are no more slots than bands, the ranges tile it.
	for (let m = 1; m <= 12; m++) {
		const ranges = Array.from({ length: m }, (_, slot) => bandRange(slot, m, 8))
		ranges.forEach(([start, end]) => assert.ok(start >= 0 && end <= 8 && end > start))
		if (m <= 8) {
			assert.equal(ranges[0][0], 0)
			assert.equal(ranges[m - 1][1], 8)
			ranges.slice(1).forEach(([start], i) => assert.equal(start, ranges[i][1]))
		}
	}
})

test('middle-rank blobs follow their own share of the spectrum', () => {
	const bands = new Array(8).fill(0)
	const [start, end] = bandRange(2, majorCount, 8)
	for (let i = start; i < end; i++) bands[i] = 1
	const t = pulseTransforms(blobs, frame({ level: 0.6, bands }), OPTS)
	t.majors.forEach((p, rank) => {
		if (rank === 2) assert.ok(p.scale > 1.4)
		else assert.equal(p.scale, 1)
	})
})

test('a hit in any band of a blob\'s share lands on it (transients)', () => {
	// Rank 1 owns bands 1–2 with 5 blobs; a hit on band 2 alone must still pop it.
	const onsets = [0, 0, 1, 0, 0, 0, 0, 0]
	const t = pulseTransforms(blobs, frame({ level: 0.6, onsets }), { ...OPTS, pulseMode: 'transients' })
	assert.ok(t.majors[1].scale > 1.3)
})

test('with two visible blobs the midrange still moves something', () => {
	const mids = frame({ level: 1, bands: [0, 0, 0, 1, 1, 0, 0, 0] })
	const dark = pulseTransforms(WIL, mids, { ...OPTS, pulseMode: 'bands' }, DARK_PAGE).majors.map(m => m.scale)
	assert.ok(dark[0] > 1 && dark[1] > 1, 'band 3 drives the low blob, band 4 the high one')
})

test('drift 0 is byte-identical to the golden static render at any phase', () => {
	GOLDEN_CASES.forEach((c, i) => {
		const opts = { ...c.opts, drift: 0, driftSpeed: 1 }
		assert.equal(buildGradient(c.colors, opts, 0), golden[i], `case ${i} phase 0`)
		assert.equal(buildGradient(c.colors, opts, 37.5), golden[i], `case ${i} phase 37.5`)
	})
})

test('drift moves blobs smoothly over time, keeps order and size', () => {
	const opts = { ...OPTS, drift: 12, driftSpeed: 3 }
	const a = computeBlobs(GOLDEN_CASES[0].colors, opts, 0)
	const b = computeBlobs(GOLDEN_CASES[0].colors, opts, 5)
	const c = computeBlobs(GOLDEN_CASES[0].colors, opts, 5.02)
	assert.equal(a.length, b.length)
	a.forEach((blob, i) => {
		assert.equal(b[i].kind, blob.kind)
		assert.deepEqual(b[i].color, blob.color, 'same blob at the same index across phases')
		assert.equal(b[i].radiusX, blob.radiusX)
	})
	assert.ok(
		a.some((blob, i) => Math.abs(blob.x - b[i].x) > 0.5),
		'blobs moved',
	)
	// 20 ms later: continuous, not re-rolled.
	b.forEach((blob, i) => assert.ok(Math.abs(blob.x - c[i].x) < 0.5 && Math.abs(blob.y - c[i].y) < 0.5))
	// Side blooms drift vertically only.
	a.forEach((blob, i) => {
		if (blob.kind === 'side') assert.equal(blob.x, b[i].x)
	})
})

test('non-finite drift inputs fall back to static instead of NaN', () => {
	const base = buildGradient(GOLDEN_CASES[0].colors, OPTS, 0)
	for (const patch of [{ drift: NaN }, { drift: -3 }, { drift: Infinity }, { drift: 8, driftSpeed: NaN }]) {
		const out = buildGradient(GOLDEN_CASES[0].colors, { ...OPTS, ...patch }, 4)
		assert.ok(!out.includes('NaN'), JSON.stringify(patch))
	}
	assert.equal(buildGradient(GOLDEN_CASES[0].colors, { ...OPTS, drift: NaN }, 4), base)
})

import { driftDelta } from '../src/lib/ambient-glow/index.ts'

test('driftDelta: phase-0 blob + delta lands exactly on the static drift render', () => {
	// Generous drift + edge bleed so some blobs hit the clamps.
	const opts = { ...OPTS, drift: 40, driftSpeed: 5, edgeBleed: 0, majorBlobCount: 12, sideBloomCount: 6 }
	const colors = GOLDEN_CASES[1].colors
	const base = computeBlobs(colors, opts, 0)
	for (const phase of [0, 1.7, 9.3, 44]) {
		const deltas = driftDelta(base, colors, opts, phase)
		const truth = computeBlobs(colors, opts, phase)
		base.forEach((blob, i) => {
			assert.ok(Math.abs(blob.x + deltas[i].dx - truth[i].x) < 1e-9, `x ${i} @${phase}`)
			assert.ok(Math.abs(blob.y + deltas[i].dy - truth[i].y) < 1e-9, `y ${i} @${phase}`)
			if (blob.kind === 'side') assert.equal(deltas[i].dx, 0)
		})
	}
	assert.ok(
		base.some(b => b.x === 100 || b.x === 0 || b.y === 112 || b.y === -12),
		'fixture reaches a clamp',
	)
})

test('driftDelta against fewer current blobs never throws (stale slot after setOptions)', () => {
	const colors = GOLDEN_CASES[0].colors
	const base = computeBlobs(colors, { ...OPTS, drift: 10 }, 0)
	const fewer = { ...OPTS, drift: 10, majorBlobCount: 2, sideBloomCount: 0 }
	const deltas = driftDelta(base, colors, fewer, 3)
	assert.equal(deltas.length, base.length)
	deltas.forEach(d => assert.ok(Number.isFinite(d.dx) && Number.isFinite(d.dy)))
})

// --- pulse modes ------------------------------------------------------------

import { PULSE_MODES, isPulseMode } from '../src/lib/ambient-glow/index.ts'

function fullFrame(overrides = {}) {
	return {
		level: 0,
		swell: 0,
		bands: new Array(8).fill(0),
		onsets: new Array(8).fill(0),
		beat: 0,
		snare: 0,
		orbit: 0,
		centroid: 0,
		time: 0,
		...overrides,
	}
}
const LOUD = fullFrame({
	level: 0.8,
	swell: 0.7,
	bands: new Array(8).fill(0.9),
	onsets: new Array(8).fill(1),
	beat: 1,
	snare: 1,
	orbit: 2.4,
	centroid: 0.8,
	time: 4.2,
})
const isStill = t =>
	t.layerScale === 1 &&
	t.sideScale === 1 &&
	t.filter === 'none' &&
	t.majors.every(p => p.scale === 1 && Math.abs(p.dx) === 0 && Math.abs(p.dy) === 0 && p.opacity === 1)
const withMode = (mode, extra = {}) => ({ ...OPTS, pulseMode: mode, ...extra })

test('every mode is the identity on a silent frame and with amount 0', () => {
	for (const mode of PULSE_MODES) {
		assert.ok(isStill(pulseTransforms(blobs, fullFrame({ time: 7.7 }), withMode(mode))), `${mode} silent`)
		assert.ok(isStill(pulseTransforms(blobs, LOUD, withMode(mode, { pulseAmount: 0 }))), `${mode} amount 0`)
		assert.ok(!isStill(pulseTransforms(blobs, LOUD, withMode(mode))), `${mode} reacts to a loud frame`)
	}
})

test('isPulseMode accepts only known modes', () => {
	assert.ok(isPulseMode('boombap'))
	assert.ok(!isPulseMode('Boombap'))
	assert.ok(!isPulseMode(undefined))
})

test('kick mode ignores sustained bands and thumps on the beat', () => {
	const sustained = pulseTransforms(blobs, fullFrame({ bands: new Array(8).fill(1) }), withMode('kick'))
	assert.ok(isStill(sustained))
	const kick = pulseTransforms(blobs, fullFrame({ beat: 1 }), withMode('kick'))
	assert.ok(kick.layerScale > 1.15 && kick.majors[0].scale > kick.majors[1].scale)
})

test('transients mode reacts to hits, not sustained energy', () => {
	const sustained = pulseTransforms(blobs, fullFrame({ bands: new Array(8).fill(1) }), withMode('transients'))
	sustained.majors.forEach(p => assert.equal(p.scale, 1))
	const onsets = new Array(8).fill(0)
	onsets[7] = 1 // a hat
	const hat = pulseTransforms(blobs, fullFrame({ onsets, level: 0.5 }), withMode('transients'))
	assert.ok(hat.majors[majorCount - 1].scale > 1.4, 'the treble blob pops')
	assert.equal(hat.majors[0].scale, 1, 'the bass blob does not')
})

test('boombap routes kick and snare to different gestures', () => {
	const kick = pulseTransforms(blobs, fullFrame({ beat: 1 }), withMode('boombap'))
	assert.ok(kick.layerScale > 1.1 && kick.majors[0].scale > 1.3)
	assert.equal(kick.sideScale, 1)
	assert.equal(kick.filter, 'none')
	const snare = pulseTransforms(blobs, fullFrame({ snare: 1 }), withMode('boombap'))
	assert.equal(snare.layerScale, 1)
	assert.ok(snare.sideScale > 1.3)
	assert.match(snare.filter, /^brightness\(1\.1/)
	assert.ok(
		snare.majors.some(p => Math.abs(p.dx) > 0.5),
		'snare spreads the blobs',
	)
})

test('orbit rotates blobs about the centre (distance preserved)', () => {
	const t = pulseTransforms(blobs, fullFrame({ orbit: 1.3 }), withMode('orbit'))
	majorsOf(blobs).forEach((blob, i) => {
		const before = Math.hypot(blob.x - 50, blob.y - 50)
		const after = Math.hypot(blob.x + t.majors[i].dx - 50, blob.y + t.majors[i].dy - 50)
		assert.ok(Math.abs(before - after) < 1e-9)
	})
	assert.ok(t.majors.some(p => Math.abs(p.dx) > 1))
})

test('colour mode changes the filter, not the size', () => {
	const t = pulseTransforms(blobs, LOUD, withMode('colour'))
	assert.match(t.filter, /hue-rotate\(.*\) saturate\(.*\) brightness\(.*\)/)
	t.majors.forEach(p => assert.equal(p.scale, 1))
	assert.ok(t.layerScale < 1.05)
})

test('breathe follows the slow swell only', () => {
	const fast = pulseTransforms(
		blobs,
		fullFrame({ level: 1, beat: 1, snare: 1, onsets: new Array(8).fill(1) }),
		withMode('breathe'),
	)
	assert.ok(isStill(fast))
	assert.ok(pulseTransforms(blobs, fullFrame({ swell: 0.8 }), withMode('breathe')).layerScale > 1.1)
})

test('knobs at 0 mute their feature', () => {
	assert.equal(
		pulseTransforms(blobs, fullFrame({ beat: 1 }), withMode('kick', { pulseKick: 0 })).layerScale,
		1,
	)
	const noSnare = pulseTransforms(blobs, fullFrame({ snare: 1 }), withMode('boombap', { pulseSnare: 0 }))
	assert.ok(isStill(noSnare))
	const bassOnly = pulseTransforms(
		blobs,
		fullFrame({ bands: new Array(8).fill(1) }),
		withMode('bands', { pulseTreble: 0 }),
	)
	assert.ok(bassOnly.majors[0].scale > 1.4)
	assert.equal(bassOnly.majors[majorCount - 1].scale, 1)
})

function majorsOf(list) {
	return list.filter(b => b.kind === 'major')
}

// ── Theme-aware band mapping ────────────────────────────────────────────────
import { audioSlots, contrastRatio, VISIBLE_CONTRAST } from '../src/lib/ambient-glow/index.ts'

const DARK_PAGE = { r: 0x1c, g: 0x06, b: 0x15 }
const LIGHT_PAGE = { r: 0xf7, g: 0xee, b: 0xd2 }
/** Five majors like the "Wil" cover: two reds, then three near-black maroons. */
const WIL = [
	{ r: 192, g: 64, b: 64 },
	{ r: 192, g: 64, b: 64 },
	{ r: 64, g: 0, b: 0 },
	{ r: 64, g: 0, b: 0 },
	{ r: 64, g: 0, b: 0 },
].map((color, rank) => ({ kind: 'major', rank, color, x: 50, y: 50, radiusX: 30, radiusY: 30, stops: [] }))

test('contrast: maroon disappears on the dark page, red does not', () => {
	assert.ok(contrastRatio(WIL[2].color, DARK_PAGE) < VISIBLE_CONTRAST)
	assert.ok(contrastRatio(WIL[0].color, DARK_PAGE) >= VISIBLE_CONTRAST)
	assert.ok(contrastRatio(WIL[2].color, LIGHT_PAGE) >= VISIBLE_CONTRAST)
})

test('audio slots skip blobs the page hides, keeping rank order', () => {
	assert.deepEqual(audioSlots(WIL, DARK_PAGE), { slotOf: [0, 1, null, null, null], count: 2 })
	assert.deepEqual(audioSlots(WIL, LIGHT_PAGE), { slotOf: [0, 1, 2, 3, 4], count: 5 })
})

test('no backdrop, or fewer than two visible blobs, keeps the original mapping', () => {
	assert.deepEqual(audioSlots(WIL, null), { slotOf: [0, 1, 2, 3, 4], count: 5 })
	const oneVisible = WIL.map((blob, rank) => (rank === 0 ? blob : { ...blob, color: { r: 0x1c, g: 0x06, b: 0x15 } }))
	assert.deepEqual(audioSlots(oneVisible, DARK_PAGE), { slotOf: [0, 1, 2, 3, 4], count: 5 })
})

test('on the dark page the treble moves a visible blob, not a hidden one', () => {
	const trebleOnly = frame({ level: 1, bands: [0, 0, 0, 0, 0, 0, 0, 1] })
	const opts = { ...OPTS, pulseMode: 'bands' }
	const dark = pulseTransforms(WIL, trebleOnly, opts, DARK_PAGE).majors.map(m => m.scale)
	// Without the backdrop the treble lands on rank 4, an invisible maroon.
	const blind = pulseTransforms(WIL, trebleOnly, opts).majors.map(m => m.scale)
	assert.ok(blind[4] > 1 && blind[1] === 1)
	// With it, the treble goes to the last VISIBLE blob, and the hidden ones hear nothing.
	assert.ok(dark[1] > 1)
	assert.deepEqual(dark.slice(2), [1, 1, 1])
})

test('boombap hats sparkle visible blobs on the dark page', () => {
	const hats = frame({ level: 1, onsets: [0, 0, 0, 0, 0, 0, 0, 1], bands: new Array(8).fill(0) })
	const opts = { ...OPTS, pulseMode: 'boombap' }
	const dark = pulseTransforms(WIL, hats, opts, DARK_PAGE).majors.map(m => m.scale)
	assert.ok(dark[1] > 1, 'the upper visible blob takes the hats')
	assert.deepEqual(dark.slice(2), [1, 1, 1])
})
