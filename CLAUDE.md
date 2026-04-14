# Cieslak.dev - Personal Blog

An open-source bilingual (English/Portuguese-BR) personal blog built with Astro, Tailwind CSS, and MDX. Based on the [Dante Astro theme](https://github.com/JustGoodUI/dante-astro-theme) with custom i18n support.

## Project Overview

**Site URL:** https://cieslak.dev
**Tech Stack:** Astro 4.x, Tailwind CSS 3.x, MDX, TypeScript
**License:** GPL-3.0

## Key Features

- **Bilingual content**: All pages and blog posts must exist in both `en` and `pt-br` languages
- **i18n routing**: Astro's built-in i18n with prefixed locales (`/en/` and `/pt-br/`)
- **Content collections**: Blog posts and pages managed via Astro's content collections
- **MDX support**: Blog posts written in Markdown with MDX components
- **RSS & Sitemap**: Automatic generation for both languages
- **Tailwind Typography**: Styled blog post content

## Project Structure

```
cieslak-dev/
├── src/
│   ├── content/
│   │   ├── blog/
│   │   │   ├── en/           # English blog posts
│   │   │   └── pt-br/        # Portuguese blog posts
│   │   ├── pages/
│   │   │   ├── en/           # English static pages (about.md)
│   │   │   └── pt-br/        # Portuguese static pages (about.md)
│   │   └── config.ts         # Content collection schemas
│   ├── pages/
│   │   ├── [lang]/           # Dynamic language routing
│   │   ├── en/               # English routes
│   │   ├── pt-br/            # Portuguese routes
│   │   └── index.astro       # Root redirect to /en/
│   ├── layouts/              # Page layouts
│   ├── components/           # Reusable components
│   ├── i18n/                 # i18n utilities (ui.ts, utils.ts)
│   ├── utils/                # Helper functions
│   ├── data/                 # Static data
│   ├── styles/               # Global styles
│   └── icons/                # Icon components
├── public/                   # Static assets
├── astro.config.mjs          # Astro configuration
├── tailwind.config.cjs       # Tailwind configuration
└── tsconfig.json             # TypeScript configuration
```

## Content Guidelines

### Blog Posts

Blog posts are stored in [src/content/blog/](src/content/blog/) and **must be created in pairs** (English and Portuguese).

**File naming convention:**
```
src/content/blog/en/YYYY-MM-DD-slug.md
src/content/blog/pt-br/YYYY-MM-DD-slug.md
```

**Frontmatter structure:**
```yaml
---
title: Your Post Title
excerpt: Brief description of the post
publishDate: 'Feb 29 2024'
updatedDate: 'Mar 1 2024'  # Optional
seo:
  image:
    src: '/image.png'
    alt: Image description
---
```

**Example:** See [src/content/blog/en/2024-02-29-hove.md](src/content/blog/en/2024-02-29-hove.md)

### Static Pages

Pages like "About" are stored in [src/content/pages/](src/content/pages/) and must also exist in both languages:

```
src/content/pages/en/about.md
src/content/pages/pt-br/about.md
```

## Radio Page

The `/en/radio` and `/pt-br/radio` routes host a minimal live-stream player backed by the [`lofi-radio`](https://github.com/luizcieslak/lofi-radio) server (API URL in [.env](.env) as `PUBLIC_RADIO_API_URL`). The page is defined in [src/pages/\[lang\]/radio.astro](src/pages/%5Blang%5D/radio.astro).

**Reconnection logic:** the client listens for `error`, `stalled`, `ended`, and unexpected `pause` events on the audio element and reconnects to `/stream` with exponential backoff (1s → 1.5s → ... capped at 30s, reset on successful `play`). A `wantPlaying` flag separates user intent from transient browser pauses so we don't fight the user when they manually stop.

**Why that logic exists (and when to remove it):** in theory a continuous MP3 stream should play forever in a naive client (think VLC or a hardware internet radio). In practice the browser decoder can hiccup at track transitions on the server — most commonly because tracks have different encoder parameters (sample rate / bitrate / channels), or because frame pacing drops for a moment while the next file is opened. The reconnection here is a defensive workaround; the real fix belongs on the server (normalize encoding across all tracks, pre-load the next track's first frames). Once that's addressed upstream, this client logic can be trimmed back to the bare play/pause handlers.

## Development

### Available Commands

```bash
# Install dependencies (uses pnpm)
pnpm install

# Start dev server
pnpm dev
# or
pnpm start

# Type check and build
pnpm build

# Preview production build
pnpm preview

# Format code with Prettier
pnpm format
```

### Adding a New Blog Post

1. Create the English version:
   ```bash
   touch src/content/blog/en/YYYY-MM-DD-your-slug.md
   ```

2. Create the Portuguese version:
   ```bash
   touch src/content/blog/pt-br/YYYY-MM-DD-your-slug.md
   ```

3. Add frontmatter and content to both files

4. Images go in [public/](public/) and are referenced as `/image.png`

### i18n Configuration

Configured in [astro.config.mjs](astro.config.mjs#L16-L23):
- Default locale: `en`
- Supported locales: `en`, `pt-br`
- All routes are prefixed with locale (including default)
- Root `/` redirects to `/en/`

### Styling

- **Framework:** Tailwind CSS with custom configuration
- **Fonts:**
  - Noto Sans (variable)
  - Zilla Slab
- **Typography:** `@tailwindcss/typography` for blog content
- **Config:** [tailwind.config.cjs](tailwind.config.cjs)
- **Global styles:** [src/styles/](src/styles/)

## Deployment

The site builds with:
```bash
pnpm build
```

Output is in `dist/` directory. Astro performs type checking before building.

## Important Notes

- **All content must be bilingual**: Blog posts and pages require both English and Portuguese versions
- **Date format in filenames**: Use `YYYY-MM-DD-slug.md` for blog posts
- **No locale fallback**: Each language version must be explicitly created
- **Root redirects**: The index page redirects to `/en/` by default
- **Images are static**: Place all images in [public/](public/) directory

## Environment

Check [.env](.env) for any environment variables (not committed to repo per [.gitignore](.gitignore))

## License

GPL-3.0 - See [LICENSE](LICENSE) for details
