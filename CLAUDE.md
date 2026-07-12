# Galactic Panic — project context

This repo is the **Galactic Panic band website**: a static site built with
Eleventy (11ty) and hosted on GitHub Pages at https://galacticpanic.com.
Plain HTML/CSS/JS output — no SPA framework.

(Content-asset generation — Canvas, Shorts, visualizers, lyric videos — used to
live here too and has been split out into a separate repo. This repo is the
website only.)

## Brand

- **Artist:** Galactic Panic
- **Genre:** TBD
- **Voice:** TBD
- **Visual direction:** TBD

## Conventions

- Each song lives in `content/songs/[slug]/` and is the site's data source.
- Required files per song: `metadata.json` and `cover.png` (3000x3000 — Eleventy
  generates resized/responsive variants at build time).
- Lyrics live in `lyrics.txt`, one line per line. The site renders `lyrics.txt`
  verbatim in a "Lyrics" section on the song page when non-empty. Blank lines
  are preserved as gaps between verses.
- `content/songs/_template/` is a copy-me starting point for a new song. Folders
  whose name starts with `_` are skipped by the build.
- The build output goes to `site/_site/` (git-ignored).

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

- **"Add a new song to the site for [slug]"** — Copy `content/songs/_template/`
  to `content/songs/[slug]/`, fill in `metadata.json`, drop in `cover.png` and
  (optionally) `lyrics.txt`. Run `npm run validate`, then `npm run dev` and
  confirm the page renders at `/songs/[slug]/`. Eleventy picks it up
  automatically.
- **"Update homepage with latest release"** — Edit the Eleventy template
  (`site/index.njk`) to feature the most recent release.
