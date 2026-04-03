# Livery Lab — Agent Planning Document

> FOR AGENT USE ONLY. This file is the working plan, current-state snapshot, and decision log for the repository.
> Keep it current. Prefer updating this file over leaving implicit context in chat history.

---

## Project Overview

Livery Lab is a free, browser-based iRacing livery editor.
It is a static HTML/CSS/JavaScript app with no build step and no backend.
Deployment target is GitHub Pages.

### Product Goals

- Let users paint iRacing liveries in the browser with no install or account requirement
- Support bundled templates for many iRacing cars, not just a single GR86 workflow
- Preserve a simple static-hosting model with direct file editing and no toolchain
- Keep export flow compatible with iRacing PNG/TGA expectations

### Related Planning Docs

- [IMPROVEMENT_PLAN.md](IMPROVEMENT_PLAN.md) defines the longer-range architecture modernization path.
- [parallel-workstreams/README.md](parallel-workstreams/README.md) breaks that modernization plan into agent-owned parallel workstreams.
- [parallel-workstreams/PROMPTS.md](parallel-workstreams/PROMPTS.md) contains the kickoff prompts for each assigned workstream agent.
- This file remains the current-state roadmap, backlog, and decision log for day-to-day repo work.

---

## Working Rules

1. Before starting meaningful work, read this file, [CHANGELOG.md](../CHANGELOG.md), and [docs/ARCHITECTURE.md](ARCHITECTURE.md).
2. Mark backlog items accurately as work progresses.
3. Record non-obvious architectural choices in the ADR section.
4. Add a short session log entry for each meaningful work session.
5. Update [CHANGELOG.md](../CHANGELOG.md) for completed change sets.
6. Before commit/push, bump the visible app version in [js/version.js](../js/version.js) and keep it aligned with the intended release section in [CHANGELOG.md](../CHANGELOG.md).
7. Keep this document concise and current; remove stale planning notes instead of layering new ones on top.

---

## Current State Snapshot (2026-04-01)

| Area | Status |
|---|---|
| Branding | Core app rebranded to Livery Lab |
| Brand styling | Neon lime/yellow-on-black theme applied |
| Header branding | Uses workspace `assets/brand/fullLogo.png` asset plus a visible version badge |
| Car support | Bundled selector supports 164 PSD templates |
| Car picker UX | Search-driven floating dropdown with category filter and recent cars |
| Default startup behavior | Opens picker on blank canvas; no default template auto-load |
| Export hints | Driven by selected car manifest entry with curated fixes for ambiguous Class B variants |
| Layer system | Working: PSD layers, user layers, guides, spec map |
| Tools | Brush, eraser, fill, rect, circle, line, gradient, text, select |
| Undo/redo | Stabilized JSON snapshot history with preserved metadata and restored select-target identity |
| Save/load | JSON project serialization working |
| Export PNG/TGA | Working at 1024 and 2048 |
| Hosting model | Static only, no build step |

---

## What Is Done

### Completed Foundation Work

- Rebrand from GR86 Paint Studio to Livery Lab across the core UI and docs
- Replace single-car startup flow with bundled multi-car support
- Generate and use [templates/cars.json](../templates/cars.json) as the static manifest
- Generalize built-in template loading to take a manifest entry
- Drive export folder hints from selected car metadata
- Remove default GR86 template auto-loading on refresh
- Replace startup list UI with a search dropdown
- Prevent startup dropdown results from resizing the modal by anchoring it as a floating overlay
- Replace the top-left inline SVG mark with [logo.png](../assets/brand/logo.png)

### Known Good Behaviors

- Bundled template search works from the startup modal
- Recent bundled cars are remembered in localStorage and shown ahead of general search results
- Manual template upload still works for PSD/TGA/image flows
- Export path hints update when a bundled car is selected
- Undo/redo restores the correct selected layer/object in select mode
- Canvas tool and layer behavior from the prior active-layer refactor remains intact

---

## Active Backlog

Status legend:
- `[ ]` not started
- `[→]` in progress
- `[✓]` completed
- `[✗]` cancelled

