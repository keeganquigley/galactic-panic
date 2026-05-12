#!/usr/bin/env bash
#
# Prepare a stems package for sending to a mix engineer.
# Validates the stems folder, generates an MP3 reference from the home mix,
# writes a README with song info, and bundles everything into a zip.
#
# Usage:
#   ./scripts/prepare-stems-package.sh <song-slug>
#
# Requires:
#   - content/songs/<slug>/stems/*.wav
#   - content/songs/<slug>/master-home.wav  (used as reference mix)
#   - content/songs/<slug>/metadata.json

set -euo pipefail

SLUG="${1:?Usage: prepare-stems-package.sh <song-slug>}"

SONG_DIR="content/songs/${SLUG}"
STEMS_DIR="${SONG_DIR}/stems"
META="${SONG_DIR}/metadata.json"
HOME_MIX="${SONG_DIR}/master-home.wav"
PACKAGE_NAME="${SLUG}-stems-package"
PACKAGE_DIR="${SONG_DIR}/${PACKAGE_NAME}"
ZIP_OUT="${SONG_DIR}/${PACKAGE_NAME}.zip"

# --- Validation ---
if [[ ! -d "$STEMS_DIR" ]]; then
  echo "Error: ${STEMS_DIR} not found" >&2
  echo "Export stems from Logic Pro to that folder first." >&2
  exit 1
fi

stem_count=$(find "$STEMS_DIR" -maxdepth 1 -name "*.wav" | wc -l | tr -d ' ')
if [[ "$stem_count" -eq 0 ]]; then
  echo "Error: no .wav files in ${STEMS_DIR}" >&2
  exit 1
fi

if [[ ! -f "$META" ]]; then
  echo "Error: ${META} not found" >&2
  exit 1
fi

if [[ ! -f "$HOME_MIX" ]]; then
  echo "Error: ${HOME_MIX} not found" >&2
  echo "The home mix is needed as a reference for the engineer." >&2
  exit 1
fi

# --- Read metadata ---
TITLE=$(node -e "console.log(require('./${META}').title || '${SLUG}')")
BPM=$(node -e "console.log(require('./${META}').bpm || 'unknown')")
KEY=$(node -e "console.log(require('./${META}').key || 'unknown')")
DURATION=$(node -e "console.log(require('./${META}').duration_seconds || 'unknown')")

echo "→ Preparing stems package for: ${TITLE}"
echo "  ${stem_count} stems found"

# --- Build package ---
rm -rf "$PACKAGE_DIR"
mkdir -p "${PACKAGE_DIR}/stems"

# Copy stems
cp "$STEMS_DIR"/*.wav "${PACKAGE_DIR}/stems/"

# Generate MP3 reference from home mix (320kbps, full quality for monitoring)
echo "→ Generating MP3 reference from home mix"
ffmpeg -y -i "$HOME_MIX" -codec:a libmp3lame -b:a 320k \
  "${PACKAGE_DIR}/REFERENCE_home-mix.mp3" 2>&1 | tail -1

# --- Write README for the engineer ---
cat > "${PACKAGE_DIR}/README.md" <<EOF
# ${TITLE} — stems for mix

Artist: Galactic Panic
Song: ${TITLE}
Slug: ${SLUG}
BPM: ${BPM}
Key: ${KEY}
Duration: ${DURATION}s
Stems: ${stem_count} files

## Files included

- \`stems/\` — individual track stems, 24-bit 48kHz WAV, all start at bar 1, dry
- \`REFERENCE_home-mix.mp3\` — the home mix as a reference for vibe/balance.
  Treat this as direction, not a target — feel free to push further than I did.

## Stem list

$(ls "${PACKAGE_DIR}/stems" | sort | sed 's/^/- /')

## Mix notes

(Edit this section before sending — describe the vibe, references, and any
specific things you want for this song.)

**Vibe:** [describe the vibe and reference artists]

**Reference tracks:** [add 2–3 reference songs the engineer should listen to]

**Specific notes:**
- Vocals: [any direction here]
- Drums: [any direction here]
- Guitars: [any direction here — e.g. "rhythm should sit slightly behind, lead pops"]
- Bass: [DI track + amped track are split — blend to taste]

## Deliverables requested

- Mixed WAV, 24-bit 48kHz, headroom -6dB to -3dB (no limiting on master bus)
- Optional: instrumental version (mix without lead vocal)
- Up to 2 revision rounds included

## Contact

Galactic Panic
[your email]
EOF

# --- Zip it up ---
echo "→ Bundling into zip"
cd "$SONG_DIR"
zip -r "${PACKAGE_NAME}.zip" "$PACKAGE_NAME" -x "*.DS_Store" > /dev/null
cd - > /dev/null

# Clean up the staging folder, keep only the zip
rm -rf "$PACKAGE_DIR"

ZIP_SIZE=$(du -h "$ZIP_OUT" | cut -f1)
echo ""
echo "✓ Package ready: $ZIP_OUT (${ZIP_SIZE})"
echo ""
echo "Next steps:"
echo "  1. Edit the mix notes section before sending — open the zip, edit"
echo "     README.md, re-zip. Or write your notes in the email instead."
echo "  2. Upload to Dropbox/WeTransfer/Google Drive and share the link."
echo "  3. Don't forget to negotiate revision rounds upfront."
