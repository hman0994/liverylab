# Livery Lab QA Test Plan

## Purpose

This document gives the team a repeatable way to QA Livery Lab before broader rollout. It defines what to test, where to test it, how to record issues, and what counts as release-ready for the current browser-based editor.

Use this plan together with [MANUAL-TEST-CHECKLIST.md](./MANUAL-TEST-CHECKLIST.md).

---

## Quick Start

Use this section if you do not want to read the whole file first.

### If You Are About To Merge An Architecture Slice

Run the `merge-gate`.

In this repo, `run the merge-gate` means:

1. Identify which workstream or workstreams the slice belongs to.
2. Run the Smoke pass first.
3. Run the required workstream checks from the regression map in this file.
4. If the slice changed save/load, export, history, or shared contracts, verify the related docs were updated in the same change.
5. Log any accepted temporary limitation in the transition-state risk table or the PR/handoff note.
6. Do not merge if any blocked condition in this file is still true.

### If You Fixed One Specific Bug

Run a `targeted retest`:

1. Reproduce the original bug.
2. Verify the fix.
3. Rerun the nearest adjacent workflow.
4. Rerun undo/redo for that workflow.
5. Rerun save/load or export if the touched feature can affect persisted output.

### If You Are Preparing A Broader Release Or Combined Cutover

Run:

1. Smoke pass.
2. Full regression pass from [MANUAL-TEST-CHECKLIST.md](./MANUAL-TEST-CHECKLIST.md).
3. Final combined cutover criteria in this file.

### What Counts As A Pass

A merge-gate pass is complete only when:

- Smoke passed.
- The required workstream checks passed.
- No blocking regression or undocumented transition-state risk remains.

---

## Recommended Next Steps For The Current Migration

If you have just landed or reviewed the current first-slice architecture work, the recommended next step is:

1. Run the merge-gate for the combined Agent 02, 03, 04, and 06 slice already present in the repo.
2. Fix any regressions found in export modal behavior, save/load, grouped nudge undo, or workspace-state rendering.
3. Only after that, start the next Agent 05 implementation slice for the compositor/export cutover.

That recommendation exists because the repo now has real transitional architecture code, and the safest next move is to stabilize it before expanding the render/export seam.

---

## Product Scope Under Test

Current QA coverage should focus on the shipped editor workflow:

- Startup template picker with bundled car search, category filters, and recent cars
- Blank-canvas start and custom template upload
- Core tools: select, brush, eraser, fill for selected objects or active paint layers, rectangle, circle, line, gradient, text
- Image upload for decals/logos
- Layer visibility, selection, ordering, opacity, duplication, and deletion
- Undo and redo stability during normal editing
- Project save and load via JSON
- PNG and 32-bit TGA export at 1024 and 2048
- Basic layout and usability on desktop and smaller viewports

Out of scope for this QA pass unless specifically requested:

- Server-side behavior
- Account/login flows
- Automated test coverage
- Deep browser performance profiling
- Mobile/touch-first support as a primary target

---

## Recommended Test Environments

Run the checklist in at least this matrix:

| Area | Minimum Coverage |
|---|---|
| Windows desktop | Latest Chrome, latest Edge |
| macOS desktop | Latest Chrome or Safari |
| Local run mode | Live site or local HTTP server |
| Direct `file://` open | One quick check only, to confirm bundled template limitations are understood |

Notes:

- Bundled car/template loading may fail when opening `index.html` directly with `file://` because browsers can block `fetch()` for local JSON/assets.
- Primary QA should use the published site or a local HTTP server so the bundled template workflow is exercised correctly.

---

## Test Data To Prepare

Each tester should have:

- One built-in car selection to use consistently for regression checks
- One custom raster image for upload testing (`.png` preferred)
- One saved project JSON produced by Livery Lab for reload testing
- An iRacing customer ID placeholder to verify rename instructions during export

Optional:

- One PSD or TGA template file for custom-template import checks
- One very large image asset to sanity-check browser responsiveness
- One local iRacing `.tga` paint file if you want to validate the localhost car preview path outside the editor export flow

QA helper:

- `docs/QA/tools/open-iracing-local-tga-preview.bat` scans the folder you run it from, lets you choose a `.tga`, and opens the local iRacing preview URL with the selected full file path already inserted into `carCustPaint=`

---

## Recommended Regression Fixtures

Use these fixtures for architecture-slice regression checks so testers are exercising comparable feature flows.