### Priority 1 — Picker UX And Metadata Quality

- [✓] Car category filter in startup picker
  - Group or filter by GT3, GTP, NASCAR, Dirt, Formula, Touring, etc.
  - Driven by a `category` field in [templates/cars.json](../templates/cars.json)

- [✓] Recently used cars
  - Persist last 5 selections in localStorage
  - Show them above search results or as search suggestions

- [✓] Official folder mapping audit
  - Replace best-effort slug values with curated iRacing folder names where inaccurate
  - Keep `folder` reliable enough that users can trust export hints

### Priority 2 — Canvas And Workflow Polish

- [ ] Template opacity UX pass
  - Re-evaluate default opacity and interaction model
  - Candidate: lower default for painting workflows or remember last-used opacity

- [ ] Empty-state and onboarding copy pass
  - Tighten startup modal and toolbar hints now that branding and picker behavior are stable

### Priority 3 — Technical Debt / Correctness

- [ ] Brush merge performance
  - Current stroke merge path creates a full Fabric `StaticCanvas` per stroke
  - Profile before optimizing; avoid speculative complexity

- [ ] TGA decode guard for non-square inputs
  - Verify current `js/vendor/tga.js` behavior for non-2048 and non-square templates
  - Add defensive handling if decode assumptions are wrong

- [ ] `file://` startup behavior
  - Built-in manifest/template fetch still depends on browser fetch rules
  - Consider a clearer user-facing message when bundled template loading is unavailable locally

- [✓] Architecture doc cleanup
  - Remove stale Three.js/runtime references and older theme/startup-picker wording from [docs/ARCHITECTURE.md](ARCHITECTURE.md)
  - Added the first migration contract baseline so downstream agents have a shared boundary map, state-ownership matrix, naming rules, and overlap zones

### Future / Nice To Have

Ranked by user-visible value, implementation dependency order, and fit with the current static/no-backend architecture.

1. [ ] Tutorial modal
  - Acceptance: app shows a concise first-run tutorial modal that explains the picker, core tools, layers, and export flow.
  - Acceptance: user can dismiss the tutorial, avoid seeing it again automatically, and reopen it manually later.
  - Acceptance: tutorial content stays accurate for the current shipped workflow and works on both desktop and mobile layouts.

2. [ ] Per-layer finish / spec-map controls
  - Acceptance: user can assign a finish preset or custom finish values to the selected layer.
  - Acceptance: finish settings persist through undo/redo and project save/load.
  - Acceptance: export reflects the configured finish/spec behavior without altering unrelated layers.

3. [ ] Customizable painting guides
  - Acceptance: app exposes built-in guides for at least car mask, wireframe, sponsor blocks, number blocks, and grid.
  - Acceptance: each guide has independent visibility and opacity controls.
  - Acceptance: guide state never appears in exported PNG/TGA output.

4. [ ] Advanced layer styling and transforms
  - Acceptance: selected layers support flip, rotation, skew, and at least one richer style option such as shadow or sticker padding.
  - Acceptance: transform/style changes remain editable after selection changes.
  - Acceptance: all new layer properties persist through save/load and undo/redo.

5. [ ] Expanded shape toolkit
  - Acceptance: app adds at least ellipse, star, regular polygon, and arrow beyond the current shape set.
  - Acceptance: new shapes use the existing layer system and property controls.
  - Acceptance: created shapes remain selectable, movable, and export correctly.

6. [ ] Brush toolkit expansion
  - Acceptance: app adds at least a small set of brush variants or stroke behaviors beyond the current single brush/eraser workflow.
  - Acceptance: new brush options work with the existing active-layer targeting and single-step undo behavior.
  - Acceptance: brush settings are reflected clearly in the UI and do not break export fidelity.

7. [ ] Canvas rotation workflow
  - Acceptance: user can rotate the working canvas view left and right without modifying exported artwork data.
  - Acceptance: painting, selection, and zoom continue to behave correctly while rotated.
  - Acceptance: resetting rotation returns the viewport to the normal upright orientation.

