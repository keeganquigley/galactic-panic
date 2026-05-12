#!/usr/bin/env bash
#
# Generate ALL release assets for a song: Canvas, Shorts variants,
# YouTube visualizer, lyric video, and a manifest.json listing everything.
#
# Usage:
#   ./scripts/generate-all.sh <song-slug> [chorus-start-seconds]

set -euo pipefail

SLUG="${1:?Usage: generate-all.sh <song-slug> [chorus-start]}"
CHORUS_START="${2:-60}"

SONG_DIR="content/songs/${SLUG}"
OUT_DIR="${SONG_DIR}/output"

if [[ ! -d "$SONG_DIR" ]]; then
  echo "Error: ${SONG_DIR} not found" >&2
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "════════════════════════════════════════════════════════"
echo "  Generating all release assets for: ${SLUG}"
echo "════════════════════════════════════════════════════════"
echo ""

# Run each asset generator. Fail loudly if any one fails.
"$SCRIPT_DIR/generate-canvas.sh" "$SLUG"
echo ""

"$SCRIPT_DIR/generate-shorts.sh" "$SLUG" "$CHORUS_START"
echo ""

"$SCRIPT_DIR/generate-visualizer.sh" "$SLUG"
echo ""

# Lyric video is optional — only run if lyrics are present
if node -e "process.exit(require('./${SONG_DIR}/metadata.json').lyrics ? 0 : 1)" 2>/dev/null; then
  node "$SCRIPT_DIR/generate-lyric-video.js" "$SLUG"
  echo ""
else
  echo "→ Skipping lyric video (no lyrics in metadata.json)"
  echo ""
fi

# --- Generate manifest of all output files ---
echo "→ Writing manifest.json"
node - <<EOF
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const outDir = "${OUT_DIR}";
const meta = JSON.parse(fs.readFileSync("${SONG_DIR}/metadata.json", "utf8"));

function walk(dir) {
  if (!fs.existsSync(dir)) return [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  return entries.flatMap(e => {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) return walk(full);
    if (e.name === "manifest.json") return [];
    const stat = fs.statSync(full);
    return [{
      path: path.relative(outDir, full),
      bytes: stat.size,
      modified: stat.mtime.toISOString(),
    }];
  });
}

const manifest = {
  slug: "${SLUG}",
  title: meta.title,
  generated_at: new Date().toISOString(),
  files: walk(outDir),
};

fs.writeFileSync(path.join(outDir, "manifest.json"), JSON.stringify(manifest, null, 2));
console.log(\`  \${manifest.files.length} files cataloged\`);
EOF

echo ""
echo "════════════════════════════════════════════════════════"
echo "  ✓ All assets generated for ${SLUG}"
echo "════════════════════════════════════════════════════════"
echo ""
echo "Output: ${OUT_DIR}/"
ls -1 "$OUT_DIR" | sed 's/^/  /'
