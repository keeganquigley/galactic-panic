# Galactic Panic — Tech Debt Audit

_Generated 2026-06-24. Grounded in the actual repo: scripts, `.eleventy.js`, CI workflows, validator, and tests were all read and, where possible, exercised (`npm test` → 8/8 pass, `npm run validate` → 4 songs OK)._

## Summary

This is a healthy, well-commented repo for its size. The validator is genuinely good — it's tested, zero-dependency, and CI-gated, and it directly addresses the "song silently vanishes" failure mode. The debt that exists clusters around **two themes**:

1. **The schema lives in three places** (CLAUDE.md prose, `validate-metadata.js`, the `.eleventy.js` collection mapping) and the "where do lyrics live" question is answered inconsistently across the repo — which has already produced one live bug.
2. **Only the validator is tested.** The asset-generation scripts and the substantial logic in `.eleventy.js` (JSON-LD, release-date gating, the daily rebuild) ship untested.

The single highest-value fix is a one-line bug: **the lyric-video step in `generate-all.sh` never runs.**

## Prioritization

Priority = (Impact + Risk) × (6 − Effort), each scored 1–5.

| # | Item | Type | Impact | Risk | Effort | **Priority** |
|---|------|------|:------:|:----:|:------:|:------------:|
| 1 | `generate-all.sh` lyric-video gate is always false | Code | 3 | 3 | 1 | **30** |
| 2 | README contradicts CLAUDE.md on where lyrics live | Docs | 2 | 3 | 1 | **25** |
| 3 | `.eleventy.js` logic is entirely untested | Test | 3 | 4 | 3 | **21** |
| 4 | Lyric video hardcodes a macOS-only font path | Code | 2 | 3 | 2 | **20** |
| 5 | Schema defined in 3 places (drift risk) | Arch | 3 | 3 | 3 | **18** |
| 6 | Scripts handle only `.wav` masters, not `.aif` | Code | 2 | 2 | 2 | **16** |
| 7 | No `engines` pin; local Node 22 vs CI Node 24 | Dep/Infra | 1 | 2 | 1 | **15** |
| 8 | `drawtext` escaping + mega-filtergraph untested/fragile | Test | 2 | 3 | 3 | **15** |
| 9 | Deploy workflow runs `validate` but not `node --test` | Infra | 1 | 2 | 1 | **15** |
| 10 | Duplicated master-selection + ffmpeg scale/crop logic | Code | 2 | 2 | 3 | **12** |
| 11 | `lyrics` loaded into collection but never rendered (dead data) | Code | 1 | 1 | 2 | **8** |

## Findings in detail

### 1. The lyric-video step in `generate-all.sh` never runs _(Priority 30)_

The gate is:

```bash
if node -e "process.exit(require('./${SONG_DIR}/metadata.json').lyrics ? 0 : 1)" 2>/dev/null; then
```

It reads a `lyrics` key from `metadata.json`. But per CLAUDE.md and the actual files, **lyrics live in `lyrics.txt`, not `metadata.json`** — no `metadata.json` in the repo has a `lyrics` key (confirmed). So the expression is always falsy and the script always prints "Skipping lyric video," even for songs that have a full `lyrics.txt`. The lyric-video generator itself (`generate-lyric-video.js`) reads `lyrics.txt` correctly and works when called directly — so the whole feature is silently disabled only via the `generate-all` path.

**Fix:** gate on the file instead — `if [[ -s "${SONG_DIR}/lyrics.txt" ]]; then`. One line. _Business value: a content deliverable you built and maintain is currently never produced by your one-command workflow._

### 2. README says lyrics live in `metadata.json` _(Priority 25)_

`README.md` line 27 documents `metadata.json` as `# song info, lyrics, credits`. CLAUDE.md explicitly says the opposite: "Lyrics live in `lyrics.txt` … not in `metadata.json`." This contradiction is the root cause of finding #1 — fix the doc and the bug together so the same confusion doesn't recur. _Effort: trivial._

### 3. `.eleventy.js` logic is entirely untested _(Priority 21)_

`.eleventy.js` contains real, shippable logic with no test coverage: `isoDuration`, `toAbsolute`, the JSON-LD builders (`musicRecordingLd` / `musicAlbumLd`), the writing-credit→composer split, and — most importantly — the **release-date gating** that hides future tracks (`first_release_date <= today`) plus the EP track-ordering. A bug here doesn't crash the build; it silently publishes an unreleased track early or emits malformed schema.org markup. Because the daily cron deploy (finding below) relies on the date math, this is the riskiest untested code in the repo.

**Fix:** extract the pure helpers into a `lib/` module (as was done for the validator) and add `node --test` coverage for date gating, `isoDuration` edge cases (0 → null), and JSON-LD shape. Medium effort, high payoff.

