#!/usr/bin/env bash
#
# Generate short-form content variants for TikTok, Reels, and YouTube Shorts.
# Produces three versions:
#   1. Hook clip — first 30s, vertical 9:16
#   2. Chorus clip — 25s starting at a configurable timestamp, vertical 9:16
#   3. Square version — 60s for Instagram feed, 1:1
#
# Usage:
#   ./scripts/generate-shorts.sh <song-slug> [chorus-start-seconds]
#
# Requires loop.mp4 and master-home.wav (or master-pro.wav) in content/songs/<slug>/

set -euo pipefail

SLUG="${1:?Usage: generate-shorts.sh <song-slug> [chorus-start]}"
CHORUS_START="${2:-60}"

SONG_DIR="content/songs/${SLUG}"
VIDEO_SOURCE="${SONG_DIR}/loop.mp4"
OUT_DIR="${SONG_DIR}/output/shorts"

# Prefer pro master if available, fall back to home master
if [[ -f "${SONG_DIR}/master-pro.wav" ]]; then
  AUDIO_SOURCE="${SONG_DIR}/master-pro.wav"
elif [[ -f "${SONG_DIR}/master-home.wav" ]]; then
  AUDIO_SOURCE="${SONG_DIR}/master-home.wav"
else
  echo "Error: no master file found in ${SONG_DIR}" >&2
  exit 1
fi

if [[ ! -f "$VIDEO_SOURCE" ]]; then
  echo "Error: ${VIDEO_SOURCE} not found" >&2
  exit 1
fi

mkdir -p "$OUT_DIR"

# --- Variant 1: hook clip (first 30s, vertical) ---
echo "→ Generating hook-30s.mp4"
ffmpeg -y -stream_loop -1 -i "$VIDEO_SOURCE" -i "$AUDIO_SOURCE" \
  -t 30 \
  -vf "scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920" \
  -map 0:v -map 1:a \
  -c:v libx264 -pix_fmt yuv420p -preset medium -crf 20 \
  -c:a aac -b:a 192k \
  -movflags +faststart \
  -shortest "${OUT_DIR}/hook-30s.mp4"

# --- Variant 2: chorus clip (25s from chorus start, vertical) ---
echo "→ Generating chorus-25s.mp4 (starting at ${CHORUS_START}s)"
ffmpeg -y -stream_loop -1 -i "$VIDEO_SOURCE" -ss "$CHORUS_START" -i "$AUDIO_SOURCE" \
  -t 25 \
  -vf "scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920" \
  -map 0:v -map 1:a \
  -c:v libx264 -pix_fmt yuv420p -preset medium -crf 20 \
  -c:a aac -b:a 192k \
  -movflags +faststart \
  -shortest "${OUT_DIR}/chorus-25s.mp4"

# --- Variant 3: square version (60s, 1:1) ---
echo "→ Generating square-60s.mp4"
ffmpeg -y -stream_loop -1 -i "$VIDEO_SOURCE" -i "$AUDIO_SOURCE" \
  -t 60 \
  -vf "scale=1080:1080:force_original_aspect_ratio=increase,crop=1080:1080" \
  -map 0:v -map 1:a \
  -c:v libx264 -pix_fmt yuv420p -preset medium -crf 20 \
  -c:a aac -b:a 192k \
  -movflags +faststart \
  -shortest "${OUT_DIR}/square-60s.mp4"

echo ""
echo "✓ Shorts generated in $OUT_DIR"
echo "  hook-30s.mp4    — TikTok/Reels/Shorts (first 30s)"
echo "  chorus-25s.mp4  — TikTok/Reels/Shorts (chorus, ${CHORUS_START}s in)"
echo "  square-60s.mp4  — Instagram feed (60s)"
