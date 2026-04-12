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

If Slice3 brush-fix QA passed in Chrome and Edge and you have just widened the live viewport-base cutover to supported committed mixed-content documents, the recommended next step is:

1. Re-run the render/export merge-gate with explicit brush and eraser checks at the artboard edge and on a smaller or offset or axis-aligned resized image-backed layer, one supported mounted-base brush or eraser live free-draw check, one rotated or skewed or otherwise unsupported free-draw fallback check, one non-1.0 zoom check of `editor.getViewportBaseRenderState()` on a supported committed mixed-content document, one caller-supplied canvas reuse check, and one live viewport-vs-export parity note for the mounted base canvas.
2. Confirm one supported brush or eraser live free-draw interaction keeps the mounted shared base active while the live stroke preview stays above it on a qualifying translated or axis-aligned resized image-backed raster target, confirm one supported single-object select transform keeps the mounted shared base active while only the transformed object renders above it, confirm one supported single-object keyboard nudge burst keeps the mounted shared base active while only the nudged object renders live above it, confirm immediately clicking a different object after that supported nudge burst tears down the temporary keyboard overlay cleanly, confirm one unsupported keyboard nudge case still temporarily falls back to the normal Fabric scene and then resumes the mounted shared base cleanly, confirm one committed text edit suspends the mounted base only while editing is active and then resumes the shared path after editing exits, and confirm one transient shape or gradient preview drag plus cancel or commit keeps the mounted shared base active while one committed supported shape stays on the shared path after commit.
3. Keep unsupported committed content on the current fallback boundary while this live cutover slice stays narrow.

Current targeted execution pack:

- Use [Tests/Slice3-Brush-Fix-Verification/Chrome/MANUAL-TEST-CHECKLIST.md](Tests/Slice3-Brush-Fix-Verification/Chrome/MANUAL-TEST-CHECKLIST.md) and [Tests/Slice3-Brush-Fix-Verification/Edge/MANUAL-TEST-CHECKLIST.md](Tests/Slice3-Brush-Fix-Verification/Edge/MANUAL-TEST-CHECKLIST.md) for the current Windows post-fix verification pass.
- Keep [Tests/Slice2-Brush-Regression/Chrome/MANUAL-TEST-CHECKLIST.md](Tests/Slice2-Brush-Regression/Chrome/MANUAL-TEST-CHECKLIST.md) and [Tests/Slice2-Brush-Regression/Edge/MANUAL-TEST-CHECKLIST.md](Tests/Slice2-Brush-Regression/Edge/MANUAL-TEST-CHECKLIST.md) as the blocked pre-fix baseline evidence.
- The current verification pack intentionally stays narrow to recorded committed brush or eraser durability and alignment retests plus one unsupported rotated or skewed fallback sanity check, nearby translate-drag and template-opacity retests, and one save/load plus export sanity pass; the newer mounted live free-draw checks inside those packs remain explicit open follow-up items rather than recorded pass evidence.
- The live viewport-base cutover follow-up is not closed by Slice3 alone; record the mounted-base parity note, the `editor.getViewportBaseRenderState()` zoom and caller-supplied-canvas checks, the supported single-object transform plus shape or gradient preview mounted-base note, and the remaining keyboard or text or unsupported fallback note in the render/export merge-gate evidence before treating this slice as validation-closed.

That recommendation exists because the repo has now validated the current committed-raster parity seam, moved active-layer fill onto the shared in-place commit path, and then reduced brush/eraser merge cost further by cropping the supported dirty region instead of rasterizing a full-artboard stroke for every supported image-backed commit.

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
| Export parity is judged visually today | Viewport/export divergence can slip through during partial compositor work | Render/export slices must include an explicit viewport-vs-export functional comparison note for the edited feature set |
| Unsupported committed content and unsupported committed blend cases still use the legacy scene path | Render/export slices can look complete if testers only use the currently supported committed mixed-content set and supported blend combinations | Render/export slices must include one unsupported-content fallback check plus one unsupported-blend fallback check until the next committed content or blend cases move onto the shared path |

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

- `js/app.js` plus `js/core/app-store.js` changing modal or toolbar behavior: app shell
- `js/core/document/document-schema.js` plus project save/load behavior: document model
- `js/core/history/**` or grouped undo changes: history module
- `js/export.js` or compositor behavior: render/export
- `index.html`, `js/ui/workspace-ui-controller.js`, `css/style.css`, and tool lifecycle UI wiring: workspace UI

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
- If a shared contract changed, include foundation contract validation expectations even if no contract-owning files were edited directly.

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

