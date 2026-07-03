// Tests for the pure build helpers (lib/eleventy-helpers.js): the release-date
// gating that drives the weekly rollout, the schema.org JSON-LD builders, and
// the shows split. A bug here doesn't crash the build — it silently publishes
// an unreleased track early or emits malformed markup — so cover it directly.
//
//   node --test

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const {
  toAbsolute,
  isoDuration,
  musicGroup,
  musicRecordingLd,
  musicAlbumLd,
  releaseDates,
  isReleased,
  byLatestReleaseDesc,
  upcomingShows,
  pastShows,
  buildSongsCollection,
  prettyDate,
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
    apple_music_url: "https://music.apple.com/us/album/time-machine-single/6782485195",
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
  assert.deepEqual(ld.sameAs, [song().spotify_url, song().bandcamp_url, song().apple_music_url]);
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
    musicRecordingLd(song({ duration_seconds: 0, isrc: null, spotify_url: null, bandcamp_url: null, apple_music_url: null }))
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

// Field names mirror site/_data/shows.js exactly (ticket_url, details) so these
// tests fail if the helper or the template's contract drifts from the real
// data shape — earlier fixtures used invented keys and silently passed.
const SHOWS = [
  { date: "2026-06-10", name: "Past Gig", city: "Detroit", ticket_url: "https://t/1", details: "123 Old St" },
  { date: "2026-07-04", name: "Future Fest", city: "Chicago", ticket_url: "https://t/2", details: "456 New Ave" },
  { date: "2026-08-01", name: "Later Show", city: "Lansing", ticket_url: "https://t/3", details: "789 Far Rd" },
];

test("upcomingShows returns future shows soonest-first, keeping ticket_url + details", () => {
  const out = upcomingShows(SHOWS, "2026-06-25");
  assert.deepEqual(out.map((s) => s.name), ["Future Fest", "Later Show"]);
  // shows.njk reads show.ticket_url and show.details, so upcoming must preserve them.
  assert.equal(out[0].ticket_url, "https://t/2");
  assert.equal(out[0].details, "456 New Ave");
});

test("pastShows returns past shows newest-first and strips ticket_url + details", () => {
  const out = pastShows(SHOWS, "2026-06-25");
  assert.deepEqual(out, [{ date: "2026-06-10", name: "Past Gig", city: "Detroit" }]);
  assert.equal("ticket_url" in out[0], false);
  assert.equal("details" in out[0], false);
});

test("show filters tolerate empty/nullish input", () => {
  assert.deepEqual(upcomingShows(null, "2026-06-25"), []);
  assert.deepEqual(pastShows(undefined, "2026-06-25"), []);
});

// --- musicGroup (branch coverage) ------------------------------------------

test("musicGroup lists profile links in sameAs but drops the mailto:", () => {
  const g = musicGroup();
  assert.equal(g["@type"], "MusicGroup");
  assert.ok(Array.isArray(g.sameAs) && g.sameAs.length > 0);
  // The real artist.links has an email: it must never leak into sameAs, and
  // blank link values are filtered out too.
  assert.ok(g.sameAs.every((u) => !u.startsWith("mailto:")));
  assert.ok(g.sameAs.every(Boolean));
});

// --- musicRecordingLd (absent-field branches) ------------------------------

test("musicRecordingLd omits image/description/recordingOf when those fields are absent", () => {
  const ld = JSON.parse(
    musicRecordingLd(song({ cover_url: null, story: "", credits: {} }))
  );
  assert.equal("image" in ld, false);
  assert.equal("description" in ld, false);
  assert.equal("recordingOf" in ld, false);
});

test("musicRecordingLd falls back to first_release_date when latest is absent", () => {
  const ld = JSON.parse(
    musicRecordingLd(song({ first_release_date: "2026-06-19", latest_release_date: null }))
  );
  assert.equal(ld.datePublished, "2026-06-19");
});

// --- musicAlbumLd (cover / no-date branches) -------------------------------

test("musicAlbumLd uses the first track that has a cover for the album image", () => {
  const songs = [
    { title: "No Cover", slug: "a", first_release_date: "2026-06-19" },
    { title: "Has Cover", slug: "b", first_release_date: "2026-06-26", cover_url: "/assets/covers/b.png" },
  ];
  const ld = JSON.parse(musicAlbumLd(songs));
  assert.equal(ld.image, "https://galacticpanic.com/assets/covers/b.png");
});

test("musicAlbumLd omits datePublished/image when no track has a date or cover", () => {
  const ld = JSON.parse(
    musicAlbumLd([{ title: "Bare", slug: "x", first_release_date: null }])
  );
  assert.equal("datePublished" in ld, false);
  assert.equal("image" in ld, false);
});

test("musicAlbumLd tolerates null entries in the collection", () => {
  const ld = JSON.parse(musicAlbumLd([null, { title: "Real", slug: "r" }, undefined]));
  assert.equal(ld.numTracks, 1);
  assert.equal(ld.track[0].name, "Real");
});

// --- prettyDate ------------------------------------------------------------

test("prettyDate formats a YYYY-MM-DD into a friendly US date", () => {
  assert.equal(prettyDate("2026-06-25"), "June 25, 2026");
});

test("prettyDate does not drift the day across the timezone boundary", () => {
  // Anchored at T00:00:00 local, so the calendar day is preserved verbatim.
  assert.equal(prettyDate("2026-01-01"), "January 1, 2026");
  assert.equal(prettyDate("2026-12-31"), "December 31, 2026");
});

test("prettyDate returns empty string for missing input", () => {
  assert.equal(prettyDate(""), "");
  assert.equal(prettyDate(null), "");
  assert.equal(prettyDate(undefined), "");
});

// --- buildSongsCollection --------------------------------------------------

// Writes a temp songs dir. `songs` maps a folder name to { meta?, raw?, cover?,
// lyrics? }: `meta` is written as metadata.json, `raw` overrides it with a
// verbatim string (for malformed JSON), `cover`/`lyrics` write those files.
function makeSongsDir(songs) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "gp-collection-"));
  for (const [name, spec] of Object.entries(songs)) {
    const dir = path.join(root, name);
    fs.mkdirSync(dir, { recursive: true });
    if (spec.raw !== undefined) {
      fs.writeFileSync(path.join(dir, "metadata.json"), spec.raw);
    } else if (spec.meta !== undefined) {
      fs.writeFileSync(path.join(dir, "metadata.json"), JSON.stringify(spec.meta, null, 2));
    }
    if (spec.cover) fs.writeFileSync(path.join(dir, "cover.png"), "PNG");
    if (spec.lyrics !== undefined) fs.writeFileSync(path.join(dir, "lyrics.txt"), spec.lyrics);
  }
  return root;
}

