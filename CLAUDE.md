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

### Persistent Playback Across Navigations

Playback survives client-side navigation via Astro's `<ViewTransitions />` (already mounted in [BaseLayout.astro](src/layouts/BaseLayout.astro)) plus `transition:persist` on the audio element and miniplayer. The player itself is a singleton module — [src/lib/radio-player.ts](src/lib/radio-player.ts) — that owns the audio element, SSE subscription, reconnect logic, listener heartbeat, wake lock, and media session. Three UI surfaces share that single source of truth:

- **Full page** ([src/pages/\[lang\]/radio.astro](src/pages/%5Blang%5D/radio.astro)) — big cover with ambient glow, only on `/radio`.
- **Miniplayer** ([src/components/RadioMiniplayer.astro](src/components/RadioMiniplayer.astro)) — slim fixed-bottom bar, mounted in BaseLayout, hidden on `/radio` and when no track is loaded. Hosts the persisted `<audio>` element.
- **Callout** ([src/components/RadioCallout.astro](src/components/RadioCallout.astro)) — inline component for embedding in content (currently demoed on the about page; intended for the future radio deep-dive blog post). Clicking play kickstarts the radio, which then surfaces the miniplayer site-wide.

Each surface calls `getRadioPlayer(audio, api)` to grab the singleton, then `subscribe()` for state updates and `toggle()` for play/pause. Scripts re-run on `astro:page-load` even inside persisted elements, so initialization is guarded by `window.__radioPlayer` and per-surface bindings (miniplayer) are guarded by `window.__radioMiniplayerBound`. Page-scoped surfaces (radio page, callout) re-bind their own listeners every navigation and clean up on `astro:before-preparation`.

### Audio-Reactive Glow (opt-in analysis tap)

Two surfaces can pulse with the live stream:
- the [AmbientGlowSandbox](src/components/AmbientGlowSandbox.astro) in the lofi post, with a spectrum and an amount slider;
- the `/radio` page's cover glow, via a "✨ Pulse" toggle that's hidden where analysis can't work.

Both drive their glow through [src/lib/glow-pulse-driver.ts](src/lib/glow-pulse-driver.ts), which owns the rAF loop, the silence-fed tail and `requestTap()`, the one sanctioned tap sequence.

On `/radio`, once the session is tapped (here or in the sandbox), the glow pulses by default. Two things override that: the session-scoped on/off intent (`window.__radioPulseIntent`, survives client-side navigation), and `prefers-reduced-motion`, which defaults it off. Pulse layers are double-buffered, so track changes crossfade.