### 6. Render/Export Required Evidence Pack

Use this section whenever the slice touches `js/export.js`, render/compositor behavior, or render/export-facing seams in `js/editor.js`.

Primary checklist source:

- Current render/export validation closure checklist within this QA plan.

Required check groups for this pack:

1. Parity checks: supported committed mixed-content viewport output must match PNG/TGA exports for touched scenarios.
2. Fallback checks: at least one unsupported committed-content or unsupported committed-blend case must be recorded as intentional fallback behavior.
3. Live overlay checks: where applicable, mounted-base behavior must be verified for supported single-object interactions, plus one unsupported interaction that suspends/falls back and resumes cleanly.
4. Helper checks: non-1.0 zoom `editor.getViewportBaseRenderState()` behavior and caller-supplied canvas reuse must be evidenced.
5. Export fallback messaging checks: at least one unsupported export run must capture the surfaced fallback reason text (and unsupported-layer count when present) from the export warning path.

Execution lanes for this pack:

- Local now (preflight only): verify checklist rows are present, each row has an artifact placeholder target, and unsupported fallback rows are still labeled as fallback boundaries rather than parity support.
- Human browser required: all parity, fallback behavior, live-overlay behavior, export-file comparisons, and save/load durability checks.
- Hybrid: helper checks that include debug output capture plus visible browser behavior confirmation.

#### Render/Export Pass Outcome Rules

- `local preflight complete` is not a final merge result; it only means the evidence pack is ready to run.
- `pass`: all required render/export check groups above are evidenced and meet expected behavior.
- `pass with documented limitation`: required supported-path parity and helper checks pass, and the only remaining limitations are intentional, documented fallback boundaries.
- `blocked`: missing evidence for required supported-path checks, parity mismatch for supported scenarios, or undocumented fallback behavior.

#### Render/Export Scenario Matrix (Scenario -> Expected Result -> Evidence)

| Scenario | Validation lane | Expected result | Evidence artifact | Result status |
|---|---|---|---|---|
| Supported committed mixed-content parity check | Human browser required | Viewport committed output matches exported PNG and TGA for the same state. | Screenshot pair + exported PNG/TGA filenames | Pending |
| Policy-driven exclusion check (template/guide/spec-map) | Human browser required | Inclusion/exclusion rules match current policy for viewport/export validation runs. | Short policy note + screenshot/export references | Pending |
| Strict lane check (edge stroke + smaller/offset/resized alignment) | Human browser required | Supported strict shared-surface cases render correctly and match export output. | Before/after screenshots + export artifact names | Pending |
| Commit-only lane check (transformed + axis-aligned `multiply` or `screen`) | Human browser required | Cases stay on documented commit-only lane and still match export output. | Step note with lane expectation + parity artifacts | Pending |
| Unsupported fallback check | Human browser required | Unsupported case falls back intentionally and is recorded as fallback, not parity support. | Fallback note + screenshot | Pending |
| Export fallback reason visibility check | Human browser required | Unsupported export surfaces the expected fallback reason text (and unsupported-layer count when available). | Fallback warning screenshot or step log | Pending |
| Mounted-base live overlay check | Human browser required | Supported live overlay cases stay mounted; unsupported case suspends/falls back then resumes cleanly. | Short recording reference or detailed step log | Pending |
| Non-1.0 zoom + caller-supplied canvas reuse check | Hybrid | Helper output is supported at current zoom and reused canvas does not leak stale state across draws. | Debug output note + two reuse artifacts | Pending |

### 7. Current Merge-Gate Recommendation

For the current repo state, the next merge-gate should explicitly cover:

