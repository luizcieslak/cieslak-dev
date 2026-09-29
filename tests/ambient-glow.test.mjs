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

	const treble = frame({ level: 0.6, bands: [0, 0, 0, 0, 0, 0, 0, 1] })
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

import { bandForRank } from '../src/lib/ambient-glow/index.ts'

test('bandForRank spreads blobs over the whole spectrum', () => {
	assert.deepEqual(
		[0, 1, 2, 3, 4].map(r => bandForRank(r, 5, 8)),
		[0, 2, 4, 5, 7],
	)
	assert.deepEqual(
		[0, 1].map(r => bandForRank(r, 2, 8)),
		[0, 7],
	)
	assert.equal(bandForRank(0, 1, 8), 0)
	assert.equal(bandForRank(3, 12, 1), 0)
	// Every rank lands inside the spectrum for all slider-reachable counts.
	for (let m = 1; m <= 12; m++)
		for (let r = 0; r < m; r++) {
			const b = bandForRank(r, m, 8)
			assert.ok(b >= 0 && b < 8)
		}
})

test('middle-rank blobs follow their own band', () => {
	const bands = new Array(8).fill(0)
	bands[bandForRank(2, majorCount, 8)] = 1
	const t = pulseTransforms(blobs, frame({ level: 0.6, bands }), OPTS)
	t.majors.forEach((p, rank) => {
		if (rank === 2) assert.ok(p.scale > 1.4)
		else assert.equal(p.scale, 1)
	})
})
