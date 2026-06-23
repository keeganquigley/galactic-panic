# 🚀 Galactic Panic

The infrastructure repo for Galactic Panic — content asset generation for
releases, plus the band website.

**Live site:** https://keeganquigley.github.io/galactic-panic/

## Quick start

```bash
# install dependencies
npm install

# spin up the website locally
npm run dev

# generate release assets for a song
./scripts/generate-all.sh [song-slug]
```

## Structure

```
content/songs/[slug]/         # one folder per song
  metadata.json               # song info, lyrics, credits
  cover.png                   # 3000x3000 cover art
  master-home.wav             # self-mixed master
  master-pro.wav              # professionally mixed master
  loop.mp4                    # source video for short-form content
  output/                     # generated assets (Canvas, Shorts, etc.)

scripts/                      # ffmpeg + bundling automation
site/                         # Eleventy site (GitHub Pages output)
CLAUDE.md                     # context for Claude Code
```

## Workflow

See `CLAUDE.md` for the canonical workflow and conventions. Short version:

1. Finish a song.
2. Drop master + cover + metadata into `content/songs/[slug]/`.
3. Shoot a `loop.mp4` (performance footage, b-roll — vertical 9:16 ideally).
4. Run `./scripts/generate-all.sh [slug]` to produce all release assets.
5. Upload to streaming platforms.

## Dependencies

- ffmpeg (for video generation)
- node 18+ (for Eleventy)
- imagemagick (optional, for cover art resizing)

```bash
brew install ffmpeg node imagemagick   # macOS
```