1. Export modal state and export-size behavior.
2. Project save/load using `EditorDocument v1`, including legacy migration load, one live-mirror sanity check for artboard or template or car metadata plus ordered layer ids and session anchors after load, and one save/load roundtrip after a supported committed-raster brush, eraser, or fill edit.
3. Grouped selected-object nudge undo/redo behavior plus targeted replay validation for `document.object.properties.set`, `document.object.transform.set`, deterministic `document.layer.add`, narrow single-layer `document.layer.remove`, `document.layer.visibility.set`, `document.layer.opacity.set`, `document.layer.order.set`, `document.template.opacity.set`, and the current documented paint subset: shared-surface existing-layer `document.stroke.commit`, existing-layer `shared-surface-commit-only` `document.stroke.commit`, existing paint-layer `document.fill.apply` on either the strict cropped or broader commit-only existing-raster lane, the retained-object `layer-id` retained-raster `document.fill.apply` subset on either lane, the narrow retained non-raster retained-object `document.fill.apply` helper subset for supported fillable objects, and deterministic no-active-layer auto-create fill structure. Also rerun one supported retained text fill replay case, one supported retained gradient-backed rectangle/ellipse/circle replay case when available, one commit-only retained-raster fill replay case, one unsupported retained non-raster fill case, and one legacy-fallback or unsupported or ambiguous paint case to confirm the unsupported cases still stay on the fallback lane, plus one async paint barrier retest on a known awaited stroke or fill path and one rapid repeated undo/redo attempt while an async paint replay-backed restore is still settling.
4. Workspace-state-driven toolbar, layers-panel rendering, and basic inspector visibility or hydration, plus store-backed Properties/Layers panel collapse flags.
	Include one pass that specifically exercises the extracted `js/ui/workspace-ui-controller.js` path by toggling panel headers, editing one right-panel property, and using one layer-row action before and after a project-load success or rollback.
5. Render/export validation checks from Section 6, including parity, fallback, and live-overlay validation evidence for the current supported committed mixed-content boundary.

If those pass, the next recommended implementation move is the next narrow render/export slice that widens the supported committed-content set again or reduces one of the remaining suspend or fallback boundaries.

---

## Workstream Regression Map

Each active workstream must satisfy the checks below before merge. If a slice spans multiple workstreams, run the union of their required checks.