function meta(slug, extra = {}) {
  return {
    title: slug,
    slug,
    release_date_spotify: "2026-06-19",
    release_date_bandcamp: "2026-06-19",
    ...extra,
  };
}

const TODAY = "2026-06-25";

test("buildSongsCollection returns [] when the songs dir does not exist", () => {
  assert.deepEqual(buildSongsCollection("/no/such/dir", TODAY), []);
});

test("buildSongsCollection derives release dates, version flags, cover and lyrics", () => {
  const dir = makeSongsDir({
    nessie: {
      meta: meta("nessie", { release_date_spotify: "2026-06-26", release_date_bandcamp: "2026-06-19" }),
      cover: true,
      lyrics: "[0:00] hi",
    },
  });
  const out = buildSongsCollection(dir, "2026-07-01");
  assert.equal(out.length, 1);
  const s = out[0];
  assert.equal(s.first_release_date, "2026-06-19"); // earliest
  assert.equal(s.latest_release_date, "2026-06-26"); // latest
  assert.equal(s.has_pro_version, true);
  assert.equal(s.has_home_version, true);
  assert.equal(s.cover_url, "/assets/covers/nessie.png");
  assert.equal(s.cover_src, path.join(dir, "nessie", "cover.png"));
  assert.equal(s.lyrics, "[0:00] hi");
});

test("buildSongsCollection nulls cover and empties lyrics when those files are absent", () => {
  const dir = makeSongsDir({ nessie: { meta: meta("nessie") } });
  const [s] = buildSongsCollection(dir, "2026-07-01");
  assert.equal(s.cover_url, null);
  assert.equal(s.cover_src, null);
  assert.equal(s.lyrics, "");
});

test("buildSongsCollection sets version flags from each platform date independently", () => {
  const dir = makeSongsDir({
    bandcamp_only: { meta: meta("bandcamp_only", { release_date_spotify: null }) },
  });
  const [s] = buildSongsCollection(dir, "2026-07-01");
  assert.equal(s.has_pro_version, false);
  assert.equal(s.has_home_version, true);
});

test("buildSongsCollection hides future-dated tracks but keeps undated ones", () => {
  const dir = makeSongsDir({
    future: { meta: meta("future", { release_date_spotify: "2026-07-03", release_date_bandcamp: "2026-07-03" }) },
    undated: { meta: meta("undated", { release_date_spotify: null, release_date_bandcamp: null }) },
    live: { meta: meta("live") },
  });
  const slugs = buildSongsCollection(dir, TODAY).map((s) => s.slug);
  assert.ok(!slugs.includes("future"));
  assert.ok(slugs.includes("undated"));
  assert.ok(slugs.includes("live"));
});

test("buildSongsCollection sorts newest release first, undated last", () => {
  const dir = makeSongsDir({
    old: { meta: meta("old", { release_date_spotify: "2026-06-19", release_date_bandcamp: "2026-06-19" }) },
    nw: { meta: meta("nw", { release_date_spotify: "2026-06-24", release_date_bandcamp: "2026-06-24" }) },
    undated: { meta: meta("undated", { release_date_spotify: null, release_date_bandcamp: null }) },
  });
  assert.deepEqual(
    buildSongsCollection(dir, TODAY).map((s) => s.slug),
    ["nw", "old", "undated"]
  );
});

test("buildSongsCollection silently skips a song with invalid JSON (the silent-skip path)", () => {
  const dir = makeSongsDir({
    good: { meta: meta("good") },
    broken: { raw: '{ "slug": "broken", "isrc": QT6E72686108 }' }, // unquoted ISRC
  });
  const slugs = buildSongsCollection(dir, TODAY).map((s) => s.slug);
  assert.deepEqual(slugs, ["good"]);
});

test("buildSongsCollection skips _-prefixed template dirs and folders without metadata.json", () => {
  const dir = makeSongsDir({
    good: { meta: meta("good") },
    _template: { meta: meta("_template") },
    empty: {}, // folder with no metadata.json
  });
  assert.deepEqual(buildSongsCollection(dir, TODAY).map((s) => s.slug), ["good"]);
});