8. [ ] Car-parts overlay controls
  - Acceptance: user can switch car-part overlays between above-art and below-art viewing modes.
  - Acceptance: overlay mode affects editor visibility only and does not unexpectedly change export output.
  - Acceptance: if editable car-part clones are added, they enter the normal layer stack as explicit user-visible layers.

9. [ ] Number builder / reusable number-layer workflow
  - Acceptance: user can create a number layer from a guided number workflow instead of drawing it manually each time.
  - Acceptance: generated number layers remain editable as normal layers after creation.
  - Acceptance: number workflow respects car-specific safe placement constraints when those guides exist.

10. [ ] Number plate helper
  - Acceptance: user can insert a number plate helper layer or overlay for supported cars.
  - Acceptance: helper placement aligns with the active template's expected number region.
  - Acceptance: helper can be hidden or removed without affecting painted artwork.

11. [ ] Color presets / saved palettes
  - Acceptance: user can save named colors or palette entries locally in the browser.
  - Acceptance: saved colors can be reapplied from the UI in one click.
  - Acceptance: palette storage survives page refresh in the same browser.

12. [ ] Decal library
  - Acceptance: user can browse and insert decals from a local or bundled decal list.
  - Acceptance: inserted decals become normal editable layers.
  - Acceptance: missing decal assets fail gracefully without breaking the current project.

13. [ ] Layer blend modes
  - Acceptance: selected layers expose at least a small supported set of blend/composite modes.
  - Acceptance: blend mode changes are visible on-canvas immediately.
  - Acceptance: export output matches the on-canvas composite result for supported modes.

14. [ ] Mirror paint workflow
  - Acceptance: user can mirror eligible artwork placement across a defined symmetry workflow.
  - Acceptance: mirrored edits stay predictable and do not silently affect unsupported areas.
  - Acceptance: user can disable mirroring and continue editing normally.

15. [ ] Shared uploads / share codes
  - Acceptance: user can export a reusable decal/logo package as a shareable code or file token.
  - Acceptance: importing that code or token reconstructs the shared asset locally with its expected appearance.
  - Acceptance: invalid or unsupported codes fail with a clear user-facing message.

16. [ ] Live sim preview handoff
  - Acceptance: user can trigger a workflow that prepares the current paint for rapid local preview outside the editor.
  - Acceptance: the handoff uses a documented local-only flow and does not require a backend service.
  - Acceptance: preview handoff failures report the missing prerequisite instead of silently doing nothing.

17. [ ] Trading Paints integration
  - Acceptance: if enabled, user can export or hand off a paint in a Trading Paints-compatible format or workflow.
  - Acceptance: integration remains optional and does not block the app's standalone export path.
  - Acceptance: unavailable integration paths surface a clear fallback to local export.

18. [ ] Project sharing / collaboration
  - Acceptance: user can share a project artifact that another user can open with the same visible result.
  - Acceptance: any edit-capable sharing mode preserves layer metadata and project fidelity.
  - Acceptance: the feature is scoped so the static-hosted app still works fully without signing in.

---

## Architecture Decisions Log (ADR)

### ADR-001 — Static manifest for bundled car list (2026-03-31)
Context:
Need to expose 150+ bundled cars in a static app without directory listing support.

Decision:
Use [templates/cars.json](../templates/cars.json) as the source of truth for bundled car metadata.

Rationale:
GitHub Pages cannot dynamically enumerate template files. A static manifest is cacheable, versioned, and easy to evolve.

Status:
Implemented.

### ADR-002 — No build step (inherited, 2026-03-31)
Context:
The project already runs from plain script tags and static assets.

Decision:
Keep the project buildless. Do not introduce npm, bundlers, or TypeScript unless the project direction changes significantly.

Rationale:
Preserves the product goal of trivial deployment and low maintenance overhead.

Status:
Active constraint.

### ADR-003 — Best-effort folder slugs for first-pass multi-car support (2026-04-01)
Context:
Bundled PSD names do not always match official iRacing paint folder names exactly, but the export UX needed per-car folder hints immediately.

