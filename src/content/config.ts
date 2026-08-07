import { defineCollection, z } from 'astro:content'

// Bounds match what search engines actually display, and are the same ones
// scripts/check-meta.mjs enforces on the built HTML — keep the two in step.
// BaseHead renders every title as `<title> | Cieslak.dev`, so the suffix eats
// into the budget; derive it rather than restating "14 chars" in prose, which
// would quietly stop being true if the site title were ever renamed.
import siteConfig from '../data/site-config'

const TITLE_SUFFIX = ` | ${siteConfig.title}`.length

// Rendered title must land in 45-65, so the authored part is that minus the suffix.
const seoTitle = z
	.string()
	.min(45 - TITLE_SUFFIX)
	.max(65 - TITLE_SUFFIX)
const seoDescription = z.string().min(120).max(160)

const seoSchema = z.object({
	// Optional: every post already carries an image-only `seo` block, and a post
	// whose plain `title`/`excerpt` already renders in band shouldn't be forced to
	// restate it. These override the fallbacks when they don't.
	title: seoTitle.optional(),
	description: seoDescription.optional(),
	image: z
		.object({
			src: z.string(),
			alt: z.string().optional(),
		})
		.optional(),
	pageType: z.enum(['website', 'article']).default('website'),
})

const blog = defineCollection({
	schema: z.object({
		title: z.string(),
		// Required and non-empty: it's the post's visible preview text, its RSS item
		// description, and the fallback meta description, so a missing *or blank* one
		// ships an empty <meta name="description">. Deliberately not length-bounded —
		// it's copy written for readers, not for search results. When it renders
		// outside the meta band, override with `seo.description` and leave this alone;
		// scripts/check-meta.mjs is what catches that, on the built HTML.
		excerpt: z.string().min(1),
		publishDate: z.coerce.date(),
		updatedDate: z.coerce.date().optional(),
		isFeatured: z.boolean().default(false),
		tags: z.array(z.string()).default([]),
		seo: seoSchema.optional(),
	}),
})

const pages = defineCollection({
	schema: z.object({
		title: z.string(),
		// Unlike blog posts, pages have no `excerpt` to fall back on, so their meta
		// description has to be declared explicitly or BaseHead has nothing to render.
		seo: seoSchema.extend({ description: seoDescription }),
	}),
})

export const collections = { blog, pages }
