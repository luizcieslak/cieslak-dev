import { test } from 'node:test'
import assert from 'node:assert/strict'
import { corsImageUrl } from '../src/lib/cors-image.ts'

const page = 'http://localhost:4321'

test('marks a cross-origin cover so CORS loads get their own cache entry', () => {
	assert.equal(
		corsImageUrl('https://cdn.cieslak.dev/Whatever%20Happens.jpg', page),
		'https://cdn.cieslak.dev/Whatever%20Happens.jpg?cors=1',
	)
})

test('keeps an existing query string', () => {
	assert.equal(corsImageUrl('https://cdn.example.com/a.jpg?v=2', page), 'https://cdn.example.com/a.jpg?v=2&cors=1')
})

test('is idempotent, so comparing against img.src stays stable', () => {
	const once = corsImageUrl('https://cdn.cieslak.dev/a.jpg', page)
	assert.equal(corsImageUrl(once, page), once)
})

test('leaves same-origin, relative, blob and data URLs alone', () => {
	assert.equal(corsImageUrl('http://localhost:4321/lofi-radio/glow-demo/a.jpg', page), 'http://localhost:4321/lofi-radio/glow-demo/a.jpg')
	assert.equal(corsImageUrl('/lofi-radio/glow-demo/a.jpg', page), '/lofi-radio/glow-demo/a.jpg')
	assert.equal(corsImageUrl('blob:http://localhost:4321/123', page), 'blob:http://localhost:4321/123')
	assert.equal(corsImageUrl('data:image/png;base64,AAAA', page), 'data:image/png;base64,AAAA')
})

test('returns unparseable input unchanged', () => {
	assert.equal(corsImageUrl('http://[bad', page), 'http://[bad')
})
