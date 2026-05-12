# Keegan Quigley Music

The infrastructure repo for the Keegan Quigley Music project — content asset
generation for releases, plus the keeganquigleymusic.com website.

## Quick start

```bash
# install dependencies
npm install

# spin up the website locally
npm run dev

# generate release assets for a song
./scripts/generate-all.sh [song-slug]

# prepare stems package for sending to a mix engineer
./scripts/prepare-stems-package.sh [song-slug]
```

## Structure

```
content/songs/[slug]/         # one folder per song
  metadata.json               # song info, lyrics, credits
  cover.png                   # 3000x3000 cover art
  master-home.wav             # self-mixed master (Bandcamp version)
  master-pro.wav              # professionally mixed master (Spotify version)
  loop.mp4                    # source video for short-form content
  stems/                      # exported stems for mix engineer
  output/                     # generated assets (Canvas, Shorts, etc.)

content/releases/             # release-level metadata (separate from per-song)
  bandcamp-demos-vol-1/
  spotify-singles/[slug]/

scripts/                      # ffmpeg + bundling automation
site/                         # Eleventy site (GitHub Pages output)
CLAUDE.md                     # context for Claude Code
```

## Workflow

See `CLAUDE.md` for the canonical workflow and conventions. Short version:

1. Finish a song in GarageBand.
2. Drop master + cover + metadata into `content/songs/[slug]/`.
3. Shoot a `loop.mp4` (you playing, b-roll, whatever — vertical 9:16 ideally).
4. Run `./scripts/generate-all.sh [slug]` to produce all release assets.
5. Upload to Bandcamp (home version) or, after temp check, send stems out for
   pro mix and release on Spotify.

## Dependencies

- ffmpeg (for video generation)
- node 18+ (for Eleventy)
- imagemagick (optional, for cover art resizing)

```bash
brew install ffmpeg node imagemagick   # macOS
```
