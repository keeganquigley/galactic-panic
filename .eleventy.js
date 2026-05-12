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

  // Build the songs collection from content/songs/*/metadata.json
  eleventyConfig.addCollection("songs", function () {
    const songsDir = path.join(__dirname, "content", "songs");
    if (!fs.existsSync(songsDir)) return [];

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
          return {
            ...meta,
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
