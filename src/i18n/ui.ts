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
		'nav.contact': 'Contact',
	},
	'pt-br': {
		'nav.home': 'Início',
		'nav.about': 'Sobre',
		'nav.contact': 'Contato',
		// 'nav.twitter': 'Twitter',
	},
} as const

export const routes = {
	'pt-br': {
		about: 'sobre',
		contact: 'contato',
	},
	en: {
		about: 'about',
		contact: 'contact',
	},
}