| Fixture | Definition | Used For |
|---|---|---|
| Fixture A - Baseline 2048 working document | Start from bundled `Acura ARX06 GTP` at `2048x2048`. Add 10 brush strokes, 2 eraser passes, 1 fill, 1 rectangle, 1 text object, and 1 uploaded `1024x1024` PNG decal. Save this project locally as `qa-baseline-2048.json`. | Brush, fill, undo/redo, JSON load, PNG export, TGA export, viewport/export parity |
| Fixture B - Bundled PSD load | Hard refresh the app and load bundled `Acura ARX06 GTP` from the startup picker under normal HTTP hosting. | Startup flow, bundled template load, app-shell to editor synchronization |
| Fixture C - Blank shell flow | Hard refresh the app and use Start with blank white canvas without loading a bundled template. | App-shell state changes that must not depend on template/document loading |

### Current Setup Gaps

| Item | Why it matters | Required action before or during the next slice |
|---|---|---|
| No repo-owned `qa-baseline-2048.json` fixture exists yet | Save/load and export regression checks can drift if every tester invents a different project | The next slice touching document persistence, history, or export should attach the locally generated fixture details or add a canonical fixture artifact |
| Export parity is judged visually today | Viewport/export divergence can slip through during partial compositor work | Agent 05 slices must include an explicit viewport-vs-export functional comparison note for the edited feature set |

---

## QA Execution Rules

Use these rules so results are comparable across testers:

1. Start with a hard refresh before each new test pass.
2. Run the smoke section first. If smoke fails, stop and log the blocker before doing deeper regression.
3. Record the browser, OS, run mode, and exact steps for every failure.
4. Confirm both the visible result and the non-obvious side effects: layer list updates, selection state, undo/redo behavior, and toast/export messaging.
5. When a bug is fixed, rerun the exact failing steps and then rerun the related regression section.

### Required Test Output For Any Merge-Gate

Every merge-gate should leave behind a small, explicit note in the PR, handoff, or session log with:

- touched workstream or workstreams
- smoke result
- workstream checks rerun
- known temporary limitations accepted for this slice
- explicit merge decision: `pass`, `pass with documented limitation`, or `blocked`

---

## Test Pass Structure

### 1. Smoke Pass

Goal: confirm the app is usable at a high level in a few minutes.

Required checks:

- App loads without console-blocking failure
- Startup picker opens
- A bundled car can be loaded
- A mark can be painted on the canvas
- Undo and redo work once each
- Export modal opens and both PNG and TGA actions complete

### 2. Full Regression Pass

Goal: validate that all major editor workflows still work together.

Run the full checklist in [MANUAL-TEST-CHECKLIST.md](./MANUAL-TEST-CHECKLIST.md).

### 3. Targeted Retest

Goal: validate a specific bug fix without skipping related impact areas.

Always rerun:

- The exact reproduction steps for the bug
- The nearest adjacent workflow
- Undo/redo for that workflow
- Save/load or export if the changed feature can affect persisted output

### 4. Architecture Slice Validation Pass

Goal: gate partial migration merges with repeatable expectations tied to the touched workstream.

This pass is the repo's `merge-gate` for architecture work.

Required steps:

1. Identify which workstream owns the slice and whether it changes a shared contract.
2. Run the minimum merge checklist in [MANUAL-TEST-CHECKLIST.md](./MANUAL-TEST-CHECKLIST.md).
3. Rerun the workstream-specific checks from the regression map below.
4. Log any accepted transition-state limitation before merge; do not leave it implied in chat or PR comments only.

### 5. Merge-Gate Runbook

Use this runbook when someone says `run the merge-gate`.

#### Step 1 - Classify The Slice

Write down:

- which files changed
- which workstream owns them
- whether shared contracts changed
- which feature workflows are most likely to regress

Example classifications:

- `js/app.js` plus `js/core/app-store.js` changing modal or toolbar behavior: Agent 02
- `js/core/document/document-schema.js` plus project save/load behavior: Agent 03
- `js/core/history/**` or grouped undo changes: Agent 04
- `js/export.js` or compositor behavior: Agent 05
- `index.html`, `css/style.css`, and tool lifecycle UI wiring: Agent 06

#### Step 2 - Run Smoke First

Minimum smoke expectation:

- app loads
- startup picker opens
- bundled car loads
- one visible paint action works
- undo works once
- redo works once
- export modal opens
- PNG and TGA export both complete once

If Smoke fails, stop. The merge-gate is blocked until the failure is understood.

#### Step 3 - Run The Workstream Regression Checks

Use the regression map below.

- If the slice belongs to one workstream, run that row.
- If the slice spans multiple workstreams, run the union of all required checks.
- If a shared contract changed, include Agent 01 validation expectations even if Agent 01 did not edit code directly.

