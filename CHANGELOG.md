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

## [2026-04-03] v0.1.3 — QA Closure And Migration Baseline Stabilization

### Added
- `docs/QA/fixtures/saves/legacy-pre-architecture-v0.1.2.json`, `docs/QA/templates/Toyota GR86.psd` — added a legacy pre-architecture save fixture and a copied Toyota GR86 template inside the QA folder so regression testers have stable reference assets alongside the rest of the QA material.
- `docs/QA/README.md` — added a short tester-facing QA guide in the QA folder so general users know which checklist sections to use, how to fill in metadata, and how to record passes, issues, and blockers consistently.
- `docs/QA/tools/open-iracing-local-tga-preview.bat`, `docs/QA/QA-TEST-PLAN.md` — added a small Windows QA helper that lists `.tga` files in the folder you run it from, orders them by newest modified first, defaults Enter to item `1`, and opens the local iRacing preview URL with the selected full path prefilled.
- `docs/QA/Tests/Slice1/Chrome/MANUAL-TEST-CHECKLIST.md`, `docs/QA/Tests/Slice1/Edge/MANUAL-TEST-CHECKLIST.md` — added prefilled per-browser QA checklist copies for Slice1 so test runs can be tracked directly inside the QA folder structure without re-entering the common metadata each time.
- `.github/instructions/learner-friendly-workflow.instructions.md` — added a repo-scoped instruction that tells the agent to use explicit, plain-English wording for a learner across Git, JavaScript, QA, and release-workflow tasks without adding separate tutorial sections.
- `docs/QA/QA-TEST-PLAN.md`, `docs/QA/MANUAL-TEST-CHECKLIST.md`, `README.md` — added a formal team QA test plan, a step-by-step manual regression checklist, and README links so the app now has a documented handoff path for structured testing.
- `docs/IMPROVEMENT_PLAN.md`, `docs/PLAN.md` — added a repository-facing architecture modernization plan in the docs folder and linked the working roadmap to it so long-range migration work now has a dedicated home separate from the tactical backlog.
- `docs/parallel-workstreams/README.md`, `docs/parallel-workstreams/**/PLAN.md`, `docs/IMPROVEMENT_PLAN.md`, `docs/PLAN.md` — added an agent-oriented parallel execution planning package so the architecture migration is split into explicit workstreams with ownership, dependencies, handoffs, and wave-based sequencing.
- `docs/parallel-workstreams/PROMPTS.md`, `docs/parallel-workstreams/**/START_PROMPT.md` — added reusable kickoff prompts for each workstream agent so parallel execution can start from consistent scope, guardrails, and first-slice expectations.
- `js/core/history/transaction-history.js` — added the first transition-stage history module so operation taxonomy, grouped transaction metadata, checkpoint rules, and reversibility classes now exist independently from the legacy snapshot stack.

