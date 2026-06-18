import { defineConfig } from 'astro/config'
import mdx from '@astrojs/mdx'
import sitemap from '@astrojs/sitemap'
import tailwind from '@astrojs/tailwind'
import rehypeShiftHeading from 'rehype-shift-heading'

// https://astro.build/config
export default defineConfig({
	site: 'https://cieslak.dev',
	trailingSlash: 'always',
	// The page layout owns the single <h1> (post/page title), so demote every
	// markdown heading one level (# -> h2, ## -> h3, ...). Keeps one h1 per page
	// and a proper heading outline for a11y/SEO. Authors keep writing `#`.
	markdown: {
		rehypePlugins: [[rehypeShiftHeading, { shift: 1 }]],
	},
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
