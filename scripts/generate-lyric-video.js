#!/usr/bin/env node
//
// Generate a lyric video from timestamped lyrics in lyrics.txt.
// Produces an ffmpeg drawtext filter chain with each lyric line displayed
// at its timestamp, fading in/out smoothly.
//
// Usage:
//   node scripts/generate-lyric-video.js <song-slug>
//
// Lyrics format — content/songs/<slug>/lyrics.txt, one line per line:
//   [0:00] First line
//   [0:04] Second line
//   [0:09] Third line
// Lines without a [m:ss] timestamp are ignored (treat as section markers).

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const slug = process.argv[2];
if (!slug) {
  console.error("Usage: node scripts/generate-lyric-video.js <song-slug>");
  process.exit(1);
}

const songDir = path.join("content", "songs", slug);
const metaPath = path.join(songDir, "metadata.json");
const lyricsPath = path.join(songDir, "lyrics.txt");
const coverPath = path.join(songDir, "cover.png");
const outDir = path.join(songDir, "output");
const outPath = path.join(outDir, "lyric-video.mp4");

if (!fs.existsSync(metaPath)) {
  console.error(`Error: ${metaPath} not found`);
  process.exit(1);
}

const meta = JSON.parse(fs.readFileSync(metaPath, "utf8"));

// Pick the audio source — prefer pro, fall back to home
const audioPath = fs.existsSync(path.join(songDir, "master-pro.wav"))
  ? path.join(songDir, "master-pro.wav")
  : path.join(songDir, "master-home.wav");

if (!fs.existsSync(audioPath)) {
  console.error(`Error: no master file found in ${songDir}`);
  process.exit(1);
}

if (!fs.existsSync(lyricsPath)) {
  console.error(`Error: ${lyricsPath} not found`);
  process.exit(1);
}

const lyrics = fs.readFileSync(lyricsPath, "utf8");
if (!lyrics || lyrics.trim().length === 0) {
  console.error(`Error: ${lyricsPath} is empty`);
  process.exit(1);
}

// Parse lyrics: each line should start with [m:ss] or [mm:ss]
// Lines without timestamps are skipped (treat them as section markers)
const lines = lyrics
  .split("\n")
  .map((l) => l.trim())
  .filter(Boolean)
  .map((line) => {
    const match = line.match(/^\[(\d+):(\d{2})\]\s*(.+)$/);
    if (!match) return null;
    const minutes = parseInt(match[1], 10);
    const seconds = parseInt(match[2], 10);
    return {
      time: minutes * 60 + seconds,
      text: match[3],
    };
  })
  .filter(Boolean);

if (lines.length === 0) {
  console.error("Error: no timestamped lyrics found. Format: [m:ss] line");
  process.exit(1);
}

// Compute end times — each line displays until the next line starts
const songDuration = meta.duration_seconds || lines[lines.length - 1].time + 5;
const FADE = 0.4; // seconds of fade in/out
const events = lines.map((line, i) => ({
  start: line.time,
  end: i < lines.length - 1 ? lines[i + 1].time : songDuration,
  text: line.text,
}));

// Escape text for ffmpeg drawtext (single quotes, colons, percent signs, brackets)
function escapeForDrawtext(s) {
  return s
    .replace(/\\/g, "\\\\\\\\")
    .replace(/'/g, "\\\\\\'")
    .replace(/:/g, "\\\\:")
    .replace(/%/g, "\\\\%")
    .replace(/,/g, "\\\\,")
    .replace(/\[/g, "\\\\[")
    .replace(/\]/g, "\\\\]");
}

// Build the drawtext filter chain. Each line gets its own drawtext with
// alpha-fade controlled by enable/between() and st/et fade.
const drawtextFilters = events
  .map((e) => {
    const safeText = escapeForDrawtext(e.text);
    const fadeIn = `if(lt(t,${e.start + FADE}), (t-${e.start})/${FADE}, 1)`;
    const fadeOut = `if(gt(t,${e.end - FADE}), (${e.end}-t)/${FADE}, 1)`;
    return [
      `drawtext=fontfile=/System/Library/Fonts/Helvetica.ttc`,
      `text='${safeText}'`,
      `fontsize=64`,
      `fontcolor=white`,
      `x=(w-text_w)/2`,
      `y=(h-text_h)/2+200`,
      `box=1`,
      `boxcolor=black@0.4`,
      `boxborderw=20`,
      `alpha='if(between(t,${e.start},${e.end}), min(${fadeIn}, ${fadeOut}), 0)'`,
      `enable='between(t,${e.start - FADE},${e.end + FADE})'`,
    ].join(":");
  })
  .join(",");

// Background = scaled cover, slightly darkened so text is readable
const filterComplex = `
[0:v]scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2:color=black,eq=brightness=-0.15[bg];
[bg]${drawtextFilters}[v]
`.trim().replace(/\n/g, "");

fs.mkdirSync(outDir, { recursive: true });

const cmd = [
  "ffmpeg -y",
  `-loop 1 -i "${coverPath}"`,
  `-i "${audioPath}"`,
  `-filter_complex "${filterComplex}"`,
  `-map "[v]" -map 1:a`,
  "-c:v libx264 -pix_fmt yuv420p -preset medium -crf 18",
  "-c:a aac -b:a 320k",
  "-movflags +faststart",
  "-shortest",
  `"${outPath}"`,
].join(" ");

console.log(`→ Generating lyric video for "${meta.title}" (${events.length} lines)`);
console.log(`  ${audioPath} + ${coverPath} → ${outPath}`);

try {
  execSync(cmd, { stdio: "inherit" });
  console.log(`\n✓ Lyric video generated: ${outPath}`);
} catch (err) {
  console.error("ffmpeg failed.");
  console.error("Note: this script uses Helvetica from macOS system fonts.");
  console.error("On Linux, change the fontfile path in the script.");
  process.exit(1);
}
