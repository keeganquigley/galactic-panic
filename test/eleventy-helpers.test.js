// Tests for the pure build helpers (lib/eleventy-helpers.js): the release-date
// gating that drives the weekly rollout, the schema.org JSON-LD builders, and
// the shows split. A bug here doesn't crash the build — it silently publishes
// an unreleased track early or emits malformed markup — so cover it directly.
//
//   node --test

const { test } = require("node:test");
const assert = require("node:assert/strict");

const {
  toAbsolute,
  isoDuration,
  musicRecordingLd,
  musicAlbumLd,
  releaseDates,
  isReleased,
  byLatestReleaseDesc,
  upcomingShows,
  pastShows,
} = require("../lib/eleventy-helpers.js");

// --- isoDuration -----------------------------------------------------------

test("isoDuration formats seconds as ISO 8601", () => {
  assert.equal(isoDuration(245), "PT4M5S");
  assert.equal(isoDuration(60), "PT1M0S");
  assert.equal(isoDuration(59), "PT0M59S");
});

test("isoDuration returns null for missing/zero/negative (unmeasured master)", () => {
  assert.equal(isoDuration(0), null);
  assert.equal(isoDuration(undefined), null);
  assert.equal(isoDuration(null), null);
  assert.equal(isoDuration(-3), null);
});

// --- toAbsolute ------------------------------------------------------------

test("toAbsolute makes root-relative and bare paths absolute", () => {
  assert.equal(toAbsolute("/music/"), "https://galacticpanic.com/music/");
  assert.equal(toAbsolute("music/"), "https://galacticpanic.com/music/");
});

test("toAbsolute passes through already-absolute URLs and blanks", () => {
  assert.equal(toAbsolute("https://x.com/a"), "https://x.com/a");
  assert.equal(toAbsolute("http://x.com"), "http://x.com");
  assert.equal(toAbsolute(""), "");
  assert.equal(toAbsolute(null), "");
});

// --- releaseDates / isReleased / sort --------------------------------------

test("releaseDates returns the platform dates sorted ascending", () => {
  assert.deepEqual(
    releaseDates({ release_date_spotify: "2026-07-03", release_date_bandcamp: "2026-06-26" }),
    ["2026-06-26", "2026-07-03"]
  );
});

test("releaseDates drops nulls", () => {
  assert.deepEqual(
    releaseDates({ release_date_spotify: "2026-07-03", release_date_bandcamp: null }),
    ["2026-07-03"]
  );
  assert.deepEqual(
    releaseDates({ release_date_spotify: null, release_date_bandcamp: null }),
    []
  );
});

test("isReleased gates future-dated tracks but shows past/today/undated", () => {
  const today = "2026-06-25";
  assert.equal(isReleased({ first_release_date: "2026-07-03" }, today), false);
  assert.equal(isReleased({ first_release_date: "2026-06-25" }, today), true); // today counts
  assert.equal(isReleased({ first_release_date: "2026-06-19" }, today), true);
  assert.equal(isReleased({ first_release_date: null }, today), true);
});

test("byLatestReleaseDesc sorts newest first, undated last", () => {
  const songs = [
    { slug: "old", latest_release_date: "2026-06-19" },
    { slug: "undated", latest_release_date: null },
    { slug: "new", latest_release_date: "2026-07-03" },
  ];
  assert.deepEqual(
    [...songs].sort(byLatestReleaseDesc).map((s) => s.slug),
    ["new", "old", "undated"]
  );
});

// --- musicRecordingLd ------------------------------------------------------

function song(extra = {}) {
  return {
    title: "Time Machine",
    slug: "time-machine",
    duration_seconds: 245,
    isrc: "QT6E72633975",
    first_release_date: "2026-06-19",
    latest_release_date: "2026-06-19",
    spotify_url: "https://open.spotify.com/track/x",
    bandcamp_url: "https://galacticpanic.bandcamp.com/track/time-machine",
    cover_url: "/assets/covers/time-machine.png",
    story: "A song.",
    credits: { writing: "Alice, Bob" },
    ...extra,
  };
}

test("musicRecordingLd builds a well-formed MusicRecording", () => {
  const ld = JSON.parse(musicRecordingLd(song()));
  assert.equal(ld["@type"], "MusicRecording");
  assert.equal(ld.url, "https://galacticpanic.com/songs/time-machine/");
  assert.equal(ld.duration, "PT4M5S");
  assert.equal(ld.isrcCode, "QT6E72633975");
  assert.equal(ld.datePublished, "2026-06-19");
  assert.equal(ld.image, "https://galacticpanic.com/assets/covers/time-machine.png");
  assert.deepEqual(ld.sameAs, [song().spotify_url, song().bandcamp_url]);
});