#### Step 4 - Check Documentation And Transition Risks

Before passing the merge-gate, verify:

- docs were updated if the slice changed contracts, persistence shape, or QA expectations
- any accepted temporary limitation is recorded outside chat
- there is no duplicated state owner left undocumented

#### Step 5 - Make A Merge Decision

Allowed outputs:

- `pass` — all required checks succeeded and no blocking risk remains
- `pass with documented limitation` — the slice is acceptable, but one temporary limitation is explicitly recorded and accepted
- `blocked` — a required check failed, a hotspot was changed without evidence, or a shared-contract/documentation gap remains open

### 6. Current Merge-Gate Recommendation

For the current repo state, the next merge-gate should explicitly cover:

1. Export modal state and export-size behavior.
2. Project save/load using `EditorDocument v1`, including legacy migration load.
3. Grouped selected-object nudge undo/redo behavior.
4. Workspace-state-driven toolbar and layers-panel rendering.

If those pass, the next recommended implementation move is the narrow Agent 05 compositor/export slice.

---

## Workstream Regression Map

Each active workstream must satisfy the checks below before merge. If a slice spans multiple workstreams, run the union of their required checks.

| Workstream | Main regression risk | Required validation before merge | Merge is blocked when |
|---|---|---|---|
| Agent 01 - Foundation And Contracts | Contract drift between shell, document, history, render, and tool work | Confirm shared terminology and ownership rules are updated in the planning docs; if runtime files changed, rerun smoke plus each downstream workstream check affected by the contract change | A shared contract changed but the owning docs and dependent workstream expectations were not updated in the same slice |
| Agent 02 - App Shell And State Boundary | Toolbar, modal, picker, recent-car, and export-size UI desync from actual state | Run Smoke, Template picker, Blank/custom start, Export modal, and Browser/run-mode edge cases; confirm active tool state, selected car label, recent cars, and export-size selection stay aligned across reload and template load | The shell shows stale state, duplicate state sources remain undocumented, or console errors appear during normal shell flows |
| Agent 03 - Document Model And Persistence | Save/load incompatibility, missing schema migration, or document/editor ownership confusion | Run Blank/custom start, Template picker bundled load, Layers panel, Save and load project JSON, Undo/redo after load, and one export after reload; verify schema versioning or migration notes are documented | A document-facing change lands without a schema/migration note, or restored projects lose editability, selection, or exportability |
| Agent 04 - History And Commands | Broken undo grouping, duplicate history entries, redo corruption, or transition clashes with snapshot history | Run Undo and Redo Regression, then targeted checks for brush, fill, layer visibility toggle, layer opacity change, object move, and template/document load boundaries; verify a new action clears redo as expected | Undo/redo order changes unexpectedly, redo stack survives when it should clear, or partial command history and snapshot history double-record the same action |
| Agent 05 - Render And Export Pipeline | Viewport/export mismatch or export path regressions | Run Brush, Eraser, Fill, Export PNG 1024/2048, Export TGA 1024/2048, and Output validation; explicitly compare visible canvas output against exported files for the touched feature set | Exported output no longer matches the visible canvas for supported features |
| Agent 06 - Tools And Workspace UI | Tool lifecycle regressions, inspector drift, layer-panel mismatch, or hidden interaction changes | Run Canvas navigation and selection, all entries in Paint and Shape Tools, Layers panel, Layout and responsiveness, plus shortcut checks for `V`, `B`, `E`, `F`, `R`, `C`, `L`, `G`, and `T` where applicable | A tool switch leaves the editor in an ambiguous mode, inspector/layer state lags behind the canvas, or hidden layers become interactive again |
| Agent 07 - QA, Cutover, And Integration | Validation drift, undocumented temporary states, or merge decisions depending on chat memory | Update this QA plan and the manual checklist when expectations change; verify the transition-state risk table and cutover criteria still match the current slice order; confirm every merge records what was rerun and what remains transitional | A slice changes validation expectations without updating the source-of-truth docs, or accepted temporary risks exist only in chat/PR discussion |

---

## Transition-State Risk Tracking

Track temporary migration states here until the relevant cutover is complete.

