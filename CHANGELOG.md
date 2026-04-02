# Changelog

All notable changes to **Livery Lab** are recorded here.

Format: `[YYYY-MM-DD] vX.Y.Z — Summary`  
Each entry lists **what** changed, **which files**, and **why**.

Versioning notes:
- Use semantic versions for release headings and the visible app badge.
- [js/version.js](js/version.js) is the UI version source; keep it aligned with the active release target in this file.
- Before commit/push for a release, move shipped items out of `Unreleased` and into the correct dated version section.

---

## [Unreleased]

### Fixed
- `js/editor.js` — `_syncObjectInteractivity` now truly locks interactivity to only the
  target object when one is provided; previously all valid objects remained selectable in
  select mode, allowing higher-stacked layers (decals, mask) to intercept clicks intended
  for the selected layer (issues #1, #4).
- `js/editor.js` — `_onSelection(null)` now calls `_syncObjectInteractivity(null)` when
  selection is cleared in select mode, restoring all-objects interactivity so the user can
  click to re-select any visible layer (issue #3).
- `js/editor.js` — `_restoreToolStateAfterHistoryLoad` no longer uses a stale
  `fallbackInteractiveObject`; if no object was selected before undo/redo, all valid layers
  become selectable instead of locking to an arbitrary fallback.
- `js/editor.js` — Added `perPixelTargetFind: true` to PSD-loaded image layers and
  user-uploaded images so that clicks on fully-transparent pixels fall through to the layer
  below instead of being absorbed by the bounding box of an overlapping layer (issues #1, #2, #4).
- `js/editor.js` — `perPixelTargetFind` is now included in `_historyStateProperties` and
  preserved in `_replaceLayerWithImage` `oldProps`, so the setting survives undo/redo,
  paint merges, and JSON project save/load.

---

## [2026-04-02] v0.1.2 — Selection And Object Editing Stability

### Fixed
- `js/editor.js`, `js/app.js`, `README.md`, `docs/ARCHITECTURE.md` — fixed select-mode layer interaction so visible editable objects stay reselectable, hidden layers no longer intercept clicks, and arrow keys can now nudge the selected object by 1px (`Shift` for 10px).

### Changed
- `js/version.js`, `index.html`, `README.md`, `CHANGELOG.md` — aligned the visible app version, release badge, and release history on `v0.1.2` before shipping the selection/editing fixes.

---

## [2026-04-02] v0.1.1 — Repo Layout And Release Metadata Cleanup

### Changed
- `docs/PLAN.md`, `js/vendor/tga.js`, `assets/brand/fullLogo.png`, `assets/brand/logo.png`, `index.html`, `README.md`, `docs/ARCHITECTURE.md`, `js/app.js`, `js/export.js` — reorganized the repo layout by moving planning, vendor, and brand assets into clearer folders and updated all runtime and documentation paths to match.
- `README.md`, `index.html`, `js/version.js`, `.github/copilot-instructions.md`, `.github/AGENTS.md`, `CHANGELOG.md` — aligned the public and internal release metadata on `v0.1.1`, refreshed the landing-page copy, and removed lingering old project naming from workspace metadata.

### Notes
- This release is a maintenance pass focused on repository organization, path consistency, and release/version alignment rather than new editor features.

---

## [2026-04-01] v0.1.0 — Initial Public Baseline

**First branded public baseline for Livery Lab.**

### Added
- `js/version.js` — added a single visible app-version source for the top-bar version badge and future release alignment.
- `templates/cars.json` — added a static manifest for the bundled car library, including category metadata, folder hints, and default dimensions.

### Changed
- `index.html`, `css/style.css`, `assets/brand/fullLogo.png`, `js/version.js`, `js/app.js` — switched the top-left header branding to `assets/brand/fullLogo.png` and added a visible `v0.1.0` app-version badge.
- `index.html`, `js/export.js`, `js/editor.js`, `README.md`, `docs/PLAN.md` — aligned export behavior and documentation around the supported 1024 and 2048 iRacing export sizes.
- `js/app.js`, `css/style.css`, `README.md` — shipped a search-driven startup picker with category filters and browser-local recent bundled cars.
- `templates/cars.json`, `js/app.js`, `README.md` — added curated export-folder hints, including clearer Class B stock-car variants.
- `js/editor.js`, `docs/ARCHITECTURE.md` — stabilized undo/redo so layer metadata and selected-object identity survive history navigation.
- `README.md`, `docs/PLAN.md`, `docs/ARCHITECTURE.md`, `CHANGELOG.md` — refreshed the docs and planning artifacts to match the current shipped app and version workflow.

### Notes
- This resets the public-facing version story to a clean `0.1.0` baseline while preserving the current product state.
- Earlier internal milestones were intentionally collapsed into this single first public release.

---

<!-- Template for future entries:

## [YYYY-MM-DD] — Short description

### Added
- Feature/file added and why

### Changed
- `path/to/file.js` — what changed and why

### Fixed
- Bug description — root cause and fix applied

### Removed
- What was removed and why

### Notes
- Any caveats, follow-ups, or context for future sessions

-->