Decision:
Generate folder slugs from filenames with a small set of overrides for known exceptions.

Rationale:
This shipped multi-car UX quickly without blocking on a full manual folder audit.

Status:
Updated with a conservative curated pass for the ambiguous Class B stock-car variants; future manifest additions should still be reviewed.

### ADR-005 — Recent bundled cars are browser-local only (2026-04-01)
Context:
Users needed a faster way to reopen the same few bundled cars without adding any backend or account state.

Decision:
Persist the last 5 bundled car selections in browser `localStorage` and surface them at the top of the picker results.

Rationale:
This improves repeat workflows while keeping the app fully static and avoiding cross-device persistence assumptions.

Status:
Implemented.

### ADR-004 — Search-first startup picker instead of a long persistent list (2026-04-01)
Context:
A permanent list of 164 cars produced poor readability and awkward modal sizing.

Decision:
Use a search input with a floating dropdown for results.

Rationale:
Reduces visual noise, scales better to the car count, and keeps the modal shell stable while searching.

Status:
Implemented.

### ADR-006 — Core, UI, and adapter seams are the migration boundary (2026-04-02)
Context:
The current runtime is still concentrated in `js/app.js`, `js/editor.js`, and `js/export.js`, but parallel migration work needs a stable target structure before code extraction starts.

Decision:
Treat `js/core/**` as the future home for state, commands, history, render contracts, and tool contracts; treat `js/ui/**` as the future home for DOM/event wiring; isolate Fabric, file IO, storage, manifest fetches, and codec integrations behind adapters.

Rationale:
This lets downstream agents extract code toward one consistent architecture instead of inventing incompatible seams in parallel.

Status:
Active migration contract.

### ADR-007 — Persisted document state excludes transient tool and UI state (2026-04-02)
Context:
The first `EditorDocument` schema needs clear ownership boundaries so persistence, history, and export work do not become coupled to temporary UI or pointer state.

Decision:
Serialize durable document data such as layers, template/car metadata, guides, and export profile. Keep transient tool previews, hover state, modal state, picker filters, and similar UI concerns out of the persisted document contract.

Rationale:
This keeps project files stable, reduces migration risk, and avoids forcing history/render systems to model ephemeral browser interactions as durable data.

Status:
Active migration contract.

---

## Known Constraints

- No server: all features must work in a static deployment model
- No build step: scripts load directly in browser order
- Script load order matters: `js/vendor/tga.js` → `js/export.js` → `js/editor.js` → `js/app.js`
- Bundled PSDs are large; lazy load only
- iRacing export target is still a per-car folder + `car_XXXXXXXX.tga/png` naming workflow
- Some browsers restrict `fetch()` for `file://` use, which can block bundled manifest/template loading

---

## Current Risks / Follow-Ups

- Export folder hints now include a curated pass for the ambiguous Class B stock-car variants, but future manifest additions still need review
- Built-in manifest/template loading still depends on browser `fetch()` behavior and can degrade under `file://`

---

## Session Log

### Session: 2026-04-03 - Release metadata aligned for the QA-closed stabilization slice
- Moved the completed `Unreleased` work into [../CHANGELOG.md](../CHANGELOG.md) as `v0.1.3` so the Slice1 QA closure and the first migration baseline now have a clean release boundary before the next cutover slice
- Updated [../js/version.js](../js/version.js) so the visible app version now matches the new `v0.1.3` release section

### Session: 2026-04-03 - Layer opacity undo now collapses to one step
- Updated [../js/editor.js](../js/editor.js) and [../js/app.js](../js/app.js) so layer-opacity slider changes now stay live during the drag but commit as one history transaction when the adjustment finishes instead of requiring many undo steps
- Updated [QA/MANUAL-TEST-CHECKLIST.md](QA/MANUAL-TEST-CHECKLIST.md) and [QA/QA-TEST-PLAN.md](QA/QA-TEST-PLAN.md) so QA explicitly checks single-step undo behavior for layer-opacity changes

