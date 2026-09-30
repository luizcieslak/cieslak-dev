import { test } from 'node:test'
import assert from 'node:assert/strict'
import { hasPulseExperiment, parsePulseExperiment, pulseExperimentQuery } from '../src/lib/pulse-params.ts'

const parse = query => parsePulseExperiment(new URLSearchParams(query))

test('reads mode, knobs and smoothing', () => {
	assert.deepEqual(parse('pulseMode=boombap&pulseKick=2&pulseSnare=0.5&pulseSmooth=1.5'), {
		mode: 'boombap',
		knobs: { pulseKick: 2, pulseSnare: 0.5 },
		smooth: 1.5,
		detection: {},
	})
})

test('ignores unknown modes and invalid numbers, clamps out-of-range ones', () => {
	assert.deepEqual(parse('pulseMode=dubstep&pulseBass=abc&pulseTreble=&pulseKick=99&pulseSmooth=0'), {
		knobs: { pulseKick: 4 },
		smooth: 0.25,
		detection: {},
	})
	assert.deepEqual(parse('pulseShimmer=-3'), { knobs: { pulseShimmer: 0 }, detection: {} })
	assert.deepEqual(parse(''), { knobs: {}, detection: {} })
})

test('detects whether any experiment param is present', () => {
	assert.equal(hasPulseExperiment(new URLSearchParams('pulse=1.5&stage')), false)
	assert.equal(hasPulseExperiment(new URLSearchParams('pulseMode=kick')), true)
	assert.equal(hasPulseExperiment(new URLSearchParams('pulseSmooth=2')), true)
})

test('round-trips through the query builder, omitting defaults', () => {
	const query = pulseExperimentQuery(1.5, 'transients', { pulseBass: 1, pulseTreble: 2.5 }, 1)
	assert.equal(query, 'pulse=1.5&pulseMode=transients&pulseTreble=2.5')
	assert.deepEqual(parse(query), { mode: 'transients', knobs: { pulseTreble: 2.5 }, detection: {} })
})

test('detector thresholds: parsed, clamped, and round-tripped (defaults omitted)', () => {
	assert.deepEqual(parse('pulseKickShape=3&pulseSnareStrict=99').detection, {
		kickLowOverAir: 3,
		snareSensitivity: 6,
	})
	assert.equal(hasPulseExperiment(new URLSearchParams('pulseSnareStrict=2')), true)
	const query = pulseExperimentQuery(1, 'boombap', {}, 1, { kickLowOverAir: 2, snareSensitivity: 2.5 })
	assert.equal(query, 'pulse=1&pulseMode=boombap&pulseSnareStrict=2.5')
})