**Recording mode** (promo clips, see `docs/video-recording.md` in lofi-radio's `campaign/dj-controls`). `/radio` query params:
- `?stage` strips the page to cover, metadata and glow, and hides the Pulse toggle.
- `?drift=<amp>&driftSpeed=<x>` slowly drifts the blobs. Unlike `?pulse`, it does nothing under reduced motion.
- `?theme=light|dark` forces the colour scheme.
- `?pulse=<0–3>` sets the pulse strength; a bare `?pulse` means 1, and `0` forces it off. It writes the session intent, overriding reduced motion. With `?pulse` > 0, the page's own play button performs the tap inside that click.

Drift and pulse compose. While pulsing, the 24fps static drift repaint stops and each pulse child adds its drift as a translate: the delta between `computeBlobs(colors, opts, phase)` and the phase-0 geometry, so clamping matches the static render. Everything stays compositor-only.

**Pulse experiments** (for comparing approaches in the browser). These work on `/radio` and in the blog sandbox. In the sandbox, any of them also shows a live control panel with a link that opens `/radio` with the same settings, and swaps the demo image for the radio's current album cover, following track changes. Upload or Randomize turns that off; the panel's checkbox turns it back on.
- `?pulseMode=` chooses the behaviour (`PULSE_MODES` in [ambient-glow](src/lib/ambient-glow/index.ts)):
  - `bands` (default): each blob swells with its own frequency band.
  - `kick`: a big whole-glow thump on kicks.
  - `transients`: blobs pop on sudden hits in their band.
  - `colour`: hue, saturation and brightness shift instead of size.
  - `breathe`: a slow loudness swell.
  - `orbit`: blobs circle the cover, faster with treble and kicks.
  - `boombap`: the kick thumps, the snare flashes and spreads, and the hats sparkle the small blobs.
- `?pulseBass`, `pulseTreble`, `pulseKick`, `pulseSnare`, `pulseShimmer` (0–4): visual multipliers, default 1.
- `?pulseSmooth` (0.25–4): release/decay scale.
- `?pulseKickShape` (1–6, default 2) and `?pulseSnareStrict` (1–6, default 3.5): drum-detector thresholds.
- Parsing lives in [src/lib/pulse-params.ts](src/lib/pulse-params.ts).

Drum detection is imperfect by nature, since it works on a mixed-down spectrum. It classifies each sudden rise by how unusual it is per region (low / body / crack / air). [scripts/pulse-eval.mjs](scripts/pulse-eval.mjs) scores the detectors against a synthetic boom-bap loop with known hit times, and reports hit rates on real MP3s (`node scripts/pulse-eval.mjs song.mp3`). Re-run it when changing detection.

The underlying layers:

- **[src/lib/audio-pulse.ts](src/lib/audio-pulse.ts)** is pure feature extraction from `AnalyserNode` byte arrays: loudness, 8 log-spaced bands with a noise gate and AGC, beats from low-end spectral flux, and spectral centroid. It's unit-tested.
- **[src/lib/ambient-glow/index.ts](src/lib/ambient-glow/index.ts)** handles pulse rendering. `glow.setPulse(frame)` swaps the static layers for one element per blob (majors in bounding boxes, side blooms layer-sized so they stay clipped like the static render). Each frame writes only `transform`/`opacity` (compositor-only), and `setPulse(null)` swaps back. The static `buildGradient` output is golden-tested to stay byte-identical, and `pulseAmount` scales the effect (0 = static).
- **`player.enableAnalysis()`** in [radio-player.ts](src/lib/radio-player.ts) creates the tap. **Only an explicit click may call it** (through `requestTap()` in the pulse driver). That means the sandbox's pulse button, the `/radio` Pulse toggle, or the `/radio` play button when the URL has `?pulse` > 0. Never call it on mount or on a plain play, because the tap lasts the whole page session:
  - It sets `crossOrigin="anonymous"` on the persisted `<audio>` (reconnecting once). So from then on the stream depends on lofi-radio sending `Access-Control-Allow-Origin` on `/stream`.
  - On Chromium it uses `audio.captureStream()`, and the element keeps its own output path.
  - On Firefox it uses `createMediaElementSource`, which **reroutes the element's output through the AudioContext** permanently. For that mode the player enforces "tapped && wantPlaying ⇒ context running" in `connect()`, on `statechange`, and on visibility resume. If the context can't be resumed, it stops rather than play silence.
  - **Safari and every iOS browser get no tap** (`chooseTapMode` in [audio-tap-guard.ts](src/lib/audio-tap-guard.ts) returns null, and the sandbox says the browser can't analyse the stream). WebKit's `MediaElementAudioSourceNode` outputs silence for chunked, length-less streams like `/stream`, so routing there would mute the radio. This was verified in Playwright WebKit: a CORS file works, while the chunked stream reads all zeros.

Tests: `pnpm test` (`node --test`, Node ≥ 23.6 for native TS type stripping, no extra deps).

**Future work:** the miniplayer chrome is currently sized for mobile (full-width fixed bar). A desktop variant should be smaller and less prominent (e.g., bottom-right floating pill) — same player module, different chrome.

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

# Unit tests (node --test)
pnpm test

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

### Trailing Slashes (important for internal links)

The site enforces **trailing slashes on every URL**: `trailingSlash: 'always'` in [astro.config.mjs](astro.config.mjs) and `"trailingSlash": true` in [vercel.json](vercel.json) (Vercel 308-redirects no-slash → slash in prod). This keeps URLs consistent with the canonical tag, hreflang links, and sitemap — all of which use the slash form — so there's no duplicate-content risk.

**Consequence:** any internal link you build **by hand** MUST end with `/`, e.g. `` `/${lang}/radio/` `` not `` `/${lang}/radio` ``. Without the slash the dev server returns a **404** (and prod does a needless extra 308 hop). This applies in three places, all easy to miss:

1. **Astro markup** — string-concatenated `href` attributes (not those derived from `Astro.url.pathname`, which already carry the slash).
2. **Client scripts** — runtime `el.setAttribute('href', …)` / `el.href = …`. The radio components re-set their link href on `astro:page-load`, which silently **overwrites** a correct markup href with a slashless one if you forget. Both the markup and the script must use the slash.
3. **Markdown/MDX content** — hand-written cross-post links like `[here](/en/blog/slug/)`.

Helpers like `translatePath` ([src/i18n/utils.ts](src/i18n/utils.ts)) and the `PostPreview` href already append it — match that pattern when adding new links.

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