test("musicRecordingLd splits writing credits into composer Persons", () => {
  const ld = JSON.parse(musicRecordingLd(song()));
  assert.deepEqual(ld.recordingOf.composer, [
    { "@type": "Person", name: "Alice" },
    { "@type": "Person", name: "Bob" },
  ]);
});

test("musicRecordingLd prefers latest over first release date", () => {
  const ld = JSON.parse(
    musicRecordingLd(song({ first_release_date: "2026-06-19", latest_release_date: "2026-06-26" }))
  );
  assert.equal(ld.datePublished, "2026-06-26");
});

test("musicRecordingLd omits duration/isrc/sameAs when absent", () => {
  const ld = JSON.parse(
    musicRecordingLd(song({ duration_seconds: 0, isrc: null, spotify_url: null, bandcamp_url: null }))
  );
  assert.equal("duration" in ld, false);
  assert.equal("isrcCode" in ld, false);
  assert.equal("sameAs" in ld, false);
});

test("musicRecordingLd escapes < so it can't break out of a <script> tag", () => {
  const raw = musicRecordingLd(song({ story: "</script><script>alert(1)" }));
  assert.equal(raw.includes("</script>"), false);
  assert.ok(raw.includes("\\u003c"));
  // still valid JSON that round-trips to the original text
  assert.equal(JSON.parse(raw).description, "</script><script>alert(1)");
});

// --- musicAlbumLd ----------------------------------------------------------

test("musicAlbumLd orders tracks by release date with sequential positions", () => {
  const songs = [
    { title: "Third", slug: "c", first_release_date: "2026-07-03" },
    { title: "First", slug: "a", first_release_date: "2026-06-19" },
    { title: "Second", slug: "b", first_release_date: "2026-06-26" },
  ];
  const ld = JSON.parse(musicAlbumLd(songs));
  assert.equal(ld.numTracks, 3);
  assert.deepEqual(
    ld.track.map((t) => [t.position, t.name]),
    [[1, "First"], [2, "Second"], [3, "Third"]]
  );
  assert.equal(ld.datePublished, "2026-06-19"); // earliest
});

test("musicAlbumLd sorts undated tracks last", () => {
  const songs = [
    { title: "Undated", slug: "u", first_release_date: null },
    { title: "Dated", slug: "d", first_release_date: "2026-06-19" },
  ];
  const ld = JSON.parse(musicAlbumLd(songs));
  assert.deepEqual(ld.track.map((t) => t.name), ["Dated", "Undated"]);
});

test("musicAlbumLd handles an empty collection", () => {
  const ld = JSON.parse(musicAlbumLd([]));
  assert.equal(ld.numTracks, 0);
  assert.deepEqual(ld.track, []);
});

// --- shows -----------------------------------------------------------------

const SHOWS = [
  { date: "2026-06-10", name: "Past Gig", city: "Detroit", ticketUrl: "https://t/1", address: "123 Old St" },
  { date: "2026-07-04", name: "Future Fest", city: "Chicago", ticketUrl: "https://t/2", address: "456 New Ave" },
  { date: "2026-08-01", name: "Later Show", city: "Lansing", ticketUrl: "https://t/3", address: "789 Far Rd" },
];

test("upcomingShows returns future shows soonest-first, keeping details", () => {
  const out = upcomingShows(SHOWS, "2026-06-25");
  assert.deepEqual(out.map((s) => s.name), ["Future Fest", "Later Show"]);
  assert.equal(out[0].ticketUrl, "https://t/2"); // upcoming keeps ticket link
});

test("pastShows returns past shows newest-first and strips ticket + address", () => {
  const out = pastShows(SHOWS, "2026-06-25");
  assert.deepEqual(out, [{ date: "2026-06-10", name: "Past Gig", city: "Detroit" }]);
  assert.equal("ticketUrl" in out[0], false);
  assert.equal("address" in out[0], false);
});

test("show filters tolerate empty/nullish input", () => {
  assert.deepEqual(upcomingShows(null, "2026-06-25"), []);
  assert.deepEqual(pastShows(undefined, "2026-06-25"), []);
});
