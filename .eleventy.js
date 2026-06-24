// Eleventy config
//
// Pulls song metadata from content/songs/*/metadata.json and exposes them
// as a "songs" collection. Each song with metadata gets a page generated
// at /songs/[slug]/.

const fs = require("fs");
const path = require("path");
const { EleventyHtmlBasePlugin } = require("@11ty/eleventy");

// Served from the root custom domain (galacticpanic.com), so no path prefix.
// Override with PATH_PREFIX="/galactic-panic/" to serve from the GitHub Pages
// project subpath (keeganquigley.github.io/galactic-panic/) instead.
const PATH_PREFIX = process.env.PATH_PREFIX || "/";

module.exports = function (eleventyConfig) {
  // Rewrites root-absolute URLs in output HTML to include the pathPrefix,
  // so /assets/... and /music/ resolve correctly under the project subpath.
  eleventyConfig.addPlugin(EleventyHtmlBasePlugin);

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
