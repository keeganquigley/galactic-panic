#!/usr/bin/env bash
#
# Shared helpers for the asset-generation scripts (generate-*.sh). Source it
# near the top of a script, regardless of the caller's working directory:
#
#   source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
#
# Helpers echo their result on stdout so callers capture them with $(...).
# This file is sourced, not executed — it defines functions and does nothing
# on its own.

# resolve_master <song-dir>
# Echo the path to the song's master audio, preferring the professional mix
# over the home mix. Returns 1 with a message on stderr if neither exists —
# under the callers' `set -e`, that aborts the script as before.
#
# Masters are WAV and live on the local filesystem only (never committed; see
# CLAUDE.md). This prefer-pro/fall-back-home rule lives here so a change lands
# in one place across every generator.
resolve_master() {
  local song_dir="$1"
  if [[ -f "${song_dir}/master-pro.wav" ]]; then
    echo "${song_dir}/master-pro.wav"
  elif [[ -f "${song_dir}/master-home.wav" ]]; then
    echo "${song_dir}/master-home.wav"
  else
    echo "Error: no master file found in ${song_dir}" >&2
    return 1
  fi
}

# fill_crop <width> <height>
# Echo the ffmpeg -vf value that scales a source to fill WxH (cover) and then
# center-crops it to exactly WxH — the vertical/square crop shared by the
# canvas and shorts generators.
fill_crop() {
  local w="$1" h="$2"
  echo "scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h}"
}
