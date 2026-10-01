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
		// Homepage <title>/<meta description>. Kept here rather than in site-config
		// so each language gets its own copy — pt-br used to serve the English one.
		'site.title': 'Luiz Cieslak — Software Engineer & Side Projects',
		'site.description':
			'Luiz Cieslak, a software engineer in São Paulo. I write about the web and AI experiments, and build side projects — a browser video editor and a LoFi radio.',
		// Visible label ("Lofi") in the footer, miniplayer and callout. Keep it short;
		// `radio.seoTitle` is what goes in <title>.
		'radio.title': 'Lofi',
		'radio.seoTitle': 'LoFi Radio — A Live Stream I Built and Run',
		'radio.description':
			'A live LoFi radio stream I built and run myself — an always-on station with its own streaming server, cover art and now-playing feed. Press play and stay.',
		'radio.play': 'Play',
		'radio.pause': 'Pause',
		'radio.volume': 'Volume',
		'radio.coverSuffix': 'cover',
		'radio.playlistOn': "Listen to this radio's playlist on",
		'radio.listenerCount.one': 'listener',
		'radio.listenerCount.many': 'listeners',
		'radio.pulse': 'Pulse',
		'radio.pulse.hint': 'Make the glow pulse with the music',
		'glow.randomize': 'Randomize',
		'glow.pulse.title': 'Make it pulse',
		'glow.pulse.hint':
			'Syncs the glow to the live radio: loudness grows it, beats kick it, and the spectrum below is spread across the colour blobs you can see on this background (bass → treble).',
		'glow.pulse.enable': '✨ Pulse with the radio',
		'glow.pulse.play': 'Play radio',
		'glow.pulse.pause': 'Pause radio',
		'glow.pulse.connecting': 'Connecting…',
		'glow.pulse.pulsingTo': 'Pulsing to',
		'glow.pulse.paused': 'Radio paused — the glow settles back.',
		'glow.pulse.blocked': "Your browser didn't let the page listen to the audio. Tap the button again.",
		'glow.pulse.amount': 'Pulse amount',
		'glow.pulse.unsupported': "This browser can't analyse the radio stream.",
		'glow.pulse.off': 'Pulse amount is 0 — the glow stays still.',
	},
	'pt-br': {
		'nav.home': 'Início',
		'nav.about': 'Sobre',
		'blog.updatedon': 'Atualizado em',
		'site.title': 'Luiz Cieslak — Engenheiro de Software e Projetos',
		'site.description':
			'Engenheiro de software em São Paulo. Escrevo sobre a web e experimentos com IA, e construo projetos paralelos — um editor de vídeo no navegador e uma rádio.',
		'radio.title': 'Lofi',
		'radio.seoTitle': 'Rádio LoFi — transmissão que eu criei e mantenho',
		'radio.description':
			'Uma rádio LoFi ao vivo que eu mesmo criei — uma estação sempre no ar, com servidor próprio, capas e o que está tocando agora. Aperte o play e fique um pouco.',
		'radio.play': 'Tocar',
		'radio.pause': 'Pausar',
		'radio.volume': 'Volume',
		'radio.coverSuffix': 'capa',
		'radio.playlistOn': 'Ouça a playlist desta rádio no',
		'radio.listenerCount.one': 'ouvinte',
		'radio.listenerCount.many': 'ouvintes',
		'radio.pulse': 'Pulsar',
		'radio.pulse.hint': 'Fazer o brilho pulsar com a música',
		'glow.randomize': 'Aleatório',
		'glow.pulse.title': 'Faça pulsar',
		'glow.pulse.hint':
			'Sincroniza o brilho com a rádio ao vivo: o volume faz ele crescer, as batidas dão um impulso e o espectro abaixo é distribuído entre as bolhas de cor visíveis neste fundo (graves → agudos).',
		'glow.pulse.enable': '✨ Pulsar com a rádio',
		'glow.pulse.play': 'Tocar rádio',
		'glow.pulse.pause': 'Pausar rádio',
		'glow.pulse.connecting': 'Conectando…',
		'glow.pulse.pulsingTo': 'Pulsando com',
		'glow.pulse.paused': 'Rádio pausada — o brilho volta ao normal.',
		'glow.pulse.blocked': 'Seu navegador não deixou a página ouvir o áudio. Toque no botão de novo.',
		'glow.pulse.amount': 'Intensidade do pulso',
		'glow.pulse.unsupported': 'Este navegador não consegue analisar o áudio da rádio.',
		'glow.pulse.off': 'Intensidade em 0 — o brilho fica parado.',
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
