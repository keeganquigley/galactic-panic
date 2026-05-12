#!/usr/bin/env bash
#
# Generate a Spotify Canvas: a 3–8 second vertical (9:16) silent video loop
# that plays behind the album art on the Spotify mobile app.
#
# Usage:
#   ./scripts/generate-canvas.sh <song-slug> [duration-seconds]
#
# Requires loop.mp4 in content/songs/<slug>/

set -euo pipefail

SLUG="${1:?Usage: generate-canvas.sh <song-slug> [duration]}"
DURATION="${2:-7}"

SONG_DIR="content/songs/${SLUG}"
SOURCE="${SONG_DIR}/loop.mp4"
OUT_DIR="${SONG_DIR}/output"
OUT="${OUT_DIR}/canvas.mp4"

if [[ ! -f "$SOURCE" ]]; then
  echo "Error: ${SOURCE} not found" >&2
  exit 1
fi

mkdir -p "$OUT_DIR"

ffmpeg -y -i "$SOURCE" \
  -t "$DURATION" \
  -vf "scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920" \
  -an \
  -c:v libx264 -pix_fmt yuv420p -preset slow -crf 20 \
  -movflags +faststart \
  "$OUT"

echo "✓ Canvas generated: $OUT"
echo "  Duration: ${DURATION}s, 1080x1920, no audio"
echo "  Upload via Spotify for Artists → Canvas"
