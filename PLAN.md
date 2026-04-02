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

---

## Working Rules

1. Before starting meaningful work, read this file, [CHANGELOG.md](CHANGELOG.md), and [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).
2. Mark backlog items accurately as work progresses.
3. Record non-obvious architectural choices in the ADR section.
4. Add a short session log entry for each meaningful work session.
5. Update [CHANGELOG.md](CHANGELOG.md) for completed change sets.
6. Before commit/push, bump the visible app version in [js/version.js](js/version.js) and keep it aligned with the intended release section in [CHANGELOG.md](CHANGELOG.md).
7. Keep this document concise and current; remove stale planning notes instead of layering new ones on top.

---

## Current State Snapshot (2026-04-01)

| Area | Status |
|---|---|
| Branding | Core app rebranded to Livery Lab |
| Brand styling | Neon lime/yellow-on-black theme applied |
| Header branding | Uses workspace `fullLogo.png` asset plus a visible version badge |
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
- Generate and use [templates/cars.json](templates/cars.json) as the static manifest
- Generalize built-in template loading to take a manifest entry
- Drive export folder hints from selected car metadata
- Remove default GR86 template auto-loading on refresh
- Replace startup list UI with a search dropdown
- Prevent startup dropdown results from resizing the modal by anchoring it as a floating overlay
- Replace the top-left inline SVG mark with [logo.png](logo.png)

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
  - Driven by a `category` field in [templates/cars.json](templates/cars.json)

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
  - Verify current `lib/tga.js` behavior for non-2048 and non-square templates
  - Add defensive handling if decode assumptions are wrong

- [ ] `file://` startup behavior
  - Built-in manifest/template fetch still depends on browser fetch rules
  - Consider a clearer user-facing message when bundled template loading is unavailable locally

- [ ] Architecture doc cleanup
  - Remove stale Three.js/runtime references and older theme/startup-picker wording from [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
  - Keep docs aligned with the shipped 2D app and category-chip startup picker

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
Use [templates/cars.json](templates/cars.json) as the source of truth for bundled car metadata.

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

---

## Known Constraints

- No server: all features must work in a static deployment model
- No build step: scripts load directly in browser order
- Script load order matters: `lib/tga.js` → `js/export.js` → `js/editor.js` → `js/app.js`
- Bundled PSDs are large; lazy load only
- iRacing export target is still a per-car folder + `car_XXXXXXXX.tga/png` naming workflow
- Some browsers restrict `fetch()` for `file://` use, which can block bundled manifest/template loading

---

## Current Risks / Follow-Ups

- Export folder hints now include a curated pass for the ambiguous Class B stock-car variants, but future manifest additions still need review
- Built-in manifest/template loading still depends on browser `fetch()` behavior and can degrade under `file://`

---

## Session Log

### Session: 2026-04-01 — Rebrand, multi-car support, picker refinement
- Rebranded the app UI and styling to Livery Lab
- Replaced the top-left inline mark with [logo.png](logo.png)
- Generated [templates/cars.json](templates/cars.json) for 164 bundled templates
- Added category metadata to [templates/cars.json](templates/cars.json) and a category filter to the startup picker
- Implemented manifest-driven built-in template loading
- Removed default GR86 template auto-loading on refresh
- Updated export hints to follow the selected car
- Iterated the startup picker from a long list to a cleaner search-only dropdown
- Changed the dropdown to float so search no longer resizes the modal
- Fixed undo/redo so rasterized strokes and fills save as a single history step and restored layer categories after history navigation
- Refreshed README, architecture notes, changelog, and repo memory

### Session: 2026-04-01 — Plan audit and backlog pruning
- Reviewed [PLAN.md](PLAN.md) item by item against the current repo and docs
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
- Swapped the compact top-left mark/text treatment for the full-width [fullLogo.png](fullLogo.png) brand asset
- Added a visible top-bar version badge sourced from [js/version.js](js/version.js)
- Added a planning rule that version bumps and changelog release sections should stay aligned before commit/push

### Session: 2026-04-01 — Priority 1 picker completion
- Added browser-local recent bundled cars to the startup picker and surfaced them ahead of general search results
- Replaced the lossy Class B stock-car folder hints in [templates/cars.json](templates/cars.json) with clearer curated slugs so export messaging is less ambiguous
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
3. Clean up [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) so it matches the shipped 2D app and current picker/theme behavior.