### Session: 2026-04-03 - Fill now targets the selected object instead of creating a new layer
- Updated [../js/editor.js](../js/editor.js) and [../js/app.js](../js/app.js) so fill mode now retains the selected target, applies solid fill directly to selected fill-capable objects when clicked inside them, and keeps the filled object selected afterward instead of falling through to a new layer
- Updated [QA/MANUAL-TEST-CHECKLIST.md](QA/MANUAL-TEST-CHECKLIST.md) and [QA/QA-TEST-PLAN.md](QA/QA-TEST-PLAN.md) so QA explicitly checks selected-object fill behavior alongside active-layer fill

### Session: 2026-04-03 - Font picker improved for text-tool usability
- Updated [../index.html](../index.html), [../css/style.css](../css/style.css), and [../js/app.js](../js/app.js) so the text-tool font picker now builds itself from a larger Windows-oriented catalog, filters that list down to fonts the browser can actually use, preserves imported document fonts in the picker, previews each option in its own face where supported, removes the international/UI group, and uses larger dropdown text for easier scanning
- This addresses the remaining text-tool usability request from QA without introducing any build step or external dependency

### Session: 2026-04-03 - Properties panel now respects selected-object context in select mode
- Updated [../js/app.js](../js/app.js) so context-sensitive property groups stay visible for the selected object even after the active tool returns to `select`
- This fixes the remaining UI-state issue where gradient, line, text, and stroked-shape controls disappeared immediately after creation or on later selection

### Session: 2026-04-03 - Selected objects now repopulate the secondary-colour UI
- Updated [../js/editor.js](../js/editor.js) and [../js/app.js](../js/app.js) so selectable objects that use primary and secondary colours, especially gradients and lines, push those colours back into the properties panel when selected
- This keeps the visible colour controls aligned with the selected object instead of leaving the secondary picker stale after selecting gradient-backed objects

### Session: 2026-04-03 - Line tool now uses the visible two-colour controls
- Updated [../js/editor.js](../js/editor.js) so line creation and selected-line edits use a primary-to-secondary gradient stroke instead of exposing a second colour control that only partially applied
- This keeps the line tool aligned with the current properties UI instead of hiding a control that is now intentionally supported

### Session: 2026-04-03 - Gradient and text property follow-up
- Updated [../js/editor.js](../js/editor.js) so the gradient tool now behaves like a drag-created selectable object instead of immediately merging onto the base paint layer
- Updated [../js/editor.js](../js/editor.js) and [../js/app.js](../js/app.js) so font controls apply to the selected text object and the secondary-colour control updates selected line and shape strokes
- This addresses the remaining active QA reports around gradient behavior and text property controls from [QA/Tests/Slice1/Chrome/MANUAL-TEST-CHECKLIST.md](QA/Tests/Slice1/Chrome/MANUAL-TEST-CHECKLIST.md) and [QA/Tests/Slice1/Edge/MANUAL-TEST-CHECKLIST.md](QA/Tests/Slice1/Edge/MANUAL-TEST-CHECKLIST.md)

### Session: 2026-04-03 - Upload-image shortcut reference removed
- Updated [../index.html](../index.html), [../js/app.js](../js/app.js), [QA/MANUAL-TEST-CHECKLIST.md](QA/MANUAL-TEST-CHECKLIST.md), and [QA/QA-TEST-PLAN.md](QA/QA-TEST-PLAN.md) so upload image is treated as a toolbar action rather than an advertised keyboard shortcut
- This removes the misleading `U` shortcut reference from the UI and QA docs without claiming unsupported shortcut behavior as a shipped feature

### Session: 2026-04-03 - Layer insertion order stabilized for duplication follow-up
- Updated [../js/editor.js](../js/editor.js) so duplicate, upload-image, text, and shape insertion prefer the current layer context instead of always inserting above the first paint layer
- This addresses the next QA follow-up cluster from [QA/Tests/Slice1/Chrome/MANUAL-TEST-CHECKLIST.md](QA/Tests/Slice1/Chrome/MANUAL-TEST-CHECKLIST.md) and [QA/Tests/Slice1/Edge/MANUAL-TEST-CHECKLIST.md](QA/Tests/Slice1/Edge/MANUAL-TEST-CHECKLIST.md) around duplicated layer folders and multi-image group splitting