| Workstream | Main regression risk | Required validation before merge | Merge is blocked when |
|---|---|---|---|
| Foundation And Contracts | Contract drift between shell, document, history, render, and tool work | Confirm shared terminology and ownership rules are updated in the planning docs; if runtime files changed, rerun smoke plus each downstream workstream check affected by the contract change | A shared contract changed but the owning docs and dependent workstream expectations were not updated in the same slice |
| App Shell And State Boundary | Toolbar, modal, picker, recent-car, export-size, selected-car shell projection, active-tool shell state, or Properties/Layers panel shell state UI desync from actual state | Run Smoke, Template picker, Blank/custom start, Export modal, Project load, Tool shortcuts, Layers panel, and Browser/run-mode edge cases; confirm active tool state, one-shot tool return-to-select behavior, selected car label, export-folder hint, recent cars, export-size selection, and Properties/Layers panel collapse-open behavior stay aligned across reload, blank start, custom template load, bundled template load, project load, toolbar clicks, keyboard shortcuts, repeated panel toggles, and browser-local hydration of export size plus panel flags without leaking into project load or history | The shell shows stale state, duplicate state sources remain undocumented, one-shot tools leave the toolbar in the wrong mode, panel headers/body visibility drift apart, shell-only preferences appear inside project persistence or history, or console errors appear during normal shell flows |
| Document Model And Persistence | Save/load incompatibility, missing schema migration, mirror drift, or document/editor ownership confusion | Run Blank/custom start, Template picker bundled load, Layers panel, Save and load project JSON, Undo/redo after load, and one export after reload; verify schema versioning or migration notes are documented, verify `editor.getLiveDocumentMirror()` reflects artboard or template or car metadata plus ordered layer ids after load, verify the layer panel still matches document order after undo or redo and reload, verify downstream load consumers such as the top-bar car label plus template/background controls also reflect the restored document metadata after load, load one deliberately drifted v1 project JSON copy whose top-level `layers[]` order does not match `bridge.fabricCanvas` so the restored document plus layer panel can be confirmed to follow the bridge payload order and a fresh save can be confirmed to rewrite `layers[]` back to that restored order, and force one failed project-load attempt while a good document is already open so the previous car or template or background metadata plus live mirror state can be confirmed to survive the rollback | A document-facing change lands without a schema/migration note, the live mirror drifts from restored document metadata, downstream load consumers keep stale metadata after a restore, a save after drifted project load preserves stale `layers[]` metadata instead of rewriting it to the restored order, a failed project-load rollback leaves stale mirror metadata behind, or restored projects lose editability, selection, or exportability |
| History And Commands | Broken undo grouping, duplicate history entries, redo corruption, or transition clashes with snapshot history | Run Undo and Redo Regression, then targeted checks for committed Brush/Eraser on the strict replay-safe shared-surface path, on the replay-backed existing-raster `shared-surface-commit-only` path, and on the legacy fallback path, retained-target fill, active paint-layer fill, no-active-layer auto-create fill, upload image one-step undo/redo, duplicate selected one-step undo/redo including retained +30/+30 offset and selected state on redo, one-click text insertion with immediate editing plus one-step undo/redo and selected-state restore on redo, one committed rect or circle or line or gradient preview finalize with one-step undo/redo and selected-state restore on redo, layer visibility toggle including hide-selected-layer clearing and one-step undo, template-opacity slider live preview plus one-step undo or redo with template and guide overlays staying in sync, narrow layer delete from the panel and from single-selection `Delete` or `Backspace` including selection clearing and active paint-layer fallback, bring-forward/send-backward reorder including one-step undo/redo, layer opacity change including the projected-id selected-row slider path, projected-id selected-object primary/secondary colour plus selected-object opacity and stroke-width drag checks and font family/font size discrete checks, and single-object select-mode pointer transforms for keyboard nudge, translate drag, scale, resize, rotate, skew, flip, and one mixed transform, then verify one multi-select or group transform still stays on the fallback path without double-recording through the explicit seam, plus template/document load boundaries; confirm `editor.getHistoryDebugState()` shows `document.stroke.commit` for one committed Brush or Eraser action with stable `targetLayerId` plus invalidation metadata, confirm undo after that stroke or erase returns to the exact pre-action canvas state with no stray standalone Fabric path restored and redo brings back only the committed raster result, confirm `document.fill.apply` appears for one retained-target fill, one active paint-layer fill, and one no-active-layer auto-create fill with stable target ids plus invalidation metadata, confirm the auto-create fill entry carries `createdTargetLayer` metadata and that no adjacent `document.layer.add` entry was recorded for the same action, confirm undo after that auto-create fill removes the created layer entirely and redo restores it cleanly, confirm one opacity-0 or equivalent no-op auto-create fill leaves no extra blank layer behind and preserves the prior retained-target and active paint-layer routing state, confirm the new targeted replay paint boundary stays narrow by restoring shared-surface existing-layer Brush/Eraser, existing-layer `shared-surface-commit-only` Brush/Eraser, existing paint-layer Fill on both the strict and commit-only existing-raster lanes, the retained-object `layer-id` retained-raster fill subset on both lanes, the narrow retained non-raster retained-object helper subset, and deterministic auto-create fill in one step while unsupported retained fill states, legacy-fallback paint commits, unsupported committed blend/content raster targets, created-target-layer commit-only paint, and other ambiguous paint cases still fall back cleanly, confirm one targeted replay family can commit with `selectedObjectId: null`, then after a later transient object selection undo and redo still clear the visible selection; immediately switch to `Fill`, click inside that same later object, and confirm the fill does not treat it as a retained selected-object target unless you explicitly reselect it first, confirm one known awaited legacy fallback stroke or fill path refuses an immediate undo or redo or document-boundary action until the paint transaction settles, confirm one replay-backed Brush or Eraser or active paint-layer Fill undo/redo path ignores a second rapid undo/redo request until the first async replay settles instead of reordering the history traversal, confirm blocked bundled or custom template or PSD load attempts leave the current document and shell projection unchanged while keeping the template modal open until the action is retried after the paint commit settles, confirm blocked project-load attempts preserve a retry path after the paint commit settles instead of consuming the chosen file handoff, confirm blocked upload-image or duplicate-selected attempts do not appear later as deferred inserts after the paint commit settles, confirm blocked layer-opacity or template-opacity slider drags resync the control back to the actual document value instead of leaving stale local UI state, confirm blocked selected-object Properties writes also resync the projected control back to the actual selected-object value instead of leaking into the no-selection defaults path, confirm template-opacity commits appear as `document.template.opacity.set` with reversible semantics and no duplicate adjacent entry for one slider drag, confirm selected-object Properties commits appear as `document.object.properties.set` with the expected property key and no duplicate adjacent entry for one drag-style inspector interaction, confirm `editor.getHistoryDebugState()` shows a latest committed `document.layer.add` entry with inserted layer id, insert index, `upload-image`, `duplicate-selected`, `text-insert`, `rect-preview-finalize`, `circle-preview-finalize`, `line-preview-finalize`, or `gradient-preview-finalize` source, and after-selection anchors that match the inserted layer after the standalone insert checks, confirm translate-only pointer drags still report `mode: 'pointer-move'`, confirm non-translate single-object pointer transforms report `mode: 'pointer-transform'` plus `kind` and `transformKinds`, and confirm each explicit pointer-transform check still lands as one undo unit with redo clearing after a divergent action; before custom non-PSD template load, project load, and any full-document PSD load create redoable state, cross the boundary, confirm redo is cleared, confirm both one same-size custom non-PSD upload and one different-size custom non-PSD upload record exactly one latest committed `document.template.load` entry with `checkpoint-only` plus `import-load`, confirm the different-size variant does not double-record a separate resize boundary, and run one PNG or TGA export sanity pass after each boundary | Undo/redo order changes unexpectedly, redo stack survives when it should clear, stroke/fill target ids or invalidation metadata are missing or double-recorded, undo after Brush or Eraser restores a stray transient path instead of the true pre-action canvas state, retained-target fill falls through to a different target, blank-layer auto-create fill fails to record as the explicit fill transaction, leaves a stray empty layer on abort or no-op or error, clears the prior retained-target or active paint-layer routing state on a no-op cleanup, or double-records a second `document.layer.add` entry, the new paint replay branch widens beyond the documented shared-surface plus current existing-raster commit-only subset or fails to restore the supported subset, rapid repeated undo/redo can still race one promise-backed paint replay settle/fallback path, layer-add metadata or selection anchors are missing or double-recorded, template-opacity commits double-record or leave template and guide overlays out of sync, targeted replay preserves a later transient selection or still lets `Fill` target that later object when the committed entry anchor was `null`, selected-object Properties writes bypass the projected target, leak into the no-selection defaults path during a blocked paint barrier, or spam adjacent history entries for one drag, blocked template or PSD or custom template load attempts mutate shell state even though the document stayed unchanged or close the retry modal prematurely, blocked project-load attempts consume the chosen file handoff even though the boundary was refused, blocked upload-image or duplicate-selected attempts appear later as deferred inserts, blocked slider changes leave stale local UI values behind, single-object pointer-transform behavior or metadata regresses in undo or redo, multi-select or group transforms accidentally route through the explicit seam, checkpoint-only boundary entries are missing or mislabeled in debug state, a later undo or document-boundary action can still cross an unfinished async paint commit, a custom non-PSD template load or full-document PSD load crosses history boundaries incorrectly, or partial command history and snapshot history double-record the same action |
| Render And Export Pipeline | Viewport/export mismatch or export path regressions | Run Brush, Eraser, Fill, Export PNG 1024/2048, Export TGA 1024/2048, Output validation, and one save/load roundtrip after a supported committed mixed-content edit; explicitly compare visible canvas output against exported files for the touched feature set, including one artboard-edge stroke check, one smaller or offset or axis-aligned resized image-layer alignment check, one supported selected image-backed raster retained fill check on the shared-surface path, and one unsupported retained raster fallback note; for the current live viewport-base cutover slice, at one non-1.0 zoom confirm `editor.getViewportBaseRenderState()` returns a supported compositor canvas plus current-zoom target dimensions for a supported committed mixed-content document, confirm the mounted shared base visibly replaces the lower-canvas committed scene on that supported document, confirm one supported single-object select transform keeps the mounted shared base active while only the transformed object renders above it, confirm one supported single-object keyboard nudge burst keeps the mounted shared base active while only the nudged object renders live above it, confirm immediately clicking a different object after that supported nudge burst tears down the temporary keyboard overlay cleanly, confirm one unsupported keyboard nudge case still temporarily falls back to the normal Fabric scene and then resumes the mounted shared base, confirm one committed text edit keeps the editor on the normal Fabric scene only while editing is active and then resumes the shared base after editing exits, confirm one transient shape or gradient preview drag plus cancel or commit keeps the mounted shared base active while one committed supported shape stays on the shared path after commit, confirm one transaction-backed layer mutation such as visibility or reorder resyncs the mounted base after commit, confirm one unsupported committed content document still returns unsupported, and confirm rendering into the same caller-supplied canvas twice does not inherit stale transform or blend state between draws | Exported output no longer matches the visible canvas for supported features |
| Tools And Workspace UI | Tool lifecycle regressions, inspector drift, layer-panel mismatch, or hidden interaction changes | Run Canvas navigation and selection, all entries in Paint and Shape Tools, Layers panel, Layout and responsiveness, plus shortcut checks for `V`, `B`, `E`, `F`, `R`, `C`, `L`, `G`, and `T` where applicable; for the current brush/eraser controller seam, confirm toolbar and shortcut entry still pick the same active paint layer, supported live free-draw still starts and ends through the same mounted-base path, unsupported transformed free-draw still falls back cleanly, and committed Brush/Eraser still land through one stroke commit without leaving a standalone Fabric path behind; for the current extracted fill controller seam, confirm retained selected-object fill, active-layer raster fill, and blank-layer fallback still behave the same after toolbar and shortcut entry; for the current shape and gradient controller seam, confirm rect, circle, line, and gradient preview still track correctly in every direction, switching tools before mouse-up clears the preview without committing a layer, pointer-up now commits exactly one layer through the controller-owned finalize entry, the toolbar returns to `Select`, and one-step undo or redo plus save or load or export behavior remain unchanged; for the current text controller seam, confirm one click inserts exactly one text layer through the controller-owned insert entry, editing starts immediately, the toolbar returns to `Select`, and one-step undo or redo plus save or load or export behavior remain unchanged; for the current workspace-projection and `js/ui/workspace-ui-controller.js` seam, confirm selecting text, line, gradient, rectangle, and circle objects from both the canvas and the layers panel keeps the same properties groups visible as before, confirm projected primary or secondary colour plus font and text-size values hydrate the controls correctly, confirm the main Properties handlers for primary colour, secondary colour, selected-object opacity, stroke width, font family, and font size now prefer the editor-owned projected-id inspector actions when one selected projected object exists and still fall back to the existing no-selection defaults path when nothing is selected, confirm `getWorkspaceState().actions` keeps the duplicate/delete/reorder button availability aligned with the real selected projected target, confirm the selected-layer opacity slider plus row-level visibility/delete affordances also disable in sync with that same busy-aware capability state during one awaited legacy fallback Brush/Fill commit, confirm row-level select or visibility or delete affordances now render from projected row-action flags instead of panel-order assumptions, confirm layer-row clicks now resolve through one projected layer id instead of panel order, confirm layer-row visibility and delete buttons now mutate the clicked projected row instead of a visual-index neighbour even when nearby rows are hidden or protected, confirm panel header toggles plus right-panel property inputs and object-action buttons still respond before and after a project-load success or failed rollback without needing the panel to be reopened, confirm the duplicate button and selected-layer opacity slider now prefer the editor-owned projected-id actions when one selected workspace row id is available, confirm the right-panel delete button and `Delete` or `Backspace` now prefer the projected-id delete seam when one selected workspace row id is available, confirm those controls still affect that same selected projected row after panel selection, confirm one-shot tool return-to-select plus successful project load and failed project-load rollback all leave the right-panel controls and projected values aligned with the restored workspace snapshot, confirm selecting from the panel during paint or one-shot tools still returns to `Select`, confirm guide/spec/template/hidden/locked rows remain non-selectable or otherwise editor-gated as before, and confirm the existing bring-forward/send-backward controls still reorder the selected projected row through the editor-owned id seam while the layer-opacity slider follows the selected editable layer but resets when the selection is cleared or points at guide/spec/template content without turning row selection into persistence or its own undo step | A tool switch leaves the editor in an ambiguous mode, inspector or layer state lags behind the canvas, hidden layers become interactive again, brush or eraser controller entry changes active-layer targeting or leaves free-draw teardown in the wrong state, fill target ownership changes unexpectedly, the workspace projection drifts from the actual selection or layer rows, the extracted workspace UI controller drops panel-event wiring or callback resync after load or rollback, panel row order still changes selection or row-button mutation meaning, projected action-capability state or row-action flags stop matching the real selected target or the active async paint barrier, panel row clicks create undoable or persisted selection state, the main Properties handlers or the duplicate/delete buttons or the selected-layer opacity slider still bypass the projected-id editor seam when a workspace target is available, successful or failed project load leaves stale right-panel action state behind, or shape, gradient, or text insert lifecycle drifts from the committed result |
| QA, Cutover, And Integration | Validation drift, undocumented temporary states, or merge decisions depending on chat memory | Update this QA plan and the manual checklist when expectations change; verify the transition-state risk table and cutover criteria still match the current slice order; confirm every merge records what was rerun and what remains transitional | A slice changes validation expectations without updating the source-of-truth docs, or accepted temporary risks exist only in chat/PR discussion |

