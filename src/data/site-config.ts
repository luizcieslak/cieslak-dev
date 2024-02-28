export type Image = {
	src: string
	alt?: string
	caption?: string
}

export type Link = {
	text: string
	href: string
}

export type Hero = {
	title?: string
	text?: string
	image?: Image
	actions?: Link[]
}

export type SiteConfig = {
	logo?: Image
	title: string
	description: string
	image?: Image
	headerNavLinks?: Link[]
	socialLinks?: Link[]
	hero?: Hero
	postsPerPage?: number
	projectsPerPage?: number
}

const siteConfig: SiteConfig = {
	title: 'Cieslak.dev',
	description: 'Luiz Cieslak website',
	image: {
		src: '/dante-preview.jpg',
		alt: 'Luiz Cieslak happily hugging an Android mascot.',
	},
	headerNavLinks: [
		{
			text: 'Cieslak.dev',
			href: '/',
		},
	],
	socialLinks: [
		{
			text: 'GitHub',
			href: 'https://github.com/luizcieslak',
		},
		{
			text: 'Linkedin',
			href: 'https://www.linkedin.com/in/cieslakluiz/',
		},
		{
			text: 'X/Twitter',
			href: 'https://twitter.com/_luizcieslak',
		},
	],
	hero: {
		title: 'Hi There & Welcome to My Corner of the Web!',
		text: "I'm **Ethan Donovan**, a web developer at Amazing Studio, dedicated to the realms of collaboration and artificial intelligence. My approach involves embracing intuition, conducting just enough research, and leveraging aesthetics as a catalyst for exceptional products. I have a profound appreciation for top-notch software, visual design, and the principles of product-led growth. Feel free to explore some of my coding endeavors on <a href='https://github.com/JustGoodUI/dante-astro-theme'>GitHub</a> or follow me on <a href='https://twitter.com/justgoodui'>Twitter/X</a>.",
		image: {
			src: '/hero.jpeg',
			alt: 'A person sitting at a desk in front of a computer',
		},
		actions: [
			{
				text: 'Get in Touch',
				href: '/contact',
			},
		],
	},
	postsPerPage: 8,
}

export default siteConfig
