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
	subtitle?: string
	description: string
	image?: Image
	headerNavLinks?: Link[]
	footerNavLinks?: Link[]
	socialLinks?: Link[]
	hero?: Hero
	postsPerPage?: number
	projectsPerPage?: number
}

const siteConfig: SiteConfig = {
	title: 'Dante',
	subtitle: 'Minimal Astro.js theme',
	description: 'Astro.js and Tailwind CSS theme for blog and portfolio by justgoodui.com',
	image: {
		src: '/dante-preview.jpg',
		alt: 'Dante - Astro.js and Tailwind CSS theme',
	},
	headerNavLinks: [
		{
			text: 'Cieslak.dev',
			href: '/',
		},
	],
	footerNavLinks: [
		{
			text: 'About',
			href: '/about',
		},
		{
			text: 'Contact',
			href: '/contact',
		},
		{
			text: 'Terms',
			href: '/terms',
		},
		{
			text: 'Download theme',
			href: 'https://github.com/JustGoodUI/dante-astro-theme',
		},
	],
	socialLinks: [
		{
			text: 'Dribbble',
			href: 'https://dribbble.com/',
		},
		{
			text: 'Instagram',
			href: 'https://instagram.com/',
		},
		{
			text: 'X/Twitter',
			href: 'https://twitter.com/',
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
