# Livery Lab Improvement Plan

This document is the repository-facing modernization plan for Livery Lab.
It complements `docs/PLAN.md`:

- `docs/PLAN.md` tracks the product backlog, current state, and short-horizon roadmap.
- `docs/IMPROVEMENT_PLAN.md` defines the longer-range architecture migration path for turning the current monolithic editor into a cleaner, more durable platform.

The plan is intentionally ambitious, but the implementation strategy is incremental.
Livery Lab must remain a working static web app throughout the migration.

---

## Goals

- Create durable subsystem boundaries between UI, editor state, history, tools, rendering, and export.
- Improve performance in the current hotspots without breaking the existing static-hosted workflow.
- Reduce correctness risk caused by implicit state spread across DOM code, Fabric objects, and ad hoc JSON snapshots.
- Make future features such as non-destructive effects, richer layers, plugin-like extensions, and recovery workflows realistic.

## Current Problems

- `js/editor.js` still acts as a large, multi-responsibility runtime for tools, document state, canvas wiring, history, and export preparation.
- `js/app.js` still owns substantial UI orchestration and direct editor coupling even after the initial dispatcher/store seam was introduced.
- Undo/redo relies heavily on serialized snapshots, which is simple but expensive and fragile as state grows.
- Brush/fill/export paths are not yet centered on one explicit document and compositor contract.
- New editor capabilities often require touching multiple unrelated areas because system boundaries are still weak.

## Hard Constraints

- The app remains static-hosted with no backend.
- Early phases should preserve the no-build setup unless a later phase proves that a build step is worth the cost.
- The current user workflows must keep working during migration: bundled car picker, custom template load, PSD import, JSON project save/load, PNG export, and TGA export.
- GitHub Pages deployment and direct browser loading constraints remain part of the design space.

## Non-Goals For The First Wave

- No big-bang rewrite.
- No immediate Graphite-style visual node editor.
- No attempt to clone GIMP or GEGL feature-for-feature.
- No early GPU/WebGL/WebGPU complexity before the document, history, and render contracts stabilize.

---

## Guiding Principles

1. Keep the product shippable during every migration slice.
2. Move state ownership out of Fabric and into explicit application/document models.
3. Share one rendering truth between viewport composition and export output whenever possible.
4. Prefer vertical slices over infrastructure-only rewrites.
5. Treat performance work as architecture work: fix root causes, not only symptoms.
6. Preserve compatibility with existing project files whenever practical by using schema versioning and migrations.

---

## Target Architecture

### App Shell

- UI panels and controls dispatch messages rather than mutating editor state directly.
- App-level state such as active tool, selected car, export settings, modal visibility, and recent cars flows through a central store.

### Document Model

- A first-class `EditorDocument` becomes the source of truth for layers, selection, viewport state, template metadata, guides, export settings, and future effect stacks.
- Fabric objects become adapters for interaction and preview rather than the canonical state model.

### History System

- Undo/redo moves from full-scene snapshots toward transactions, reversible patches, and periodic checkpoints.
- Multi-step user actions become explicit grouped history units.

### Render And Composite Pipeline

- The editor renders from document-owned layer surfaces rather than from incidental Fabric scene serialization.
- Export reuses the same compositor path so on-canvas and exported output stay aligned.

### Tool Runtime

- Tools become separate controllers with shared lifecycle methods such as activate, pointerDown, pointerMove, pointerUp, cancel, and commit.
- Tools emit commands and transient preview state rather than directly mutating scene objects in inconsistent ways.

### Procedures And Extensions

- The long-range architecture should support a registry for importers, exporters, generators, filters, guide packs, and future plugin-like procedures.
- This boundary should be explicit before any real plugin system is attempted.

### Shared Contract Baseline (Agent 01 Slice)

- `js/core/**` is the target home for state ownership, command handling, history, render contracts, and tool contracts. It should remain free of direct DOM access and browser-only policy code.
- `js/ui/**` is the target home for DOM rendering, event binding, and view-model projection. UI code dispatches commands and renders derived state; it does not become the durable source of truth.
- Adapter seams isolate Fabric, file IO, browser storage, manifest fetches, and codec integrations from the core contracts.
- The first document schema should serialize durable document state only. Viewport, hover, and in-progress tool previews remain non-serialized state unless a later ADR promotes them.
- Shared command names use lower-case dotted namespaces by owner domain such as `app.*`, `document.*`, `history.*`, `render.*`, and `io.*`. Events use the same namespaces but describe post-change facts.

---

## Migration Phases

### Phase 0 - Baseline And Guardrails

Measure and document the current editor behavior before major refactors.
Capture baseline timings for brush commit, fill, PSD import, undo/redo, PNG export, and TGA export on representative 2048 projects.
Use `docs/QA/QA-TEST-PLAN.md` and `docs/QA/MANUAL-TEST-CHECKLIST.md` as the required regression backbone.

### Phase 1 - App Shell Message Boundary

Continue the current dispatcher/store work until the UI shell stops driving editor behavior through broad direct coupling.
UI concerns should dispatch intent; core systems should derive state and notify subscribers.
This creates a real seam for later architecture changes.

### Phase 2 - Explicit Document Schema

Introduce a versioned `EditorDocument` model that holds layer records, canvas metadata, selection, active tool context, export metadata, template/car context, guide flags, and other editor-owned state.
Add migration adapters so legacy project JSON can still load.

### Phase 3 - Transactional History

