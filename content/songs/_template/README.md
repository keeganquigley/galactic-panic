# Per-song folder template

Copy this folder to start a new song:

```bash
cp -r content/songs/_template content/songs/your-song-slug
```

Then provide:

- `cover.png` — 3000x3000, square (Eleventy generates resized variants at build
  time)
- `metadata.json` — edit with the real values for the song (`slug` must match
  the folder name; see the schema in `CLAUDE.md`)
- `lyrics.txt` — one line per line, rendered verbatim in the "Lyrics" section of
  the song page. Leave a blank line between verses. Delete the file (or leave it
  empty) if the song has no lyrics to show.

Then validate and preview:

```bash
npm run validate     # catch schema errors before they silently skip the song
npm run dev          # confirm the page renders at /songs/your-song-slug/
```
