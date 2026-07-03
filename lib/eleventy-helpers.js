// Pure helpers used by .eleventy.js, extracted so the build's real logic —
// schema.org JSON-LD, release-date gating, and the shows split — can be
// unit-tested without spinning up Eleventy. .eleventy.js requires this module
// and keeps only the framework wiring (shortcodes, passthrough, collection).
//
// "today" is always passed in (YYYY-MM-DD) rather than read from the clock, so
// the date-dependent logic is deterministic under test.

const fs = require("fs");
const path = require("path");
const artist = require("../site/_data/artist.js");
// The validator owns the "which folders count as songs" rule; reuse it here so
// the build's collection and the validator can never disagree.
const { listSongDirs } = require("../scripts/validate-metadata.js");

// Canonical origin for absolute URLs in <link rel=canonical>, social meta,
// and JSON-LD structured data.
const SITE_URL = "https://galacticpanic.com";

// Turn a root-relative path (/foo) into a full https://galacticpanic.com/foo
// URL. Pass-through for values that are already absolute.
const toAbsolute = (urlPath) => {
  if (!urlPath) return "";
  if (/^https?:\/\//.test(urlPath)) return urlPath;
  return `${SITE_URL}${urlPath.startsWith("/") ? "" : "/"}${urlPath}`;
};

// Seconds -> ISO 8601 duration (e.g. 245 -> "PT4M5S"), the format schema.org
// expects for MusicRecording.duration. Returns null for missing/zero values
// (duration_seconds is often 0 until a master is measured).
const isoDuration = (seconds) => {
  const s = Number(seconds) || 0;
  if (s <= 0) return null;
  return `PT${Math.floor(s / 60)}M${s % 60}S`;
};

// The performing artist, as a schema.org MusicGroup. sameAs links the entity
// to its profiles on streaming/social platforms (skipping the mailto: link).
const musicGroup = () => {
  const sameAs = Object.values(artist.links || {}).filter(
    (u) => u && !u.startsWith("mailto:")
  );
  return {
    "@type": "MusicGroup",
    name: artist.name,
    url: SITE_URL,
    ...(sameAs.length ? { sameAs } : {}),
  };
};

// JSON-encode structured data for safe embedding inside a <script> tag.
// Escaping "<" prevents a "</script>" sequence in any field from breaking out.
const jsonLd = (obj) => JSON.stringify(obj).replace(/</g, "\\u003c");

// schema.org/MusicRecording for a single song, derived entirely from the
// song's metadata.json (this never mutates that source of truth).
const musicRecordingLd = (song) => {
  const ld = {
    "@context": "https://schema.org",
    "@type": "MusicRecording",
    name: song.title,
    url: toAbsolute(`/songs/${song.slug}/`),
    byArtist: musicGroup(),
    inAlbum: {
      "@type": "MusicAlbum",
      name: artist.name,
      albumReleaseType: "https://schema.org/EPRelease",
      byArtist: { "@type": "MusicGroup", name: artist.name, url: SITE_URL },
    },
  };
  if (song.cover_url) ld.image = toAbsolute(song.cover_url);
  if (song.story) ld.description = song.story;
  const date = song.latest_release_date || song.first_release_date;
  if (date) ld.datePublished = date;
  if (song.isrc) ld.isrcCode = song.isrc;
  const dur = isoDuration(song.duration_seconds);
  if (dur) ld.duration = dur;
  const sameAs = [song.spotify_url, song.bandcamp_url, song.apple_music_url].filter(Boolean);
  if (sameAs.length) ld.sameAs = sameAs;
  if (song.credits && song.credits.writing) {
    const composer = song.credits.writing
      .split(",")
      .map((n) => n.trim())
      .filter(Boolean)
      .map((name) => ({ "@type": "Person", name }));
    ld.recordingOf = {
      "@type": "MusicComposition",
      name: song.title,
      ...(composer.length ? { composer } : {}),
    };
  }
  return jsonLd(ld);
};

// schema.org/MusicAlbum for the self-titled EP, built from the released-songs
// collection. numTracks/track reflect what is currently live, so the markup
// stays in step with the weekly rollout rather than advertising unreleased
// tracks.
const musicAlbumLd = (songs) => {
  const list = (songs || []).filter(Boolean);
  const ld = {
    "@context": "https://schema.org",
    "@type": "MusicAlbum",
    name: artist.name,
    url: toAbsolute("/music/"),
    albumReleaseType: "https://schema.org/EPRelease",
    albumProductionType: "https://schema.org/StudioAlbum",
    byArtist: musicGroup(),
    numTracks: list.length,
  };
  const dates = list.map((s) => s.first_release_date).filter(Boolean).sort();
  if (dates.length) ld.datePublished = dates[0];
  const withCover = list.find((s) => s.cover_url);
  if (withCover) ld.image = toAbsolute(withCover.cover_url);
  // Order tracks by release date ascending so position reflects the EP's
  // track listing, not the collection's newest-first display sort. Tracks
  // without a release date sort last, preserving their relative order.
  const ordered = [...list].sort((a, b) =>
    (a.first_release_date || "9999-99-99").localeCompare(
      b.first_release_date || "9999-99-99"
    )
  );
  ld.track = ordered.map((s, i) => {
    const t = {
      "@type": "MusicRecording",
      position: i + 1,
      name: s.title,
      url: toAbsolute(`/songs/${s.slug}/`),
    };
    if (s.isrc) t.isrcCode = s.isrc;
    const dur = isoDuration(s.duration_seconds);
    if (dur) t.duration = dur;
    const d = s.latest_release_date || s.first_release_date;
    if (d) t.datePublished = d;
    return t;
  });
  return jsonLd(ld);
};

// The two platform release dates, sorted ascending (earliest first). Used to
// derive a song's first_release_date / latest_release_date.
const releaseDates = (meta) =>
  [meta.release_date_spotify, meta.release_date_bandcamp]
    .filter(Boolean)
    .sort();

// A song is visible once its earliest release date has arrived (or if it has
// no date yet). Future-dated tracks stay hidden until the build runs on/after
// their release day — the mechanism behind the weekly rollout.
const isReleased = (song, today) =>
  !song.first_release_date || song.first_release_date <= today;

// Collection display sort: newest release first; songs without a release date
// sort to the end.
const byLatestReleaseDesc = (a, b) => {
  if (!a.latest_release_date) return 1;
  if (!b.latest_release_date) return -1;
  return b.latest_release_date.localeCompare(a.latest_release_date);
};

// Upcoming shows (date >= today), soonest first.
const upcomingShows = (shows, today) =>
  (shows || [])
    .filter((s) => s.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date));

