# 🚀 Galactic Panic

The band website for Galactic Panic — a static site built with
[Eleventy](https://www.11ty.dev/) and hosted on GitHub Pages.

**Live site:** https://galacticpanic.com

**Traffic analytics:** https://galacticpanic.goatcounter.com

## Quick start

```bash
# install dependencies
npm install

# serve the site locally with live reload (http://localhost:8080)
npm run dev

# production build (outputs to site/_site/)
npm run build
```

## Structure

```
content/songs/[slug]/     # one folder per song — the site's data source
  metadata.json           # song info, links, credits (see schema in CLAUDE.md)
  lyrics.txt              # lyrics, rendered verbatim on the song page
  cover.png               # cover art (3000x3000 master; resized at build time)

site/                     # Eleventy source (templates, data, assets, CSS)
site/_site/               # build output (git-ignored)
lib/eleventy-helpers.js   # build helpers (structured data, dates, etc.)
scripts/validate-metadata.js  # metadata schema validator (run in CI + build)
.eleventy.js              # Eleventy config
CLAUDE.md                 # project context and conventions
```

## Adding or editing a song

1. Create `content/songs/[slug]/` with `metadata.json`, `cover.png`, and
   (optionally) `lyrics.txt`. Copy `content/songs/_template/` as a starting
   point.
2. Run `npm run validate` to check the metadata against the schema. **This
   matters:** an invalid `metadata.json` makes Eleventy *silently skip* that
   song, so CI runs the same check on every PR and before each deploy.
3. `npm run dev` and confirm the song page renders at `/songs/[slug]/`.

The `metadata.json` schema and full conventions live in
[CLAUDE.md](CLAUDE.md).

## Deployment

Pushing to `main` triggers `.github/workflows/deploy.yml`, which validates,
tests, builds, and publishes to GitHub Pages. A daily scheduled rebuild also
runs so date-based content (past shows, scheduled releases) updates without a
manual push.

## Tests

```bash
npm test              # run the unit tests (Node's built-in test runner, no deps)
npm run test:coverage # with coverage
```

## Requirements

- Node 22+
```

