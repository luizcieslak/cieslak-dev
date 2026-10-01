// The URL to load a cross-origin cover from when the page needs its pixels (the
// ambient glow reads them, so those <img>s carry crossorigin='anonymous').
//
// Why not the plain URL: the cover CDN sends `Access-Control-Allow-Origin` only
// when a request carries an Origin header, and its other responses have no
// `Vary: Origin` while being cacheable for hours. So any plain load of the same
// URL in the same cache partition — the favicon this page sets to the cover, a
// Media Session artwork fetch, lofi-radio's own player on another localhost
// port — caches a CORS-less copy that the browser then serves to the
// crossorigin <img>, and blocks. A marker param gives CORS loads their own cache
// entry, which only ever holds CORS responses. The CDN ignores the query string.
//
// Same-origin, blob: and data: URLs need no CORS and are returned unchanged.
export const CORS_IMAGE_PARAM = 'cors'

export function corsImageUrl(url: string, pageOrigin: string = location.origin): string {
	let parsed: URL
	try {
		parsed = new URL(url, pageOrigin)
	} catch {
		return url
	}
	if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return url
	if (parsed.origin === pageOrigin) return url
	parsed.searchParams.set(CORS_IMAGE_PARAM, '1')
	return parsed.toString()
}
