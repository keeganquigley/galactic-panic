// Eleventy config
//
// Pulls song metadata from content/songs/*/metadata.json and exposes them
// as a "songs" collection. Each song with metadata gets a page generated
// at /songs/[slug]/.

const fs = require("fs");
const path = require("path");
const { EleventyHtmlBasePlugin } = require("@11ty/eleventy");
const Image = require("@11ty/eleventy-img");
const artist = require("./site/_data/artist.js");

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
  const sameAs = [song.spotify_url, song.bandcamp_url].filter(Boolean);
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
  ld.track = list.map((s, i) => {
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

// Served from the root custom domain (galacticpanic.com), so no path prefix.
// Override with PATH_PREFIX="/galactic-panic/" to serve from the GitHub Pages
// project subpath (keeganquigley.github.io/galactic-panic/) instead.
const PATH_PREFIX = process.env.PATH_PREFIX || "/";

module.exports = function (eleventyConfig) {
  // Rewrites root-absolute URLs in output HTML to include the pathPrefix,
  // so /assets/... and /music/ resolve correctly under the project subpath.
  eleventyConfig.addPlugin(EleventyHtmlBasePlugin);

  // Responsive image shortcode. Generates resized AVIF/WebP/JPEG variants
  // with a srcset so browsers download an appropriately sized file instead
  // of the full 3000x3000 master. Output goes to /assets/img/ (hashed names,
  // cached across builds).
  //
  //   {% image src, alt, sizes, className, loading %}
  //
  // - src:       filesystem path to the source image (e.g. song.cover_src)
  // - alt:       alt text ("" is allowed for decorative images)
  // - sizes:     CSS "sizes" attribute (default "100vw")
  // - className: class applied to the <img> (optional)
  // - loading:   "lazy" (default) or "eager" for above-the-fold/LCP images
  async function imageShortcode(
    src,
    alt = "",
    sizes = "100vw",
    className = "",
    loading = "lazy"
  ) {
    const metadata = await Image(src, {
      widths: [300, 600, 900, 1200, 1800],
      formats: ["avif", "webp", "jpeg"],
      outputDir: "./site/_site/assets/img/",
      urlPath: "/assets/img/",
    });
    const attrs = {
      alt,
      sizes,
      loading,
      decoding: "async",
    };
    if (className) attrs.class = className;
    // Hint the priority: eager (LCP/above-the-fold) images compete for early
    // bandwidth, lazy ones defer.
    attrs.fetchpriority = loading === "eager" ? "high" : "low";
    return Image.generateHTML(metadata, attrs);
  }
  eleventyConfig.addAsyncShortcode("image", imageShortcode);

  // Absolute-URL filter — turns a root-relative path (/foo) into a full
  // https://galacticpanic.com/foo URL for canonical + social meta tags.
  eleventyConfig.addFilter("absoluteUrl", toAbsolute);

  // JSON-LD structured data filters. Emit schema.org markup derived from
  // metadata.json so search engines can read the catalog (SEO). See the
  // helpers near the top of this file.
  eleventyConfig.addFilter("musicRecordingLd", musicRecordingLd);
  eleventyConfig.addFilter("musicAlbumLd", musicAlbumLd);

  // Static passthrough — copy assets folder as-is
  eleventyConfig.addPassthroughCopy({ "site/assets": "assets" });

  // Custom domain — copy CNAME to the site root so the domain persists
  // across GitHub Actions deploys.
  eleventyConfig.addPassthroughCopy({ "site/CNAME": "CNAME" });

  const songsDir = path.join(__dirname, "content", "songs");

  // Copy each song's cover.png into the build at /assets/covers/[slug].png
  if (fs.existsSync(songsDir)) {
    for (const d of fs.readdirSync(songsDir, { withFileTypes: true })) {
      if (!d.isDirectory() || d.name.startsWith("_")) continue;
      const coverPath = path.join(songsDir, d.name, "cover.png");
      if (fs.existsSync(coverPath)) {
        eleventyConfig.addPassthroughCopy({
          [`content/songs/${d.name}/cover.png`]: `assets/covers/${d.name}.png`,
        });
      }
    }
  }

  // Build the songs collection from content/songs/*/metadata.json
  eleventyConfig.addCollection("songs", function () {
    if (!fs.existsSync(songsDir)) return [];

    // Today (UTC, YYYY-MM-DD) — used to hide tracks whose release date
    // hasn't arrived yet, so the weekly rollout stays under wraps.
    const today = new Date().toISOString().slice(0, 10);

    return fs
      .readdirSync(songsDir, { withFileTypes: true })
      .filter((d) => d.isDirectory() && !d.name.startsWith("_"))
      .map((d) => {
        const metaPath = path.join(songsDir, d.name, "metadata.json");
        if (!fs.existsSync(metaPath)) return null;
        try {
          const meta = JSON.parse(fs.readFileSync(metaPath, "utf8"));
          const dates = [meta.release_date_spotify, meta.release_date_bandcamp]
            .filter(Boolean)
            .sort();
          const hasCover = fs.existsSync(
            path.join(songsDir, d.name, "cover.png")
          );
          const lyricsPath = path.join(songsDir, d.name, "lyrics.txt");
          const lyrics = fs.existsSync(lyricsPath)
            ? fs.readFileSync(lyricsPath, "utf8")
            : "";
          return {
            ...meta,
            lyrics,
            cover_url: hasCover ? `/assets/covers/${d.name}.png` : null,
            // Filesystem path to the master cover, for the {% image %}
            // shortcode to generate responsive variants from.
            cover_src: hasCover
              ? path.join(songsDir, d.name, "cover.png")
              : null,
            first_release_date: dates[0] || null,
            latest_release_date: dates[dates.length - 1] || null,
            has_pro_version: !!meta.release_date_spotify,
            has_home_version: !!meta.release_date_bandcamp,
          };
        } catch (e) {
          console.warn(`Skipping ${d.name}: invalid metadata.json (${e.message})`);
          return null;
        }
      })
      .filter(Boolean)
      // Hide tracks whose release date is still in the future — they
      // appear automatically once the build runs on/after their Friday.
      .filter((s) => !s.first_release_date || s.first_release_date <= today)
      .sort((a, b) => {
        if (!a.latest_release_date) return 1;
        if (!b.latest_release_date) return -1;
        return b.latest_release_date.localeCompare(a.latest_release_date);
      });
  });

  // Show filters — split a shows array into upcoming/past relative to the
  // build date, sorted (upcoming ascending, past most-recent-first).
  eleventyConfig.addFilter("upcomingShows", (shows) => {
    const today = new Date().toISOString().slice(0, 10);
    return (shows || [])
      .filter((s) => s.date >= today)
      .sort((a, b) => a.date.localeCompare(b.date));
  });
  eleventyConfig.addFilter("pastShows", (shows) => {
    const today = new Date().toISOString().slice(0, 10);
    return (shows || [])
      .filter((s) => s.date < today)
      .sort((a, b) => b.date.localeCompare(a.date))
      // Strip ticket link + venue address once an event has passed, so the
      // rendered page never carries that info for a past show.
      .map(({ date, name, city }) => ({ date, name, city }));
  });

  // Date filter — formats YYYY-MM-DD into a friendlier string
  eleventyConfig.addFilter("prettyDate", (dateStr) => {
    if (!dateStr) return "";
    const d = new Date(dateStr + "T00:00:00");
    return d.toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  });

  return {
    pathPrefix: PATH_PREFIX,
    dir: {
      input: "site",
      output: "site/_site",
      includes: "_includes",
      data: "_data",
    },
    templateFormats: ["html", "md", "njk", "11ty.js"],
    htmlTemplateEngine: "njk",
    markdownTemplateEngine: "njk",
  };
};