### Changed
- `js/editor.js`, `js/app.js`, `docs/QA/MANUAL-TEST-CHECKLIST.md`, `docs/QA/QA-TEST-PLAN.md` — changed layer-opacity slider edits to stay live on screen while collapsing one drag into one undoable history transaction, and added QA coverage for single-step opacity undo.
- `js/editor.js`, `js/app.js`, `docs/QA/MANUAL-TEST-CHECKLIST.md`, `docs/QA/QA-TEST-PLAN.md` — updated fill so it now preserves the selected target when entering fill mode, applies directly to selected fill-capable objects instead of creating a new layer, keeps the filled object selected afterward, and aligns the QA docs with that behavior.
- `index.html`, `css/style.css`, `js/app.js` — replaced the text-tool's short hard-coded font list with a runtime-built supported-font picker from a larger Windows-oriented catalog, kept imported document fonts selectable, previewed each option in its own typeface where the browser supports it, removed the international/UI group, and increased the dropdown text size for easier scanning.
- `js/app.js` — fixed the properties-panel visibility rules so selecting a gradient, line, text object, or stroked shape in `select` mode keeps the relevant controls visible instead of hiding them as soon as tool mode returns to `select`.
- `js/editor.js`, `js/app.js` — stored primary/secondary colour metadata on selectable objects so selecting gradients, lines, and stroked shapes now pushes the correct secondary colour back into the properties UI instead of leaving the picker stale.
- `js/editor.js` — updated the line tool so it now uses the primary and secondary colours as a gradient stroke, matching the two-colour line controls already exposed in the properties panel instead of showing a misleading extra colour control.
- `js/editor.js`, `js/app.js` — changed the gradient tool from an immediate base-layer merge into a draggable selectable gradient object, aligned line stroke handling with the existing secondary-colour control, and made the font controls apply to the selected text object instead of only affecting new text defaults.
- `index.html`, `js/app.js`, `docs/QA/MANUAL-TEST-CHECKLIST.md`, `docs/QA/QA-TEST-PLAN.md`, `docs/PLAN.md` — removed the advertised `U` upload-image shortcut from the UI and QA docs so upload image is documented consistently as a toolbar action instead of a keyboard feature.
- `js/editor.js` — changed duplicate, upload-image, text, and shape insertion to stay adjacent to the current layer context instead of always inserting above the first paint layer, which avoids splitting one logical layer group into repeated folder sections in the layers panel.
- `js/editor.js` — fixed the raster paint merge math for non-base image layers so brush, eraser, and fill now operate in the selected layer's local bounds instead of rebuilding painted sublayers at an offset that shifted the layer and misapplied edits.
- `docs/QA/README.md`, `docs/QA/QA-TEST-PLAN.md`, `docs/QA/MANUAL-TEST-CHECKLIST.md`, `docs/QA/Tests/Slice1/*`, `README.md`, `docs/PLAN.md`, `docs/IMPROVEMENT_PLAN.md`, `docs/parallel-workstreams/agent-07-qa-cutover-integration/*` — reorganized the QA folder so the main QA docs now live together under `docs/QA/`, fixed the checklist-plan relative links after the move, and updated the root README to send testers to the QA README first.
- `docs/QA/README.md`, `docs/QA/Tests/Slice1/*`, `docs/PLAN.md` — updated the QA docs after moving `Slice1` under `docs/QA/Tests/`, including the deeper checklist links back to the QA plan.
- `docs/QA/tools/open-iracing-local-tga-preview.bat` — fixed the batch helper's PowerShell handoff so folder scanning and path encoding work correctly when launched from `cmd` on Windows.
- `docs/QA/MANUAL-TEST-CHECKLIST.md`, `docs/PLAN.md` — converted the manual checklist into a copy-friendly Markdown QA run template with task checkboxes, a small metadata block, and merge-check wording aligned to the functionality-first QA plan.
- `js/core/dispatcher.js`, `js/core/app-store.js`, `js/app.js`, `index.html`, `docs/ARCHITECTURE.md`, `docs/parallel-workstreams/agent-02-app-shell-state/PLAN.md`, `docs/MANUAL-TEST-CHECKLIST.md`, `docs/QA-TEST-PLAN.md` — added the first concrete app-shell dispatcher/store slice and moved the export modal plus export-size shell preference behind dispatched intents and selectors, while documenting the remaining toolbar/picker/modal state still owned directly in `js/app.js`.
- `docs/ARCHITECTURE.md`, `docs/IMPROVEMENT_PLAN.md`, `docs/PLAN.md`, `docs/parallel-workstreams/README.md`, `docs/parallel-workstreams/agent-01-foundation-contracts/PLAN.md` — published the first shared migration contract baseline so downstream agents now have an explicit module-boundary map, state-ownership matrix, command/event naming rules, ADR alignment, and high-risk overlap zones.
- `docs/QA-TEST-PLAN.md`, `docs/MANUAL-TEST-CHECKLIST.md`, `docs/parallel-workstreams/agent-07-qa-cutover-integration/PLAN.md` — defined Agent 07's first migration QA slice with a hotspot baseline matrix, per-workstream regression expectations, partial-merge gates, transition-state risk tracking, and final cutover criteria so parallel slices no longer depend on ad hoc memory.
- `docs/QA-TEST-PLAN.md`, `docs/PLAN.md` — reformatted the QA plan for faster scanning and added an explicit merge-gate runbook so `run the merge-gate` now maps to concrete classification, smoke, regression, timing, documentation, and pass/block steps.
- `docs/QA-TEST-PLAN.md`, `docs/PLAN.md` — simplified the QA plan to focus on feature functionality and regression coverage by removing performance-metric recording guidance from the merge-gate flow and leaving save/load, export parity, and workflow validation as the primary release gate.
- `js/core/document/document-schema.js`, `js/editor.js`, `js/app.js`, `index.html`, `docs/ARCHITECTURE.md`, `docs/parallel-workstreams/agent-03-document-model-persistence/PLAN.md`, `docs/QA-TEST-PLAN.md`, `docs/MANUAL-TEST-CHECKLIST.md` — introduced the first explicit `EditorDocument v1` contract, routed project save/load through a versioned document wrapper, defined layer-record ownership apart from raw Fabric shape, and added a legacy Fabric-JSON migration adapter so persistence work now has a concrete document boundary.
- `js/editor.js`, `index.html`, `docs/ARCHITECTURE.md`, `docs/parallel-workstreams/agent-04-history-commands/PLAN.md`, `docs/QA-TEST-PLAN.md`, `docs/MANUAL-TEST-CHECKLIST.md` — started the history migration by documenting the first operation taxonomy, adding a transition-stage history session beside snapshot undo/redo, and prototyping grouped selected-object nudge transactions with idle-based checkpointing.
- `js/editor.js`, `js/app.js`, `docs/parallel-workstreams/agent-06-tools-workspace-ui/PLAN.md` — documented Agent 06's first tool/runtime migration slice, made the shared tool-controller lifecycle explicit, scoped `gradient` as the lowest-risk first extraction, and added a workspace-state adapter so the toolbar and layers panel can render from a derived editor snapshot instead of ad hoc editor reads.
- `docs/ARCHITECTURE.md`, `docs/parallel-workstreams/agent-05-render-export-pipeline/PLAN.md` — documented Agent 05's first render/export slice by making the current full-surface brush, fill, and export merge hotspots explicit, defining the first shared compositor contract and invalidation model, and narrowing the first implementation target to committed raster layer composition shared by viewport base rendering and export.

### Notes
- This release closes the current Slice1 QA follow-up loop, aligns the shipped UI behavior with the updated QA docs, and checkpoints the first combined architecture-migration baseline before the next cutover slice.

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
