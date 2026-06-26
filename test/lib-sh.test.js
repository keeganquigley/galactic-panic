// Tests for scripts/lib.sh — the shared bash helpers the generate-*.sh scripts
// rely on. lib.sh is sourced, not executed, so we drive it from a bash
// subprocess: source the file, call one function, capture stdout/stderr/exit.
// This keeps the shell logic under `npm test` (node --test) with no extra
// tooling — no bats, no new CI wiring.
//
//   node --test

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const LIB = path.join(__dirname, "..", "scripts", "lib.sh");

// Source lib.sh and run `fn` with `args`, returning { status, stdout, stderr }.
// Args are passed positionally (so paths with spaces stay intact); the function
// call is the last command, so its exit code becomes the script's exit code —
// that's how we observe resolve_master's `return 1`.
function callLib(fn, ...args) {
  const script = `source "$LIB"; ${fn} "$@"`;
  const res = spawnSync("bash", ["-c", script, "bash", ...args], {
    env: { ...process.env, LIB },
    encoding: "utf8",
  });
  return { status: res.status, stdout: res.stdout.trim(), stderr: res.stderr.trim() };
}

// A temp song dir containing the named master files (empty contents are fine —
// resolve_master only checks existence).
function makeSongDir(masters) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gp-master-"));
  for (const name of masters) fs.writeFileSync(path.join(dir, name), "");
  return dir;
}

test("resolve_master prefers the pro mix when both exist", () => {
  const dir = makeSongDir(["master-pro.wav", "master-home.wav"]);
  const { status, stdout } = callLib("resolve_master", dir);
  assert.equal(status, 0);
  assert.equal(stdout, path.join(dir, "master-pro.wav"));
});

test("resolve_master falls back to the home mix when pro is absent", () => {
  const dir = makeSongDir(["master-home.wav"]);
  const { status, stdout } = callLib("resolve_master", dir);
  assert.equal(status, 0);
  assert.equal(stdout, path.join(dir, "master-home.wav"));
});

test("resolve_master fails (exit 1, stderr message) when no master exists", () => {
  const dir = makeSongDir([]);
  const { status, stdout, stderr } = callLib("resolve_master", dir);
  assert.equal(status, 1);
  assert.equal(stdout, ""); // nothing on stdout to capture as a path
  assert.match(stderr, /no master file found/);
});

test("fill_crop builds the cover-and-center-crop -vf value for the given size", () => {
  const { status, stdout } = callLib("fill_crop", "1080", "1920");
  assert.equal(status, 0);
  assert.equal(
    stdout,
    "scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920"
  );
});

test("fill_crop handles a square (canvas) size", () => {
  const { stdout } = callLib("fill_crop", "1080", "1080");
  assert.equal(
    stdout,
    "scale=1080:1080:force_original_aspect_ratio=increase,crop=1080:1080"
  );
});
