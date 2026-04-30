export const langPicker = {
	en: {
		icon: '🇺🇸',
		label: 'Change language to English',
	},
	'pt-br': {
		icon: '🇧🇷',
		label: 'Mudar idioma para Português',
	},
}

export const defaultLang = 'en'

export const ui = {
	en: {
		'nav.home': 'Home',
		'nav.about': 'About',
		'nav.twitter': 'Twitter',
		'blog.updatedon': 'Updated on',
		'radio.title': 'Radio',
		'radio.description': 'Live radio stream',
		'radio.play': 'Play',
		'radio.pause': 'Pause',
		'radio.volume': 'Volume',
		'radio.coverSuffix': 'cover',
	},
	'pt-br': {
		'nav.home': 'Início',
		'nav.about': 'Sobre',
		'blog.updatedon': 'Atualizado em',
		'radio.title': 'Rádio',
		'radio.description': 'Transmissão de rádio ao vivo',
		'radio.play': 'Tocar',
		'radio.pause': 'Pausar',
		'radio.volume': 'Volume',
		'radio.coverSuffix': 'capa',
		// 'nav.twitter': 'Twitter',
	},
} as const

export const routes = {
	'pt-br': {
		// about: 'sobre',
	},
	en: {
		// about: 'about',
	},
}