Replace snapshot-heavy undo/redo with grouped transactions and checkpoints.
Represent user actions as operations such as `StrokeApplied`, `LayerInserted`, `LayerVisibilityChanged`, `TemplateLoaded`, and `SelectionChanged`.
This should improve both correctness and performance.

### Phase 4 - Shared Raster And Export Pipeline

Move raster editing and compositing toward per-layer surfaces and a dedicated compositor.
Brush, eraser, fill, and export should all converge on the same rendering path so output stays consistent.
Dirty-region invalidation should be introduced where practical.

### Phase 5 - Tile And Worker Strategy

After the compositor exists, introduce tile-oriented or dirty-rectangle processing so common edits do not repeatedly touch the whole 2048 canvas.
Long-running operations such as fill, PSD flattening, or export can then be evaluated for OffscreenCanvas or worker execution.

### Phase 6 - Formal Tool Runtime

Break tool logic out of the monolith into independent controllers with a shared lifecycle and inspector state.
Paint tools should commit raster operations; selection and transform tools should manipulate document metadata; text and shape tools should create durable layer records.

### Phase 7 - Layer Operation Stack

Introduce a lightweight, non-destructive operation stack per layer before considering any visible node graph.
This enables future work such as transforms, blend overrides, finish/spec controls, shadows, outlines, masking, and other derived effects.

### Phase 8 - Procedure Registry

Define a stable host API for importers, exporters, generators, filters, and guide providers.
Start with first-party procedures loaded locally.
Only after the host boundary is stable should third-party extension execution be considered.

### Phase 9 - State-Driven Workspace UI

Rework the UI so panels, inspectors, and layer affordances are driven by derived state instead of one-off imperative DOM updates.
This phase should also address grouped layers, richer inspector behavior, panel collapse patterns, and clearer long-task status surfaces.

### Phase 10 - Recovery And Startup UX

Use the new architecture to improve startup resilience, error reporting, autosave, session recovery, and long-running task feedback.
This includes better messaging for `file://` limitations, asset failures, and resumable work.

### Phase 11 - Legacy Dependency Containment

Quarantine obsolete or incidental dependencies behind clear adapters.
Remove or isolate unused load paths early enough that the new boundaries do not get contaminated by legacy coupling.

### Phase 12 - Deliver In Vertical Slices

Ship the migration as a sequence of visible, testable slices rather than hidden infrastructure dumps.
Recommended slice order:

1. Dispatcher/store expansion for app-shell state.
2. Document schema plus legacy adapters.
3. Transactional history.
4. Raster surface path for brush and eraser.
5. Shared export compositor.
6. Fill optimization.
7. Tool extraction.
8. Inspector and layers-panel modernization.
9. Layer operation stack.
10. Procedure registry.

---

## Verification Gates

1. Re-run the relevant parts of `docs/QA/MANUAL-TEST-CHECKLIST.md` after every architecture slice.
2. Update `docs/QA/QA-TEST-PLAN.md` whenever shipped behavior or risk areas change.
3. Verify that legacy template loading, PSD import, project save/load, and PNG/TGA export still work after each core-system phase.
4. After the compositor work begins, confirm exported pixels match the viewport composite for supported features.
5. Before introducing worker or GPU complexity, prove that the CPU compositor and cache strategy are already stable.

## Recommended Immediate Work Order

1. Establish the first real app-shell dispatcher/store seam under `js/core/**`; until those modules exist, isolate new shell-state logic behind narrow helpers instead of widening direct DOM-to-editor coupling.
2. Define the first `EditorDocument` shape and import/export adapters before attempting a large render rewrite.
3. Identify the minimum set of editor operations required to prototype transactional history.
4. Keep documentation aligned as the migration starts, especially `docs/ARCHITECTURE.md`, `docs/PLAN.md`, and the QA docs.

## Parallel Execution Package

The architecture shift is now broken into agent-owned workstreams under `docs/parallel-workstreams/`.
Use `docs/parallel-workstreams/README.md` as the coordination index and assign one agent to each subfolder `PLAN.md`.
Use `docs/parallel-workstreams/PROMPTS.md` for ready-to-run kickoff prompts for each assigned agent.

Recommended initial assignment order:

1. Agent 01 for shared contracts and guardrails.
2. Agent 07 for baseline metrics and cutover gates.
3. Agent 02 and Agent 03 in parallel for shell-state and document-state separation.
4. Agent 04 and Agent 05 in parallel once the first document contract is stable.
5. Agent 06 once the first shell and document seams are real enough to support tool extraction.

## Open Decisions

- How long Fabric should remain as the interaction adapter once a true document/compositor exists.
- When, if ever, a build step becomes justified for workers, optional WASM helpers, or larger module boundaries.
- How much of the future extension model should be public versus first-party-only in the initial registry design.
- Whether grouped layers should be implemented before or after the first non-destructive operation stack.

Resolved in the first contract slice:
- The first serialized document schema excludes transient tool state and UI state.
- Viewport and selection focus are document-owned session concerns, but they are not part of the first persistence contract.

## Success Criteria

This plan is succeeding if:

- new features land with less cross-file incidental complexity,
- undo/redo no longer depends on broad scene snapshots for common edits,
- export and viewport rendering are derived from the same document/compositor contract,
- architecture work remains testable and shippable in small slices, and
- the app stays reliable for the current Livery Lab workflow while gaining a stronger foundation for future capabilities.