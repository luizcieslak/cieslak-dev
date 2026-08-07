/**
 * SEO meta gate. Reads the built site and fails if any page's <title> or
 * <meta name="description"> falls outside the length band search engines expect.
 *
 * Bing Webmaster flagged both "titles too short" and "descriptions too short" on
 * this site; this script is what stops them coming back. Run via `pnpm check:meta`,
 * which rebuilds first so it can never validate a stale dist/.
 *
 * Note the site renders every title as `<page title> | <site title>` (see
 * src/components/BaseHead.astro), so that suffix counts toward the band. The
 * authored-side bounds in src/content/config.ts derive themselves from it.
 */
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs'
import { join, relative, sep } from 'node:path'

const DIST = 'dist'

const TITLE_MIN = 45
const TITLE_MAX = 65
const DESC_MIN = 120
const DESC_MAX = 160

/**
 * `src/pages/index.astro` is a bare `<meta http-equiv="refresh">` stub whose only
 * job is to bounce visitors from / to their language. It is never meant to be read
 * or indexed, so it has no title or description to measure.
 */
const EXCLUDE = new Set(['index.html'])

function walk(dir) {
	const out = []
	for (const entry of readdirSync(dir)) {
		const path = join(dir, entry)
		if (statSync(path).isDirectory()) out.push(...walk(path))
		else if (path.endsWith('.html')) out.push(path)
	}
	return out
}

const NAMED = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' }

/**
 * Astro escapes `'` and `&` in attributes and text, so the raw HTML is longer than
 * the string a search engine actually displays. Measure the decoded form, or copy
 * gets tuned against numbers that are 3-4 chars too high.
 */
function decodeEntities(value) {
	return value
		.replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(Number(dec)))
		.replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
		.replace(/&([a-z]+);/gi, (match, name) => NAMED[name.toLowerCase()] ?? match)
}

function extract(html) {
	const title = html.match(/<title>([\s\S]*?)<\/title>/i)
	const description = html.match(/<meta\s+name=["']description["']\s+content=["']([\s\S]*?)["']\s*\/?>/i)
	return {
		title: title ? decodeEntities(title[1]).trim() : null,
		description: description ? decodeEntities(description[1]).trim() : null,
	}
}

function check(label, value, min, max) {
	if (value === null) return `${label} is missing`
	if (value.length < min) return `${label} too short: ${value.length} < ${min}`
	if (value.length > max) return `${label} too long: ${value.length} > ${max}`
	return null
}

if (!existsSync(DIST)) {
	console.error(`No ${DIST}/ directory — run \`pnpm build\` first.`)
	process.exit(1)
}

const pages = walk(DIST)
	.filter(path => !EXCLUDE.has(relative(DIST, path)))
	.sort()
	.map(path => ({
		route:
			'/' +
			relative(DIST, path)
				.split(sep)
				.join('/')
				.replace(/index\.html$/, ''),
		...extract(readFileSync(path, 'utf8')),
	}))

if (pages.length === 0) {
	console.error(`No HTML pages found in ${DIST}/ — did the build succeed?`)
	process.exit(1)
}

const failures = []

for (const page of pages) {
	const problems = [
		check('title', page.title, TITLE_MIN, TITLE_MAX),
		check('description', page.description, DESC_MIN, DESC_MAX),
	].filter(Boolean)

	const status = problems.length === 0 ? 'ok  ' : 'FAIL'
	const titleLen = String(page.title?.length ?? 0).padStart(3)
	const descLen = String(page.description?.length ?? 0).padStart(3)
	console.log(`${status} ${page.route.padEnd(42)} title ${titleLen}  desc ${descLen}`)

	for (const problem of problems) {
		console.log(`       ${problem}`)
		failures.push(`${page.route}: ${problem}`)
	}
}

// Duplicates are what a lazy global fallback produces, and search engines treat
// them as low-value boilerplate rather than a per-page summary. Bing flags both.
function reportDuplicates(field) {
	const byValue = new Map()
	for (const page of pages) {
		const value = page[field]
		if (!value) continue
		byValue.set(value, [...(byValue.get(value) ?? []), page.route])
	}
	for (const [value, routes] of byValue) {
		if (routes.length < 2) continue
		const problem = `duplicate ${field} shared by ${routes.join(', ')}: "${value.slice(0, 60)}..."`
		console.log(`FAIL ${problem}`)
		failures.push(problem)
	}
}

reportDuplicates('title')
reportDuplicates('description')

console.log(`\n${pages.length} page(s) checked, ${failures.length} problem(s).`)
process.exit(failures.length === 0 ? 0 : 1)
