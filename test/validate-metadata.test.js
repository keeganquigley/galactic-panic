// Lean tests for the metadata validator. Focus is on the failure modes that
// actually matter: a track silently vanishing from the site because its
// metadata.json is broken. Built on Node's zero-dependency test runner.
//
//   node --test

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { validateSong, validateAll, listSongDirs } = require("../scripts/validate-metadata.js");

// A known-good metadata object — each test clones this and breaks one thing.
function validMeta(slug = "time-machine") {
  return {
    title: "Time Machine",
    slug,
    release_date_bandcamp: "2026-06-19",
    release_date_spotify: "2026-06-19",
    isrc: "QT6E72633975",
    spotify_url: "https://open.spotify.com/track/0uG3i7Dc76jx0VukKOHzy3",
    bandcamp_url: "https://galacticpanic.bandcamp.com/track/time-machine",
    apple_music_url: "https://music.apple.com/us/album/time-machine-single/6782485195",
    duration_seconds: 0,
    bpm: 100,
    key: "E major",
    story: "Jimmy tears a hole in the space-time continuum.",
    instruments_played: ["guitar", "bass", "drums", "vocals"],
    credits: { writing: "all", performance: "all", mix_home: "", mix_pro: "Ryan Elvert", master: "" },
  };
}

// Creates a temp songs dir; `songs` maps a folder name to either a metadata
// object (written as JSON), a raw string (written verbatim — for malformed
// JSON), or null (folder with no metadata.json). Returns the songs dir path.
function makeSongsDir(songs) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "gp-songs-"));
  for (const [name, value] of Object.entries(songs)) {
    const dir = path.join(root, name);
    fs.mkdirSync(dir, { recursive: true });
    if (value === null) continue;
    const body = typeof value === "string" ? value : JSON.stringify(value, null, 2);
    fs.writeFileSync(path.join(dir, "metadata.json"), body);
  }
  return root;
}

test("valid metadata produces no errors", () => {
  const dir = makeSongsDir({ "time-machine": validMeta() });
  assert.deepEqual(validateSong(dir, "time-machine"), []);
});

test("unquoted ISRC (malformed JSON) is caught — the original incident", () => {
  // exactly how the broken PRs looked: `"isrc": QT6E72686108,`
  const raw = '{\n  "title": "X",\n  "slug": "patti-russell",\n  "isrc": QT6E72686108\n}\n';
  const dir = makeSongsDir({ "patti-russell": raw });
  const errors = validateSong(dir, "patti-russell");
  assert.equal(errors.length, 1);
  assert.match(errors[0], /invalid JSON/);
});

test("missing metadata.json is caught", () => {
  const dir = makeSongsDir({ nessie: null });
  const errors = validateSong(dir, "nessie");
  assert.deepEqual(errors, ["nessie/metadata.json: missing metadata.json"]);
});

test("slug must match the folder name", () => {
  const meta = validMeta("wrong-slug");
  const dir = makeSongsDir({ "time-machine": meta });
  const errors = validateSong(dir, "time-machine");
  assert.ok(errors.some((e) => /must match the folder name/.test(e)));
});

test("a non-string where a string is required is reported", () => {
  const meta = validMeta();
  meta.title = 42; // a string field given a number
  meta.key = null; // and a non-nullable string given null
  const dir = makeSongsDir({ "time-machine": meta });
  const errors = validateSong(dir, "time-machine");
  assert.ok(errors.some((e) => /"title" must be a string \(got 42\)/.test(e)));
  assert.ok(errors.some((e) => /"key" must be a string \(got null\)/.test(e)));
});

test("credits must be an object — null and arrays are rejected", () => {
  const asNull = validMeta();
  asNull.credits = null;
  const dirNull = makeSongsDir({ "time-machine": asNull });
  assert.ok(
    validateSong(dirNull, "time-machine").some((e) => /"credits" must be an object/.test(e))
  );

  const asArray = validMeta();
  asArray.credits = [];
  const dirArray = makeSongsDir({ "time-machine": asArray });
  assert.ok(
    validateSong(dirArray, "time-machine").some((e) => /"credits" must be an object/.test(e))
  );
});

