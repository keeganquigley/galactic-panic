#!/usr/bin/env bash
#
# Generate a full-song YouTube visualizer: cover art with audio waveform overlay.
# Output is 1920x1080, full song length, suitable for uploading as the YouTube
# "audio video" version of the track.
#
# Usage:
#   ./scripts/generate-visualizer.sh <song-slug>
#
# Requires cover.png and master-home.wav (or master-pro.wav) in content/songs/<slug>/

set -euo pipefail

SLUG="${1:?Usage: generate-visualizer.sh <song-slug>}"

SONG_DIR="content/songs/${SLUG}"
COVER="${SONG_DIR}/cover.png"
OUT_DIR="${SONG_DIR}/output"
OUT="${OUT_DIR}/visualizer.mp4"

# Prefer pro master if available
if [[ -f "${SONG_DIR}/master-pro.wav" ]]; then
  AUDIO="${SONG_DIR}/master-pro.wav"
elif [[ -f "${SONG_DIR}/master-home.wav" ]]; then
  AUDIO="${SONG_DIR}/master-home.wav"
else
  echo "Error: no master file found in ${SONG_DIR}" >&2
  exit 1
fi

if [[ ! -f "$COVER" ]]; then
  echo "Error: ${COVER} not found" >&2
  exit 1
fi

mkdir -p "$OUT_DIR"

ffmpeg -y -loop 1 -i "$COVER" -i "$AUDIO" \
  -filter_complex "
    [0:v]scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2:color=black[bg];
    [1:a]showwaves=s=1920x180:mode=line:colors=white|0xcccccc:rate=30[wave];
    [bg][wave]overlay=0:H-h-80[v]
  " \
  -map "[v]" -map 1:a \
  -c:v libx264 -pix_fmt yuv420p -preset medium -crf 18 \
  -c:a aac -b:a 320k \
  -movflags +faststart \
  -shortest \
  "$OUT"

echo "✓ Visualizer generated: $OUT"
echo "  1920x1080, full song length, with waveform overlay"
echo "  Upload to YouTube as the song's audio video"