// Past shows (date < today), most recent first. Ticket link + venue address
// are stripped once an event has passed, so the rendered page never carries
// that info for a past show.
const pastShows = (shows, today) =>
  (shows || [])
    .filter((s) => s.date < today)
    .sort((a, b) => b.date.localeCompare(a.date))
    .map(({ date, name, city }) => ({ date, name, city }));

// Build the "songs" collection from content/songs/*/metadata.json. Reads each
// song folder, derives the display fields the templates and JSON-LD need, and
// applies the weekly-rollout gating (future-dated tracks stay hidden until
// `today` reaches their release date). Extracted from .eleventy.js so this
// logic — the silent-skip on invalid JSON especially — is unit-testable
// without spinning up Eleventy; the config just calls it with the real dir and
// today's date. `today` is passed in (YYYY-MM-DD) to keep it deterministic.
const buildSongsCollection = (songsDir, today) => {
  if (!fs.existsSync(songsDir)) return [];

  return listSongDirs(songsDir)
    .map((name) => {
      const metaPath = path.join(songsDir, name, "metadata.json");
      if (!fs.existsSync(metaPath)) return null;
      try {
        const meta = JSON.parse(fs.readFileSync(metaPath, "utf8"));
        const dates = releaseDates(meta);
        const hasCover = fs.existsSync(path.join(songsDir, name, "cover.png"));
        const lyricsPath = path.join(songsDir, name, "lyrics.txt");
        const lyrics = fs.existsSync(lyricsPath)
          ? fs.readFileSync(lyricsPath, "utf8")
          : "";
        return {
          ...meta,
          lyrics,
          cover_url: hasCover ? `/assets/covers/${name}.png` : null,
          // Filesystem path to the master cover, for the {% image %} shortcode
          // to generate responsive variants from.
          cover_src: hasCover ? path.join(songsDir, name, "cover.png") : null,
          first_release_date: dates[0] || null,
          latest_release_date: dates[dates.length - 1] || null,
          has_pro_version: !!meta.release_date_spotify,
          has_home_version: !!meta.release_date_bandcamp,
        };
      } catch (e) {
        // Mirror the build's behavior: a broken metadata.json drops the track
        // rather than failing the build. `npm run validate` is what catches
        // this loudly in CI.
        console.warn(`Skipping ${name}: invalid metadata.json (${e.message})`);
        return null;
      }
    })
    .filter(Boolean)
    // Hide tracks whose release date is still in the future — they appear
    // automatically once the build runs on/after their release day.
    .filter((s) => isReleased(s, today))
    .sort(byLatestReleaseDesc);
};

// Format a YYYY-MM-DD string into a friendly "June 25, 2026". Anchored at
// T00:00:00 (local) so the day never drifts under timezone math. Empty/missing
// input yields "" so templates can call it unconditionally.
const prettyDate = (dateStr) => {
  if (!dateStr) return "";
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
};

module.exports = {
  SITE_URL,
  toAbsolute,
  isoDuration,
  musicGroup,
  jsonLd,
  musicRecordingLd,
  musicAlbumLd,
  releaseDates,
  isReleased,
  byLatestReleaseDesc,
  upcomingShows,
  pastShows,
  buildSongsCollection,
  prettyDate,
};
