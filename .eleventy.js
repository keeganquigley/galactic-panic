// Eleventy config
//
// Pulls song metadata from content/songs/*/metadata.json and exposes them
// as a "songs" collection. Each song with metadata gets a page generated
// at /songs/[slug]/.

const fs = require("fs");
const path = require("path");
const { EleventyHtmlBasePlugin } = require("@11ty/eleventy");
const Image = require("@11ty/eleventy-img");
// Reuse the validator's directory lister so "which folders are songs" (skip
// non-dirs and _-prefixed templates) is defined in exactly one place. The
// validator is the schema's source of truth; importing it can't double-run
// the CLI (that's guarded by require.main === module).
const { listSongDirs } = require("./scripts/validate-metadata.js");
// Pure helpers (JSON-LD builders, release-date gating, shows split) live in
// lib/ so they can be unit-tested without Eleventy. See test/eleventy-helpers.
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
} = require("./lib/eleventy-helpers.js");

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
    for (const name of listSongDirs(songsDir)) {
      const coverPath = path.join(songsDir, name, "cover.png");
      if (fs.existsSync(coverPath)) {
        eleventyConfig.addPassthroughCopy({
          [`content/songs/${name}/cover.png`]: `assets/covers/${name}.png`,
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

    return listSongDirs(songsDir)
      .map((name) => {
        const metaPath = path.join(songsDir, name, "metadata.json");
        if (!fs.existsSync(metaPath)) return null;
        try {
          const meta = JSON.parse(fs.readFileSync(metaPath, "utf8"));
          const dates = releaseDates(meta);
          const hasCover = fs.existsSync(
            path.join(songsDir, name, "cover.png")
          );
          const lyricsPath = path.join(songsDir, name, "lyrics.txt");
          const lyrics = fs.existsSync(lyricsPath)
            ? fs.readFileSync(lyricsPath, "utf8")
            : "";
          return {
            ...meta,
            lyrics,
            cover_url: hasCover ? `/assets/covers/${name}.png` : null,
            // Filesystem path to the master cover, for the {% image %}
            // shortcode to generate responsive variants from.
            cover_src: hasCover
              ? path.join(songsDir, name, "cover.png")
              : null,
            first_release_date: dates[0] || null,
            latest_release_date: dates[dates.length - 1] || null,
            has_pro_version: !!meta.release_date_spotify,
            has_home_version: !!meta.release_date_bandcamp,
          };
        } catch (e) {
          console.warn(`Skipping ${name}: invalid metadata.json (${e.message})`);
          return null;
        }
      })
      .filter(Boolean)
      // Hide tracks whose release date is still in the future — they
      // appear automatically once the build runs on/after their Friday.
      .filter((s) => isReleased(s, today))
      .sort(byLatestReleaseDesc);
  });

  // Show filters — split a shows array into upcoming/past relative to the
  // build date (helpers in lib/, so the past-show address stripping is tested).
  eleventyConfig.addFilter("upcomingShows", (shows) =>
    upcomingShows(shows, new Date().toISOString().slice(0, 10))
  );
  eleventyConfig.addFilter("pastShows", (shows) =>
    pastShows(shows, new Date().toISOString().slice(0, 10))
  );

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
