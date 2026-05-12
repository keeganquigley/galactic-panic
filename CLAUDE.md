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
- Optional: `loop.mp4` (source video for short-form generation), `stems/` folder.
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
  "duration_seconds": 0,
  "bpm": 0,
  "key": "string (e.g. 'E minor')",
  "lyrics": "string with [mm:ss] timestamps for lyric video generation",
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

## Common tasks

- **"Generate all assets for [slug]"** — Run scripts/generate-canvas.sh,
  scripts/generate-shorts.sh, scripts/generate-visualizer.sh for that slug.
  Generate a lyric video from metadata.json. Write a `manifest.json` in the
  output folder listing every file with dimensions and duration.
- **"Add a new song page to the site for [slug]"** — Create
  `site/songs/[slug].md` from the template, ensure metadata.json is in the
  data pipeline. Eleventy will pick it up automatically.
- **"Update homepage with latest release"** — Edit the Eleventy template to
  feature the most recent release.

## Things to NEVER do

- Don't commit master WAVs to git — they're large and don't belong in version
  control. Keep them on the local filesystem; use the manifest for tracking.
