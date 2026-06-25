// Tests for the lyric-video pure helpers (lib/lyrics.js): timestamp parsing,
// display-window computation, and ffmpeg drawtext escaping. These are the
// fragile bits that used to live inline in scripts/generate-lyric-video.js.
//
//   node --test

const { test } = require("node:test");
const assert = require("node:assert/strict");

const {
  FADE,
  parseLyrics,
  buildEvents,
  escapeForDrawtext,
  defaultFont,
} = require("../lib/lyrics.js");

test("parseLyrics reads [m:ss] lines into { time, text } in order", () => {
  const out = parseLyrics("[0:00] First\n[0:04] Second\n[1:09] Third");
  assert.deepEqual(out, [
    { time: 0, text: "First" },
    { time: 4, text: "Second" },
    { time: 69, text: "Third" },
  ]);
});

test("parseLyrics supports multi-digit minutes", () => {
  assert.deepEqual(parseLyrics("[12:34] Late"), [{ time: 754, text: "Late" }]);
});

test("parseLyrics skips blank lines and untimestamped section markers", () => {
  const text = "[Chorus]\n\n[0:10] Real line\n   \nno timestamp here";
  assert.deepEqual(parseLyrics(text), [{ time: 10, text: "Real line" }]);
});

test("parseLyrics trims surrounding whitespace before matching", () => {
  assert.deepEqual(parseLyrics("   [0:05]   spaced   "), [
    { time: 5, text: "spaced" },
  ]);
});

test("parseLyrics requires two-digit seconds (rejects [0:5])", () => {
  assert.deepEqual(parseLyrics("[0:5] bad"), []);
});

test("parseLyrics handles empty / nullish input", () => {
  assert.deepEqual(parseLyrics(""), []);
  assert.deepEqual(parseLyrics(null), []);
  assert.deepEqual(parseLyrics(undefined), []);
});

test("buildEvents: each line runs until the next starts", () => {
  const lines = [
    { time: 0, text: "a" },
    { time: 5, text: "b" },
    { time: 9, text: "c" },
  ];
  const events = buildEvents(lines, 30);
  assert.deepEqual(events, [
    { start: 0, end: 5, text: "a" },
    { start: 5, end: 9, text: "b" },
    { start: 9, end: 30, text: "c" }, // last line runs to songDuration
  ]);
});

test("buildEvents: missing/zero duration falls back to last line + 5s", () => {
  const lines = [{ time: 0, text: "a" }, { time: 10, text: "b" }];
  assert.equal(buildEvents(lines, 0)[1].end, 15);
  assert.equal(buildEvents(lines, undefined)[1].end, 15);
});

test("buildEvents: empty input yields no events", () => {
  assert.deepEqual(buildEvents([], 0), []);
});

test("escapeForDrawtext escapes the metacharacters drawtext cares about", () => {
  // A single quote becomes a multi-backslash sequence; the exact string is
  // what the working ffmpeg command depends on, so pin it.
  assert.equal(escapeForDrawtext("don't"), "don\\\\\\'t");
  assert.equal(escapeForDrawtext("a:b"), "a\\\\:b");
  assert.equal(escapeForDrawtext("100%"), "100\\\\%");
  assert.equal(escapeForDrawtext("a,b"), "a\\\\,b");
  assert.equal(escapeForDrawtext("[x]"), "\\\\[x\\\\]");
});

test("escapeForDrawtext leaves ordinary text untouched", () => {
  assert.equal(escapeForDrawtext("Hello world"), "Hello world");
});

test("escapeForDrawtext coerces nullish to empty string", () => {
  assert.equal(escapeForDrawtext(null), "");
  assert.equal(escapeForDrawtext(undefined), "");
});

test("FADE is the expected constant", () => {
  assert.equal(FADE, 0.4);
});

test("defaultFont returns a per-platform font path", () => {
  assert.equal(defaultFont("darwin"), "/System/Library/Fonts/Helvetica.ttc");
  assert.equal(
    defaultFont("linux"),
    "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"
  );
});

test("defaultFont falls back to the macOS font for unknown platforms", () => {
  assert.equal(defaultFont("win32"), "/System/Library/Fonts/Helvetica.ttc");
});
