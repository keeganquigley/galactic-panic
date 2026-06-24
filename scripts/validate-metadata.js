#!/usr/bin/env node
//
// Validates every content/songs/<slug>/metadata.json against the schema in
// CLAUDE.md. The Eleventy build silently *skips* songs whose metadata.json is
// invalid (see the try/catch in .eleventy.js), so a broken file means a track
// quietly vanishes from the site. This script fails loudly instead — run it
// locally with `npm run validate` and in CI on every PR.
//
// Zero runtime dependencies on purpose: it runs under a bare `npm ci` with no
// extra packages. The validation logic is exported (see module.exports) so it
// can be unit-tested; running the file directly runs the CLI.

const fs = require("fs");
const path = require("path");

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const ISRC_RE = /^[A-Z]{2}[A-Z0-9]{3}\d{2}\d{5}$/; // CC-XXX-YY-NNNNN, no dashes
const CREDIT_KEYS = ["writing", "performance", "mix_home", "mix_pro", "master"];

// A string, or null when `nullable` is set.
function checkStr(fail, obj, key, { nullable = false } = {}) {
  const v = obj[key];
  if (v === null && nullable) return;
  if (typeof v !== "string") {
    fail(`"${key}" must be a ${nullable ? "string or null" : "string"} (got ${JSON.stringify(v)})`);
  }
}

function checkDate(fail, obj, key) {
  const v = obj[key];
  if (v === null) return;
  if (typeof v !== "string" || !DATE_RE.test(v)) {
    fail(`"${key}" must be null or a YYYY-MM-DD date (got ${JSON.stringify(v)})`);
  }
}

function checkUrl(fail, obj, key) {
  const v = obj[key];
  if (v === null) return;
  if (typeof v !== "string" || !/^https?:\/\//.test(v)) {
    fail(`"${key}" must be null or an http(s) URL (got ${JSON.stringify(v)})`);
  }
}

function checkNumber(fail, obj, key) {
  if (typeof obj[key] !== "number" || Number.isNaN(obj[key])) {
    fail(`"${key}" must be a number (got ${JSON.stringify(obj[key])})`);
  }
}

// Validates a single song directory. Returns an array of error strings
// (empty when the song is valid).
function validateSong(songsDir, dirName) {
  const errors = [];
  const fail = (msg) => errors.push(`${dirName}/metadata.json: ${msg}`);

  const metaPath = path.join(songsDir, dirName, "metadata.json");
  if (!fs.existsSync(metaPath)) {
    fail("missing metadata.json");
    return errors;
  }

  let meta;
  try {
    meta = JSON.parse(fs.readFileSync(metaPath, "utf8"));
  } catch (e) {
    // The classic break: an unquoted ISRC or trailing comma. JSON.parse
    // throws here, which is exactly the silent-skip the build hits.
    fail(`invalid JSON — ${e.message}`);
    return errors;
  }

  checkStr(fail, meta, "title");
  checkStr(fail, meta, "slug");
  if (typeof meta.slug === "string") {
    if (!SLUG_RE.test(meta.slug)) fail(`"slug" must be kebab-case (got ${JSON.stringify(meta.slug)})`);
    if (meta.slug !== dirName) fail(`"slug" (${JSON.stringify(meta.slug)}) must match the folder name (${dirName})`);
  }

  checkDate(fail, meta, "release_date_bandcamp");
  checkDate(fail, meta, "release_date_spotify");

  if (meta.isrc !== null && (typeof meta.isrc !== "string" || !ISRC_RE.test(meta.isrc))) {
    fail(`"isrc" must be null or a 12-char ISRC like "QT6E72633975" (got ${JSON.stringify(meta.isrc)})`);
  }

  checkUrl(fail, meta, "spotify_url");
  checkUrl(fail, meta, "bandcamp_url");

  checkNumber(fail, meta, "duration_seconds");
  checkNumber(fail, meta, "bpm");

  checkStr(fail, meta, "key");
  checkStr(fail, meta, "story");

  if (!Array.isArray(meta.instruments_played) || !meta.instruments_played.every((i) => typeof i === "string")) {
    fail(`"instruments_played" must be an array of strings (got ${JSON.stringify(meta.instruments_played)})`);
  }

  if (meta.credits === null || typeof meta.credits !== "object" || Array.isArray(meta.credits)) {
    fail(`"credits" must be an object`);
  } else {
    for (const key of CREDIT_KEYS) {
      if (!(key in meta.credits)) {
        fail(`credits."${key}" is missing`);
      } else {
        checkStr(fail, meta.credits, key, { nullable: true });
      }
    }
  }

  return errors;
}

// Lists song directories under songsDir, skipping non-directories and
// `_`-prefixed folders (e.g. _template) — matching the Eleventy build.
function listSongDirs(songsDir) {
  return fs
    .readdirSync(songsDir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && !d.name.startsWith("_"))
    .map((d) => d.name);
}

// Validates every song under songsDir. Returns { songDirs, errors }.
function validateAll(songsDir) {
  const songDirs = listSongDirs(songsDir);
  const errors = [];
  for (const dir of songDirs) errors.push(...validateSong(songsDir, dir));
  return { songDirs, errors };
}

function main() {
  const songsDir =
    process.env.SONGS_DIR || path.join(__dirname, "..", "content", "songs");

  if (!fs.existsSync(songsDir)) {
    console.error(`No songs directory at ${songsDir}`);
    process.exit(1);
  }

  const { songDirs, errors } = validateAll(songsDir);

  if (errors.length) {
    console.error(`✗ metadata validation failed (${errors.length} issue${errors.length === 1 ? "" : "s"}):\n`);
    console.error(errors.map((e) => `  ${e}`).join("\n"));
    console.error("");
    process.exit(1);
  }

  console.log(`✓ metadata valid — ${songDirs.length} song${songDirs.length === 1 ? "" : "s"} checked (${songDirs.join(", ")})`);
}

if (require.main === module) main();

module.exports = { validateSong, validateAll, listSongDirs };
