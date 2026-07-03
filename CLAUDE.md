# Galactic Panic — project context

This repo handles two things:
1. Content asset generation for music releases (Canvas, Shorts, visualizers, lyric videos)
2. The Galactic Panic website hosted on GitHub Pages (built with Eleventy)

## Brand

- **Artist:** Galactic Panic
- **Genre:** TBD
- **Voice:** TBD
- **Visual direction:** TBD

## Conventions

- Each song lives in `content/songs/[slug]/`.
- Required files per song: `metadata.json`, `cover.png` (3000x3000), at least one
  master file (`master-home.wav` or `master-pro.wav`).
- Lyrics live in `lyrics.txt` (one line per line, each prefixed with a `[m:ss]`
  timestamp for lyric-video sync), not in `metadata.json`. The site renders
  `lyrics.txt` verbatim in a "Lyrics" section on the song page when non-empty,
  so it doubles as the on-site lyric source.
- Optional: `loop.mp4` (source video for short-form generation).
- Generated assets go in `content/songs/[slug]/output/` — not committed beyond a
  manifest.
- Site is built with Eleventy (11ty), plain HTML/CSS/JS output. No SPA framework.
- Use ffmpeg for all video work; prefer libx264, AAC audio, yuv420p pixel format,
  `+faststart` for web playback.

## metadata.json schema

```json
{
  "title": "string",
  "slug": "string-kebab-case",
  "release_date_bandcamp": "YYYY-MM-DD or null",
  "release_date_spotify": "YYYY-MM-DD or null",
  "isrc": "string or null",
  "spotify_url": "string or null",
  "bandcamp_url": "string or null",
  "apple_music_url": "string or null",
  "duration_seconds": 0,
  "bpm": 0,
  "key": "string (e.g. 'E minor')",
  "story": "string — the behind-the-song blurb, used on song page and press materials",
  "instruments_played": ["guitar", "bass", "drums", "vocals", "..."],
  "credits": {
    "writing": "",
    "performance": "",
    "mix_home": "",
    "mix_pro": "",
    "master": ""
  }
}
```

After editing any `metadata.json`, run `npm run validate` (script:
`scripts/validate-metadata.js`). It checks every song against this schema —
JSON parses, types are right, `slug` matches the folder, dates are `YYYY-MM-DD`,
ISRCs are well-formed. CI runs the same check on every PR
(`.github/workflows/validate.yml`) and before each deploy, because an invalid
`metadata.json` makes the Eleventy build *silently skip* that song.

The validator's logic is unit-tested with Node's built-in test runner (no deps):
`npm test` (or `npm run test:coverage`), tests in `test/`. CI runs them too.

`scripts/validate-metadata.js` is the single source of truth for the schema —
it exports its helpers, and `.eleventy.js` imports `listSongDirs` from it so the
"which folders count as songs" rule (skip non-dirs and `_`-prefixed templates)
is defined in exactly one place rather than restated in the build.

## Common tasks

- **"Generate all assets for [slug]"** — Run scripts/generate-canvas.sh,
  scripts/generate-shorts.sh, scripts/generate-visualizer.sh for that slug.
  Generate a lyric video from `lyrics.txt`. Write a `manifest.json` in the
  output folder listing every file with dimensions and duration. The lyric
  video picks a font per-platform (macOS/Linux); override with the `FONT_PATH`
  env var to use a specific font file.
- **"Add a new song page to the site for [slug]"** — Create
  `site/songs/[slug].md` from the template, ensure metadata.json is in the
  data pipeline. Eleventy will pick it up automatically.
- **"Update homepage with latest release"** — Edit the Eleventy template to
  feature the most recent release.

## Things to NEVER do

- Don't commit master WAVs to git — they're large and don't belong in version
  control. Keep them on the local filesystem; use the manifest for tracking.