Current render/export boundary note:

- The shared compositor path currently applies to committed image-backed raster layers with `source-over`, `destination-out`, `multiply`, or `screen`, plus committed `text-layer`, `shape-rect`, `shape-ellipse`, and `shape-line` records that stay inside their narrower documented supported blend modes.
- Supported retained-target fill now resolves one existing selected image-backed raster layer through that same stable layer-id/shared-surface ownership seam either on the strict cropped replay-safe boundary or on the broader full-source `shared-surface-commit-only` lane for transformed targets plus committed image-backed `destination-out`, `multiply`, and `screen` cases; retained non-raster fills and unsupported committed blend/content cases still stay on their existing retained-object or legacy lanes.
- Supported brush and eraser commits now crop a padded artboard dirty rect and patch only the intersected target-local surface region on that shared seam for translated plus axis-aligned resized image-backed layers when the committed target blend stays on the replay-safe `source-over` or `destination-out` subset, then fall through to the broader full-source `shared-surface-commit-only` lane for transformed existing raster targets plus committed image-backed `multiply` or `screen` cases, so render/export validation must now cover both the strict cropped lane and one transformed plus one axis-aligned supported-blend commit-only note while keeping unsupported committed blend/content cases on the documented fallback path.
- Template, guide, and spec-map inclusion is policy-driven and must be verified explicitly during render/export validation.
- Viewport parity snapshots for this slice cover committed content only, do not include transient tool previews, and are only expected for the currently supported committed mixed-content documents.
- The mounted viewport-base path now uses that same committed-content boundary, defaults to current-zoom target dimensions, returns composed committed layer ids, can reuse a caller-supplied canvas, and normalizes reused 2D canvas state before composition; validation should confirm that supported committed mixed-content documents expose that state, visibly bypass the lower-canvas committed scene, stay mounted during supported single-object select transforms, supported single-object keyboard nudge bursts, and immediate reselection after those supported nudge bursts, plus rect/circle/line and gradient preview flows through the isolated live-object overlay, resync after transaction-backed mutations, and still fall back for unsupported keyboard targets, active text editing, multi-select or group transforms, unsupported live cases, non-`source-over` live-overlay targets, and live Brush or Eraser free-draw on committed `multiply` or `screen` raster targets instead of claiming broader shared-preview ownership.
- Unsupported committed content types or unsupported committed blend cases outside the current image-backed `source-over` or `destination-out` or `multiply` or `screen` subset, plus any non-`source-over` committed text or shape blend, still fall back intentionally to the legacy scene path until a later slice expands shared support further.