test("bad types and formats are reported per-field", () => {
  const meta = validMeta();
  meta.bpm = "120"; // string, not number
  meta.release_date_spotify = "06/26/2026"; // wrong date format
  meta.isrc = "notanisrc"; // malformed ISRC
  meta.spotify_url = "ftp://nope"; // not http(s)
  meta.instruments_played = "guitar"; // not an array
  const dir = makeSongsDir({ "time-machine": meta });
  const errors = validateSong(dir, "time-machine");
  assert.ok(errors.some((e) => /"bpm" must be a number/.test(e)));
  assert.ok(errors.some((e) => /"release_date_spotify" must be null or a YYYY-MM-DD/.test(e)));
  assert.ok(errors.some((e) => /"isrc" must be null/.test(e)));
  assert.ok(errors.some((e) => /"spotify_url" must be null or an http/.test(e)));
  assert.ok(errors.some((e) => /"instruments_played" must be an array/.test(e)));
});

test("nullable fields accept null; missing credit key is caught", () => {
  const meta = validMeta();
  meta.isrc = null;
  meta.release_date_bandcamp = null;
  meta.spotify_url = null;
  meta.credits.mix_pro = null; // null is allowed for a credit
  delete meta.credits.master; // ...but a missing key is not
  const dir = makeSongsDir({ "time-machine": meta });
  const errors = validateSong(dir, "time-machine");
  assert.deepEqual(errors, ['time-machine/metadata.json: credits."master" is missing']);
});

test("listSongDirs skips _template and non-directories", () => {
  const dir = makeSongsDir({ "time-machine": validMeta(), _template: validMeta("_template") });
  fs.writeFileSync(path.join(dir, "README.md"), "not a song");
  assert.deepEqual(listSongDirs(dir), ["time-machine"]);
});

test("validateAll aggregates errors across songs", () => {
  const dir = makeSongsDir({
    "time-machine": validMeta(),
    "patti-russell": '{ bad json',
  });
  const { songDirs, errors } = validateAll(dir);
  assert.deepEqual(songDirs.sort(), ["patti-russell", "time-machine"]);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /^patti-russell\/metadata\.json: invalid JSON/);
});

// The CLI entrypoint (`npm run validate`, and the CI gate) — run the script as
// a subprocess pointed at a temp SONGS_DIR and assert exit code + output. This
// is the actual contract CI depends on, so it's worth exercising end-to-end.
const CLI = path.join(__dirname, "..", "scripts", "validate-metadata.js");
function runCli(songsDir) {
  const res = spawnSync(process.execPath, [CLI], {
    env: { ...process.env, SONGS_DIR: songsDir },
    encoding: "utf8",
  });
  return { status: res.status, stdout: res.stdout, stderr: res.stderr };
}

test("CLI exits 0 and reports the count when every song is valid", () => {
  const dir = makeSongsDir({ "time-machine": validMeta() });
  const { status, stdout } = runCli(dir);
  assert.equal(status, 0);
  assert.match(stdout, /metadata valid — 1 song checked \(time-machine\)/);
});

test("CLI exits 1 and prints the issues when a song is invalid", () => {
  const dir = makeSongsDir({ "patti-russell": '{ bad json' });
  const { status, stderr } = runCli(dir);
  assert.equal(status, 1);
  assert.match(stderr, /metadata validation failed \(1 issue\)/);
  assert.match(stderr, /patti-russell\/metadata\.json: invalid JSON/);
});

test("CLI exits 1 when the songs directory does not exist", () => {
  const { status, stderr } = runCli(path.join(os.tmpdir(), "gp-does-not-exist-xyz"));
  assert.equal(status, 1);
  assert.match(stderr, /No songs directory at/);
});
