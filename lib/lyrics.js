// Pure helpers for the lyric-video generator (scripts/generate-lyric-video.js).
//
// These are the fiddly, easy-to-break bits — timestamp parsing, the
// line-display windowing, and the hand-rolled ffmpeg drawtext escaping — pulled
// out of the script so they can be unit-tested without invoking ffmpeg. The
// script requires this module and keeps only the ffmpeg command assembly.

// Seconds of fade in/out applied at each line's edges. Exported so the script
// and tests agree on the value.
const FADE = 0.4;

// Parse timestamped lyrics into [{ time, text }], in file order.
//
// Each line should start with [m:ss] or [mm:ss]; the rest is the lyric text.
// Lines without a timestamp (blank lines, section markers like "[Chorus]")
// are dropped — the trailing \d{2} on the seconds is what makes "[Chorus]"
// fail to match and get skipped.
function parseLyrics(text) {
  return String(text == null ? "" : text)
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((line) => {
      const match = line.match(/^\[(\d+):(\d{2})\]\s*(.+)$/);
      if (!match) return null;
      const minutes = parseInt(match[1], 10);
      const seconds = parseInt(match[2], 10);
      return { time: minutes * 60 + seconds, text: match[3] };
    })
    .filter(Boolean);
}

// Turn parsed lines into display events with an end time: each line shows
// until the next line starts, and the last line shows until songDuration.
// When songDuration is missing/zero, fall back to "last line + 5s" so the
// final lyric still gets screen time.
function buildEvents(lines, songDuration) {
  const last = lines.length ? lines[lines.length - 1].time + 5 : 0;
  const dur = songDuration || last;
  return lines.map((line, i) => ({
    start: line.time,
    end: i < lines.length - 1 ? lines[i + 1].time : dur,
    text: line.text,
  }));
}

// Default font file for the lyric video, by platform (process.platform value).
// A bundled font would be more reproducible, but this keeps the repo binary-
// free and works out of the box on the two platforms we run on. Override with
// the FONT_PATH env var for anything else.
function defaultFont(platform) {
  switch (platform) {
    case "darwin":
      return "/System/Library/Fonts/Helvetica.ttc";
    case "linux":
      // Present in the ubuntu-latest GitHub Actions runner (fonts-dejavu-core).
      return "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf";
    default:
      return "/System/Library/Fonts/Helvetica.ttc";
  }
}

// Escape a lyric string for use inside an ffmpeg drawtext `text='...'` value.
// drawtext is parsed in several layers (filtergraph + drawtext), hence the
// multi-level backslash escaping of the metacharacters that would otherwise
// terminate or reinterpret the value.
function escapeForDrawtext(s) {
  return String(s == null ? "" : s)
    .replace(/\\/g, "\\\\\\\\")
    .replace(/'/g, "\\\\\\'")
    .replace(/:/g, "\\\\:")
    .replace(/%/g, "\\\\%")
    .replace(/,/g, "\\\\,")
    .replace(/\[/g, "\\\\[")
    .replace(/\]/g, "\\\\]");
}

module.exports = { FADE, parseLyrics, buildEvents, escapeForDrawtext, defaultFont };