---

## Transition-State Risk Tracking

Track temporary migration states here until the relevant cutover is complete.

| Risk | Likely source | Detection signal | Required response |
|---|---|---|---|
| Shell state and document state both claim ownership of the same field | App-shell and document-state overlap during adapters | Toolbar/top bar/export modal disagree after template load or reload | Do not merge until a single owner or explicit adapter rule is documented |
| Snapshot history and transaction history both record one user action | History transition slice | One user action requires multiple undo steps or redo restores the wrong intermediate state | Block merge until the duplicated history path is removed or clearly guarded |
| Export uses a different composition path than the viewport for a migrated feature | Render/export transition slice | Canvas looks correct but exported PNG/TGA differs for the same layer stack | Keep the old export path or old viewport path behind an adapter until parity evidence exists |
| Tool controllers move state without updating shell or document subscribers | Workspace UI overlap with app-shell or document state | Active tool indicator, inspector values, or selected layer stop tracking the actual interaction state | Block merge until the missing subscription/update path is restored |
| A controller extraction changes which object or layer fill commits target | Workspace UI overlap with the existing editor-owned fill adapter | Retained selected-object fill no longer stays on the same object, active-layer raster fill hits the wrong layer, or blank-layer fallback stops appearing when no active layer exists | Block merge until the controller delegates back to the existing editor fill adapter without changing targeting rules |
| Layer-row selection or row-button writes still depend on visual order instead of projected identity | Workspace projection overlap | Reordering the rendered panel rows or encountering hidden or protected rows changes which object the row click, visibility toggle, or delete action affects | Block merge until the row click and current row-button writes resolve through the projected layer id and protected rows remain editor-gated as documented |
| Shared contract naming changes without downstream adoption | Contract baseline overlap with any implementation slice | Event names, state keys, or operation names differ between docs and code | Update the contract docs and all touched downstream call sites in the same slice |

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
- Browser-local shell preferences such as export size and Properties/Layers panel collapse flags remain app-shell-only state, hydrate through localStorage, and must not appear in project JSON or undo/redo history.
- Runtime restore still depends on the transitional `bridge.fabricCanvas` payload until later history/render slices stop using Fabric scene JSON directly.
- The first history module slice groups repeated selected-object nudges into one explicit `document.object.transform.set` transaction, and the next narrow follow-up now records single-object select-mode pointer transforms through that same operation family with `mode: 'pointer-move'` for translate-only drags and `mode: 'pointer-transform'` for non-translate transforms.
- Undo/redo now prefers targeted runtime patch replay for `document.object.properties.set`, `document.object.transform.set`, deterministic `document.layer.add`, narrow single-layer `document.layer.remove`, `document.layer.visibility.set`, `document.layer.opacity.set`, `document.layer.order.set`, and `document.template.opacity.set`, plus the current documented paint subset covering existing-layer Brush/Eraser on either the strict cropped replay-safe lane or the broader existing-raster `shared-surface-commit-only` lane, existing paint-layer Fill and retained-object `layer-id` retained-raster Fill on either the strict cropped lane or the broader committed shared-raster lane, the narrow retained non-raster retained-object Fill helper subset, and deterministic auto-create fill structure; unsupported or ambiguous paint still falls back to full snapshot restore.
- Validation for those targeted replay families must include one committed entry whose `selectedObjectId` anchor is `null`, followed by a later transient selection, so QA confirms undo/redo clears the live selection and then proves the retained target is gone by using `Fill` on that later object without reselecting it first.
- Projected-id selected-object Properties writes for primary colour, secondary colour, selected-object opacity, stroke width, font family, and font size now record through `document.object.properties.set`; drag-style controls coalesce by projected object id plus property key until explicit release/blur commit or another real boundary, while no-selection defaults stay off the history path.
- Standalone artboard resize now records through one checkpoint-only `document.artboard.resize` boundary, so validation should confirm exactly one checkpoint entry, one redo reset, clean workspace/selection reset, and correct export/save-load dimensions after the resize completes.
- Standalone inserted upload-image, duplicate-selected, one-click text insertion, and committed rect or circle or line or gradient preview-finalize flows now record one explicit `document.layer.add` transaction with inserted layer id, insert index, source metadata, and committed after-selection anchors; targeted replay may now reconstruct or remove those exact one-shot inserts before falling back, while broader or ambiguous structural cases still stay on snapshot restore.
- Narrow layer deletion from the panel and single-selection delete now records one explicit `document.layer.remove` transaction before the same snapshot-backed undo/redo restore path runs.
- Committed Brush/Eraser now record one explicit `document.stroke.commit` transaction with stable target-layer ids and invalidation metadata across both the supported shared-surface path and the legacy fallback path, while snapshot restore remains the actual undo/redo mechanism.
- Retained-target fill, active paint-layer fill, and no-active-layer auto-create fill now record one explicit `document.fill.apply` transaction with stable target ids and invalidation metadata; supported retained-target fills that resolve to one existing image-backed raster layer now also record the stable `targetLayerId` plus `targetOwnership: 'layer-id'`, can commit through either the strict replay-backed `shared-surface` lane or the broader `shared-surface-commit-only` lane, join the targeted replay subset when that same transaction stayed on either the strict cropped `source-over` shared-surface boundary or the broader existing-raster committed shared-raster boundary with one stable target layer and no created-layer ambiguity, supported retained non-raster fills join that replay subset only when the committed entry records the plain retained-object lane with no created-layer branch and the current target still resolves to one live non-raster fillable object whose target snapshot can be rebuilt through the retained-object fill helper path, and otherwise keep the existing fallback behavior. The auto-create branch still creates the blank layer inside the fill transaction, marks that it created the target layer, removes that temporary layer again on abort, no-op, or error instead of recording a second `document.layer.add` entry, and restores the prior retained-target plus active paint-layer routing state when the fill does not commit.
- Promise-backed structural and paint replay now hold a short async history-replay barrier until they either validate or fall back, so QA should confirm a second rapid undo/redo request is ignored while one replay-backed paint restore is still settling.
- Those explicit stroke/fill transactions now also hold one editor-owned exclusive async paint mutation barrier until commit or abort, so later undo/redo, reversible mutation starts, and document-boundary load attempts should short-circuit instead of crossing an unfinished awaited paint commit.
- Project load, PSD import, and custom non-PSD template upload now reseed snapshot history through explicit checkpoint-only committed entries, remain non-undoable across the boundary, and should leave `io.project.load.commit`, `io.psd.import.commit`, or `document.template.load` visible in `editor.getHistoryDebugState()` with boundary metadata after the new baseline is seeded.
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
- Properties and Layers panel shell state staying aligned with the visible collapsed/open classes after repeated toggles
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