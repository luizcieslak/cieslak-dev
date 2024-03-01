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
		'footer.footnote': 'All rights reserved.',
		'blog.updatedon': 'Updated on',
	},
	'pt-br': {
		'nav.home': 'Início',
		'nav.about': 'Sobre',
		'footer.footnote': 'Todos os direitos reservados.',
		'blog.updatedon': 'Atualizado em',
		// 'nav.twitter': 'Twitter',
	},
} as const

export const routes = {
	'pt-br': {
		about: 'sobre',
	},
	en: {
		about: 'about',
	},
}
