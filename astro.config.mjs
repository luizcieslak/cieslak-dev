import { defineConfig } from 'astro/config'
import mdx from '@astrojs/mdx'
import sitemap from '@astrojs/sitemap'
import tailwind from '@astrojs/tailwind'

// https://astro.build/config
export default defineConfig({
	site: 'https://cieslak.dev',
	trailingSlash: 'always',
	integrations: [
		mdx(),
		sitemap(),
		tailwind({
			applyBaseStyles: false,
		}),
	],
	i18n: {
		defaultLocale: 'en',
		locales: ['en', 'pt-br'],
		routing: {
			prefixDefaultLocale: true,
			redirectToDefaultLocale: false,
		},
	},
})
