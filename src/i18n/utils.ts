import { ui, defaultLang, routes } from './ui'

export function getLangFromUrl(url: URL) {
	const [, lang] = url.pathname.split('/')
	if (lang in ui) return lang as keyof typeof ui
	return defaultLang
}

export function useTranslations(lang: keyof typeof ui) {
	return function t(key: keyof (typeof ui)[typeof lang]) {
		return ui[lang][key] || ui[defaultLang][key]
	}
}

export function useTranslatedPath(lang: keyof typeof ui) {
	return function translatePath(path: string, l = lang) {
		const pathName = path.replaceAll('/', '') as keyof (typeof routes)[typeof lang]

		const hasTranslation = defaultLang !== l && routes[l] !== undefined && routes[l][pathName] !== undefined
		const translatedPath = hasTranslation ? '/' + routes[l][pathName] : pathName

		return `/${l}/${translatedPath}`
		// turn this below if default lang doesn't need the path prefix
		// return l === defaultLang ? translatedPath : `/${l}/${translatedPath}`
	}
}