| Risk | Likely source | Detection signal | Required response |
|---|---|---|---|
| Shell state and document state both claim ownership of the same field | Agent 02 and Agent 03 overlap during adapters | Toolbar/top bar/export modal disagree after template load or reload | Do not merge until a single owner or explicit adapter rule is documented |
| Snapshot history and transaction history both record one user action | Agent 04 transition slice | One user action requires multiple undo steps or redo restores the wrong intermediate state | Block merge until the duplicated history path is removed or clearly guarded |
| Export uses a different composition path than the viewport for a migrated feature | Agent 05 transition slice | Canvas looks correct but exported PNG/TGA differs for the same layer stack | Keep the old export path or old viewport path behind an adapter until parity evidence exists |
| Tool controllers move state without updating shell or document subscribers | Agent 06 overlap with Agent 02 or Agent 03 | Active tool indicator, inspector values, or selected layer stop tracking the actual interaction state | Block merge until the missing subscription/update path is restored |
| Shared contract naming changes without downstream adoption | Agent 01 overlap with any implementation slice | Event names, state keys, or operation names differ between docs and code | Update the contract docs and all touched downstream call sites in the same slice |

---

## Final Combined Cutover Criteria

Do not treat the architecture migration as cut over until all of the following are true:

1. The active workstream regression checks have passed for the final combined slice.
2. The full checklist in [MANUAL-TEST-CHECKLIST.md](./MANUAL-TEST-CHECKLIST.md) passes in at least one primary Windows browser.
3. No temporary transition-state risk in the table above remains open without an explicit owner, scope, and follow-up slice.
4. Save/load of the canonical baseline project still produces an editable document and successful PNG/TGA exports.
5. Viewport and export output match for the supported migrated feature set.
6. Shared contract docs, QA docs, and workstream plans agree on the current source of truth.

## Current Persistence Contract Notes

- Project saves now use `EditorDocument v1` with top-level `schema`, `kind`, and `version` fields.
- `layers[]`, `artboard`, `car`, and `template` are the document-facing persisted fields for the first slice.
- Selection and viewport ownership are now defined as document-owned session state, but they are intentionally excluded from the persisted v1 file.
- Runtime restore still depends on the transitional `bridge.fabricCanvas` payload until later history/render slices stop using Fabric scene JSON directly.
- The first Agent 04 history slice groups repeated selected-object nudges into one explicit `document.object.transform.set` transaction, but snapshot restore remains the canonical undo/redo mechanism underneath that grouped boundary.
- Legacy project JSON without `schema` metadata must still load through the migration adapter and remain exportable.

---

## Exit Criteria For Team Signoff

The current QA cycle should be considered ready for signoff when all of the following are true:

- No blocker or high-severity issues remain open
- Smoke pass succeeds in all required browsers
- Full regression pass succeeds in at least one primary Windows browser
- Export instructions and downloaded files are correct for both PNG and TGA
- Save/load JSON round-trips without losing key editable content in the tested scenarios
- Any known issues are documented with scope and workaround

---

## Severity Guide

Use this severity model when filing issues:

| Severity | Meaning |
|---|---|
| Blocker | App does not load, crashes, or prevents all meaningful painting/export work |
| High | Core workflow broken: cannot paint, select, save/load, or export reliably |
| Medium | Feature works incorrectly or inconsistently, but a workaround exists |
| Low | Minor visual issue, copy issue, or non-blocking usability problem |

---

## Bug Report Template

Use this format for each issue:

```text
Title:
Environment: OS / browser / run mode
Build: v0.1.2
Area: startup picker / canvas tools / layers / export / save-load / layout
Severity: blocker / high / medium / low

Steps to reproduce:
1.
2.
3.

Expected result:

Actual result:

Frequency: always / intermittent / once
Regression: yes / no / unknown
Artifacts: screenshot, screen recording, exported file, sample JSON
Notes:
```

---

## Known QA Risks To Watch Closely

These areas are historically worth extra attention during manual testing:

- Selection behavior after switching tools repeatedly
- App-shell state sync after internal tool changes, template loads, and export-size changes so the toolbar, top bar, and export modal never disagree
- Export modal state is driven by the dispatcher/store seam for the migrated flow, so open-close behavior and the selected export size stay aligned through dispatched shell intents
- Hidden layers accidentally affecting clicks or selection
- Undo/redo after raster-style edits such as brush, eraser, and fill
- Save/load preserving layer state and selection-friendly behavior
- Export folder hints matching the selected bundled car
- Bundled-template loading differences between HTTP and `file://` usage

---

## Suggested QA Session Cadence

For a normal pre-release pass:

1. Run smoke pass in Chrome.
2. Run full regression in Edge.
3. Spot-check layout and startup flow in a second environment.
4. Triage findings by severity.
5. After fixes land, run targeted retest plus smoke again.

This keeps the first QA cycle focused and prevents the team from spending time on deep exploratory testing before the core workflow is stable.