### Session: 2026-04-03 - Non-base raster targeting fix started
- Updated [../js/editor.js](../js/editor.js) so brush, eraser, and fill operate in the selected image layer's local bounds instead of rebuilding painted sublayers as full-canvas images at offset positions
- This addresses the first QA follow-up cluster from [QA/Tests/Slice1/Chrome/MANUAL-TEST-CHECKLIST.md](QA/Tests/Slice1/Chrome/MANUAL-TEST-CHECKLIST.md) and [QA/Tests/Slice1/Edge/MANUAL-TEST-CHECKLIST.md](QA/Tests/Slice1/Edge/MANUAL-TEST-CHECKLIST.md) around non-base-layer painting and layer shifting

### Session: 2026-04-02 - Slice1 QA checklist copies created
- Copied [QA/MANUAL-TEST-CHECKLIST.md](QA/MANUAL-TEST-CHECKLIST.md) into [QA/Tests/Slice1/Chrome/MANUAL-TEST-CHECKLIST.md](QA/Tests/Slice1/Chrome/MANUAL-TEST-CHECKLIST.md) and [QA/Tests/Slice1/Edge/MANUAL-TEST-CHECKLIST.md](QA/Tests/Slice1/Edge/MANUAL-TEST-CHECKLIST.md)
- Prefilled test metadata for owner `hman0994`, date `2026-04-02`, OS `Windows 11`, run mode `local HTTP`, and browser based on the folder name
- Adjusted the copied checklist links so they still point back to [QA/QA-TEST-PLAN.md](QA/QA-TEST-PLAN.md) from the deeper QA folder structure

### Session: 2026-04-02 - Manual checklist converted to QA run template
- Converted [QA/MANUAL-TEST-CHECKLIST.md](QA/MANUAL-TEST-CHECKLIST.md) into a copy-friendly Markdown checklist with test-run metadata fields and task checkboxes for easier slice-by-slice tracking
- Removed the last timing-oriented merge-check item so the manual checklist stays aligned with the functionality-first QA plan

### Session: 2026-04-02 - QA plan readability and merge-gate clarification
- Reformatted [QA/QA-TEST-PLAN.md](QA/QA-TEST-PLAN.md) with a quicker-scanning structure and added an explicit merge-gate runbook
- Clarified what `run the merge-gate` means in concrete step-by-step terms for the current migration slices

### Session: 2026-04-02 - QA plan simplified around functionality
- Removed performance-metric recording guidance from [QA/QA-TEST-PLAN.md](QA/QA-TEST-PLAN.md) and simplified the merge-gate around feature functionality, regression coverage, and export/save-load parity

### Session: 2026-04-02 - Parallel workstream planning package
- Created [parallel-workstreams/README.md](parallel-workstreams/README.md) as the coordination index for agent-owned modernization workstreams
- Added one `PLAN.md` per agent workstream under [parallel-workstreams](parallel-workstreams/README.md) so the architecture shift can be executed in controlled parallel slices
- Added [parallel-workstreams/PROMPTS.md](parallel-workstreams/PROMPTS.md) plus one `START_PROMPT.md` per workstream so each agent has a reusable kickoff brief
- Linked the parallel package from [IMPROVEMENT_PLAN.md](IMPROVEMENT_PLAN.md) and this roadmap
- Logged the planning expansion in [../CHANGELOG.md](../CHANGELOG.md)

### Session: 2026-04-02 - Foundation contract baseline published
- Updated [ARCHITECTURE.md](ARCHITECTURE.md) with the first migration contract baseline covering module boundaries, state ownership, naming rules, and high-risk overlap zones
- Updated [IMPROVEMENT_PLAN.md](IMPROVEMENT_PLAN.md) and [parallel-workstreams/README.md](parallel-workstreams/README.md) so the shared terminology and resolved state-boundary decisions match the architecture reference
- Added ADRs for the core-vs-UI migration seam and for excluding transient tool/UI state from the first persisted document schema

