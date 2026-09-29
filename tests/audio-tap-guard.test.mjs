import { test } from 'node:test'
import assert from 'node:assert/strict'
import { guardTap, resumeWithTimeout } from '../src/lib/audio-tap-guard.ts'

function deps(overrides = {}) {
	const calls = { resume: 0, stop: 0 }
	const d = {
		mode: 'routed',
		isRunning: () => false,
		wantPlaying: () => true,
		isVisible: () => true,
		resume: async () => {
			calls.resume++
			return false
		},
		stop: () => {
			calls.stop++
		},
		...overrides,
	}
	return { d, calls }
}

test('no-op when the radio is not wanted', async () => {
	const { d, calls } = deps({ wantPlaying: () => false })
	assert.equal(await guardTap(d), 'noop')
	assert.deepEqual(calls, { resume: 0, stop: 0 })
})

test('no-op when the context is already running', async () => {
	const { d, calls } = deps({ isRunning: () => true })
	assert.equal(await guardTap(d), 'noop')
	assert.equal(calls.resume, 0)
})

test('resumes a suspended context', async () => {
	const { d, calls } = deps({ resume: async () => true })
	assert.equal(await guardTap(d), 'resumed')
	assert.equal(calls.stop, 0)
})

test('routed + resume fails + visible → stops instead of silent playback', async () => {
	const { d, calls } = deps()
	assert.equal(await guardTap(d), 'stopped')
	assert.equal(calls.stop, 1)
})

test('routed + hidden tab → leaves it for the visibility handler', async () => {
	const { d, calls } = deps({ isVisible: () => false })
	assert.equal(await guardTap(d), 'left')
	assert.equal(calls.stop, 0)
})

test('capture mode never stops playback: the element plays on its own', async () => {
	const { d, calls } = deps({ mode: 'capture' })
	assert.equal(await guardTap(d), 'left')
	assert.equal(calls.stop, 0)
})

test('user stopping during the resume attempt is respected', async () => {
	let want = true
	const { d, calls } = deps({
		wantPlaying: () => want,
		resume: async () => {
			want = false
			return false
		},
	})
	assert.equal(await guardTap(d), 'left')
	assert.equal(calls.stop, 0)
})

test('resumeWithTimeout: resolves, rejects and hangs all map to a boolean', async () => {
	assert.equal(await resumeWithTimeout({ state: 'running', resume: () => Promise.resolve() }, 50), true)
	assert.equal(await resumeWithTimeout({ state: 'suspended', resume: () => Promise.resolve() }, 50), false)
	assert.equal(
		await resumeWithTimeout({ state: 'suspended', resume: () => Promise.reject(new Error('x')) }, 50),
		false,
	)
	assert.equal(
		await resumeWithTimeout({ state: 'suspended', resume: () => new Promise(() => {}) }, 20),
		false,
	)
})

import { chooseTapMode } from '../src/lib/audio-tap-guard.ts'

test('chooseTapMode: capture where possible, route only on Gecko, nothing on WebKit', () => {
	assert.equal(chooseTapMode({ captureStream: true, mozCaptureStream: false }), 'capture') // Chromium
	assert.equal(chooseTapMode({ captureStream: true, mozCaptureStream: true }), 'capture')
	assert.equal(chooseTapMode({ captureStream: false, mozCaptureStream: true }), 'routed') // Firefox
	assert.equal(chooseTapMode({ captureStream: false, mozCaptureStream: false }), null) // Safari / iOS
})