### 4. Lyric video hardcodes `/System/Library/Fonts/Helvetica.ttc` _(Priority 20)_

`generate-lyric-video.js` points `drawtext` at a macOS-only font. It fails on Linux (the script even prints a note telling you to edit it by hand). Today this only runs locally on macOS, so impact is contained — but it's a latent blocker if asset generation ever moves to CI or another machine.

**Fix:** detect the OS or accept a `FONT_PATH` env var with a sensible per-platform default; bundle a font in `assets/` for full reproducibility.

### 5. The metadata schema is defined in three places _(Priority 18)_

The schema is specified as prose in CLAUDE.md, enforced in `validate-metadata.js`, and re-implemented (field reads, derived fields) in the `.eleventy.js` collection mapping. Adding or renaming a field means editing all three, and nothing forces them to agree. This is the structural source of the lyrics confusion.

**Fix:** treat `validate-metadata.js` as the single source of truth (it already exports its functions), have the Eleventy collection import and reuse it, and link CLAUDE.md to the code rather than restating the rules.

### 6. Asset scripts handle only `.wav` masters, not `.aif` _(Priority 16)_

`.gitignore` lists `master-home.aif` / `master-pro.aif`, implying AIFF masters are expected. But all three generators (`generate-shorts.sh`, `generate-visualizer.sh`, `generate-lyric-video.js`) only probe for `.wav` and error out with "no master file found" if only an `.aif` exists. Either drop the `.aif` lines from `.gitignore` or add `.aif` to the fallback chain — right now they disagree.

### 7. No `engines` pin; environment drift _(Priority 15)_

`package.json` has no `engines` field. CI uses Node 24; this workspace runs Node 22. Eleventy 3 / `eleventy-img` 6 are fine on both today, but nothing prevents a contributor's local build from diverging from CI. Add `"engines": { "node": ">=22" }` and consider an `.nvmrc`.

### 8. `drawtext` escaping and the single mega-filtergraph are fragile and untested _(Priority 15)_

`escapeForDrawtext` does multi-level backslash escaping by hand, and every lyric line becomes its own `drawtext` in one giant `-filter_complex` string. A lyric with an unusual character could break the ffmpeg command, and a long song produces a very large filtergraph / command line. None of this is unit-tested (the parser and escaper are pure functions that easily could be). Extract and test the lyric parser + escaper.

### 9. Deploy workflow doesn't run the tests _(Priority 15)_

`validate.yml` runs `node --test`, but `deploy.yml` runs only `npm run validate` before building and publishing. Adding `npm test` to the deploy job (or making deploy depend on the validate workflow) closes the gap so a green deploy implies green tests.

### 10. Duplicated logic across the generation scripts _(Priority 12)_

The "prefer `master-pro.wav`, fall back to `master-home.wav`, else error" block is copy-pasted in three scripts, and the `scale=…:force_original_aspect_ratio=increase,crop=…` vertical-crop incantation is repeated across the canvas/shorts filters. Factor these into a shared `scripts/lib.sh` (e.g. `resolve_master <slug>`) so a fix or a new master format lands in one place. This also makes finding #6 a one-line change.

### 11. `lyrics` is loaded into the collection but never rendered _(Priority 8)_

`.eleventy.js` reads `lyrics.txt` into each song object, but `site/songs/song.njk` never references `lyrics` (confirmed). It's harmless dead data today — either render it (lyric section on the song page) or drop the read. Low priority; note it so it doesn't mislead.

## Phased remediation plan

Designed to slot alongside the weekly release cadence — no phase blocks shipping music.

**Phase 1 — Quick wins (≈1 hour, do in one PR).** Items 1, 2, 7, 9. Fix the lyric-video gate, correct the README, add the `engines` pin, and run tests in deploy. These are near-zero-risk and immediately make the one-command pipeline and CI trustworthy.

**Phase 2 — Single source of truth (≈half a day).** Items 5, then 6 and 10. Make the Eleventy collection import the validator's exports, then consolidate the duplicated shell logic into `scripts/lib.sh` and fix the `.wav`/`.aif` mismatch there. After this, the schema and master-resolution rules each live in exactly one place.

**Phase 3 — Test the untested (≈1 day).** Items 3 and 8. Extract the pure helpers from `.eleventy.js` and `generate-lyric-video.js` into testable modules and cover the date-gating, JSON-LD, and lyric-parsing/escaping paths with `node --test`. Highest-risk code, so do it once the structure from Phase 2 makes extraction clean.

**Phase 4 — Portability polish (≈2 hours, optional).** Item 4 (font path / bundled font) and item 11 (render or drop lyrics). Only urgent if you move asset generation off your Mac.
