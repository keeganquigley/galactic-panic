// Eleventy config
//
// Pulls song metadata from content/songs/*/metadata.json and exposes them
// as a "songs" collection. Each song with metadata gets a page generated
// at /songs/[slug]/.

const fs = require("fs");
const path = require("path");

module.exports = function (eleventyConfig) {
  // Static passthrough — copy assets folder as-is
  eleventyConfig.addPassthroughCopy({ "site/assets": "assets" });

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
          return {
            ...meta,
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
