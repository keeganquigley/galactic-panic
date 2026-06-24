# Per-song folder template

Copy this folder to start a new song:

```bash
cp -r content/songs/_template content/songs/your-song-slug
```

Then drop in:

- `master-home.wav` — your home mix (24-bit 48kHz preferred)
- `master-pro.wav` — the pro-mixed version when it exists (later)
- `cover.png` — 3000x3000, square, JPG or PNG
- `loop.mp4` — source video for short-form generation. Vertical 9:16 ideal,
  but the scripts will crop/scale anything. Make it at least as long as your
  longest planned clip (~60s).

Edit `metadata.json` with the real values for the song.

Put lyrics in `lyrics.txt` (one line per line), each prefixed with a `[m:ss]`
timestamp for lyric-video sync, e.g.:

```
[0:00] When the lights go down
[0:04] I can hear you breathing
[0:08] Through the walls of this old house
```

Lines without timestamps are ignored (treat them as section markers in your
notes if you want — they won't make it into the lyric video).

When ready to generate assets:

```bash
./scripts/generate-all.sh your-song-slug
```