### Session: 2026-04-02 - Improvement plan document created
- Created [IMPROVEMENT_PLAN.md](IMPROVEMENT_PLAN.md) as the repo-facing architecture modernization plan
- Linked this roadmap to the improvement plan so long-range architecture work and near-term backlog tracking stay separated
- Logged the documentation addition in [../CHANGELOG.md](../CHANGELOG.md)

### Session: 2026-04-01 — Rebrand, multi-car support, picker refinement
- Rebranded the app UI and styling to Livery Lab
- Replaced the top-left inline mark with [logo.png](../assets/brand/logo.png)
- Generated [templates/cars.json](../templates/cars.json) for 164 bundled templates
- Added category metadata to [templates/cars.json](../templates/cars.json) and a category filter to the startup picker
- Implemented manifest-driven built-in template loading
- Removed default GR86 template auto-loading on refresh
- Updated export hints to follow the selected car
- Iterated the startup picker from a long list to a cleaner search-only dropdown
- Changed the dropdown to float so search no longer resizes the modal
- Fixed undo/redo so rasterized strokes and fills save as a single history step and restored layer categories after history navigation
- Refreshed README, architecture notes, changelog, and repo memory

### Session: 2026-04-01 — Plan audit and backlog pruning
- Reviewed [docs/PLAN.md](PLAN.md) item by item against the current repo and docs
- Removed the stale modal-specific keyboard shortcut backlog item because shortcuts are already surfaced in tooltips and README
- Tightened undo/redo status wording to reflect the select-mode restoration fix
- Collapsed vague documentation follow-ups into one explicit architecture-doc cleanup backlog item

### Session: 2026-04-01 — Trading Paints parity research
- Reviewed Trading Paints Help Center Paint Builder and Number Builder docs for concrete feature gaps
- Added specific future backlog items for painting guides, layer finishes, collaboration, share codes, advanced shapes, car-part overlay control, and sim-preview style workflows

### Session: 2026-04-01 — Ranked parity roadmap and acceptance criteria
- Re-ranked the future backlog into a dependency-aware roadmap that includes both old wishlist items and researched Trading Paints parity items
- Added slim implementation-ready acceptance criteria for every future roadmap item so the backlog is easier to scope and hand off

### Session: 2026-04-01 — Brush toolkit roadmap add
- Added `Brush toolkit expansion` to the Future / Nice To Have roadmap with slim acceptance criteria and a ranked position near other editor-capability upgrades

### Session: 2026-04-01 — Header branding and version source
- Swapped the compact top-left mark/text treatment for the full-width [fullLogo.png](../assets/brand/fullLogo.png) brand asset
- Added a visible top-bar version badge sourced from [js/version.js](../js/version.js)
- Added a planning rule that version bumps and changelog release sections should stay aligned before commit/push

### Session: 2026-04-01 — Priority 1 picker completion
- Added browser-local recent bundled cars to the startup picker and surfaced them ahead of general search results
- Replaced the lossy Class B stock-car folder hints in [templates/cars.json](../templates/cars.json) with clearer curated slugs so export messaging is less ambiguous
- Marked the remaining Priority 1 picker/metadata backlog items as completed

### Session: 2026-03-31 — Initial audit and planning bootstrap
- Explored the codebase and cataloged major files
- Confirmed the app was originally hardcoded to GR86
- Added planning/docs infrastructure: plan, changelog, architecture doc, repo memory
- Logged immediate priorities as rebrand plus multi-car support

---

## Next Recommended Step

If work resumes immediately, start here:

1. Revisit onboarding copy now that the picker supports category filters, recent cars, and curated export hints.
2. Re-evaluate template opacity defaults and whether the app should remember the last-used template opacity.
3. Clean up [docs/ARCHITECTURE.md](ARCHITECTURE.md) so it matches the shipped 2D app and current picker/theme behavior.
