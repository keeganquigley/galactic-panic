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
  musicRecordingLd,
  musicAlbumLd,
  upcomingShows,
  pastShows,
  buildSongsCollection,
  prettyDate,
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

  // Build the songs collection from content/songs/*/metadata.json. The logic
  // lives in lib/ (buildSongsCollection) so it's unit-tested; here we just
  // pass today's date (UTC, YYYY-MM-DD), which gates future-dated tracks so
  // the weekly rollout stays under wraps until each release day.
  eleventyConfig.addCollection("songs", function () {
    return buildSongsCollection(songsDir, new Date().toISOString().slice(0, 10));
  });

  // Show filters — split a shows array into upcoming/past relative to the
  // build date (helpers in lib/, so the past-show address stripping is tested).
  eleventyConfig.addFilter("upcomingShows", (shows) =>
    upcomingShows(shows, new Date().toISOString().slice(0, 10))
  );
  eleventyConfig.addFilter("pastShows", (shows) =>
    pastShows(shows, new Date().toISOString().slice(0, 10))
  );

  // Date filter — formats YYYY-MM-DD into a friendlier string (helper in lib/,
  // so the timezone-anchoring is tested).
  eleventyConfig.addFilter("prettyDate", prettyDate);

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
