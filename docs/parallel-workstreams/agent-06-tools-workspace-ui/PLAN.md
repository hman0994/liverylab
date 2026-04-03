# Agent 06 Plan - Tools And Workspace UI

## Mission

Extract tool behavior into clearer controllers and reshape the workspace UI so it can consume state and document changes without depending on one large editor monolith.

## Start Condition

Can start with lifecycle design immediately, but substantial implementation should align with Agent 02 and Agent 03 seams.

## Primary Outcomes

- Define a shared tool lifecycle model.
- Isolate tool behavior from one-off editor conditionals.
- Prepare the inspector, layers panel, and workspace UI for state-driven updates.
- Reduce the amount of tool-specific branching concentrated in `js/editor.js` and `js/app.js`.

## Owned Surface Area

- `js/core/tools/**` as it is introduced
- tool-facing portions of `js/editor.js`
- workspace-facing portions of `js/app.js`
- `index.html`
- `css/style.css`

## Parallel-Safe Tasks

1. Inventory each tool's current lifecycle and side effects.
2. Define common controller hooks such as activate, pointerDown, pointerMove, pointerUp, cancel, commit, and inspector state.
3. Decide which existing tools can migrate first with the lowest risk.
4. Define how layers and inspector UI consume tool/document state rather than direct object inspection.
5. Identify which UI panels can move first without waiting for the full workspace redesign.

## Dependencies

- Coordinate shell-state flows with Agent 02.
- Coordinate document-owned tool state with Agent 03.
- Coordinate preview/render assumptions with Agent 05.

## Non-Goals

- No ownership of base dispatcher/store contracts.
- No ownership of document schema.
- No ownership of transaction infrastructure beyond tool integration points.

## Deliverables

- First shared tool lifecycle specification.
- Migration order for individual tools.
- A staged workspace UI migration plan tied to actual state ownership.

## Definition Of Done

- Tool behavior is decomposed enough that new tools do not have to extend one central conditional maze.
- Inspector and workspace behavior can increasingly respond to state rather than raw scene inspection.
- The repo has a credible path toward a cleaner workspace shell.

## First Execution Slice

1. Define the lifecycle contract.
2. Pick one low-risk tool migration candidate.
3. Identify one inspector or layer-panel seam that can move to state-driven behavior first.

## First Slice Inventory (2026-04-02)

### Current-State Tool Lifecycle And Side Effects

Shared lifecycle entry points today:

- `PaintEditor.setTool()` in `js/editor.js` is the single activation switch for every persistent tool mode.
- Fabric canvas events route tool execution through editor-owned handlers: `_onPathCreated()`, `_onMouseDown()`, `_onMouseMove()`, `_onMouseUp()`, and `_onSelection()`.
- UI state sync still depends on editor callbacks into `js/app.js`: `onToolChanged`, `onSelectionChanged`, and `onLayersChanged`.

Current lifecycle by tool family:

- `select`
	- activation: disables drawing mode, restores interactivity, narrows selection with `_makeOnlyActiveInteractive()`
	- runtime: selection is driven by Fabric events and direct object references
	- side effects: toolbar state, layer highlighting, object-property sync
- `brush` and `eraser`
	- activation: enable Fabric free-draw mode and configure the drawing brush
	- runtime: Fabric creates a transient `path`; editor merges that path into the active raster layer in `_onPathCreated()`
	- side effects: may auto-create a blank target layer, replace the target image layer, update selection, and checkpoint history
- `fill`
	- activation: disables selection and locks all objects for painting
	- runtime: pointer-down calls `_doFill()` directly; no drag preview
	- side effects: destructive raster write into active layer or a newly created blank layer, layer replacement, history save
- `rect`, `circle`, `line`
	- activation: disables selection and locks objects for painting
	- runtime: pointer-down creates a transient Fabric shape, pointer-move mutates preview geometry, pointer-up converts preview into a named layer and returns to `select`
	- side effects: toggles `_suspendHistory`, mutates `_isDrawing` and `_activeShape`, inserts a new layer, changes active tool
- `gradient`
	- activation: disables selection and locks objects for painting
	- runtime: pointer-down immediately creates a full-art gradient rect via `_addGradientToLayer()`
	- side effects: may auto-create a blank layer, merges into the active raster layer, then returns to `select`
- `text`
	- activation: disables selection and locks objects for painting
	- runtime: pointer-down inserts a Fabric `IText`, enters editing, and returns to `select`
	- side effects: creates a new movable layer, switches selection, starts text editing
- `upload-image` and `load-template`
	- not real editor tool controllers today; they are toolbar actions owned by `js/app.js`

Cross-cutting editor side effects that are currently mixed into tool logic:

- canvas-mode changes: `isDrawingMode`, `selection`, cursor, and object interactivity locks
- active-target management: `_activeLayer`, Fabric active object, and fallback-layer creation
- history writes: `_saveState()` plus `_suspendHistory` for preview suppression
- workspace notifications: `onToolChanged`, `onSelectionChanged`, `onLayersChanged`
- implicit UI coupling: group names, layer names, selection flags, and property visibility are shaped around what the layers panel currently renders

### Current Inspector And Layers-Panel Boundaries

- `js/app.js` still renders the layers panel from `editor.getLayers()` and selection callbacks, which means the workspace shell depends on an editor adapter rather than a stable view-model contract.
- Property-group visibility is still keyed off the active tool name, not a dedicated inspector-state model.
- Object-property controls still consume raw Fabric object references through `onSelectionChanged`.
- This means the UI is no longer inspecting Fabric directly, but it is still coupled to editor-owned projection logic instead of a dedicated workspace state surface.

## Proposed Common Tool-Controller Lifecycle

Target controller contract for `js/core/tools/**`:

- `activate(context)`
	- receives shell-selected tool intent and installs any canvas/runtime policy needed for the tool
- `deactivate(context, reason)`
	- releases transient locks, previews, and editing state
- `pointerDown(context, pointer)`
- `pointerMove(context, pointer)`
- `pointerUp(context, pointer)`
- `cancel(context, reason)`
	- escapes unfinished previews or edit sessions without committing document changes
- `commit(context)`
	- finalizes a tool action into one document/editor mutation boundary
- `getInspectorState(context)`
	- returns tool-local inspector state for the workspace UI without exposing Fabric internals

Controller context should expose narrow adapters rather than the whole editor instance:

- canvas adapter: cursor, drawing-mode, interactivity locks, preview insertion/removal
- document/session adapter: active layer id, selected object id, artboard metadata, template metadata
- command bridge: history checkpoint or command dispatch entry
- notifier bridge: workspace state invalidation after commit/cancel/selection changes

Lifecycle expectations:

- `activate()` and `deactivate()` own canvas policy only; they should not silently mutate durable document data.
- Pointer handlers may create transient previews, but durable changes happen only in `commit()`.
- `cancel()` must leave no transient preview objects behind.
- Returning to `select` is a shell decision coordinated with Agent 02, not a hidden side effect spread across tool implementations.

## Inspector-State Boundaries

State ownership split for the first tool-runtime migration:

- Agent 02 / shell state
	- active tool id
	- toolbar active button
	- panel collapse/open state
	- modal visibility and other workspace-only UI state
- Agent 03 / document and session state
	- active layer id
	- selected object id
	- document-backed layer records and artboard/template metadata
	- persisted tool inputs only if a later document contract explicitly adopts them
- Agent 06 / tool-controller transient state
	- in-progress preview geometry
	- drag origin and draft handles
	- tool-local inspector data that exists only while a tool is active

Boundary rule:

- the inspector should render from a composed workspace view model: shell tool selection + document/session selection + optional tool-controller inspector state
- the inspector should not infer durable behavior from raw Fabric object types in `js/app.js`

## Low-Risk First Extraction Candidate

Recommended first extraction candidate: `gradient`

Why `gradient` is the safest first move:

- no drag-preview lifecycle yet
- single pointer-down entry point
- limited settings surface: primary color, secondary color, opacity
- already behaves like a one-shot command that returns to `select`
- reuses the existing merge path into the active raster layer, so it does not need new document ownership to prove the controller seam

Scope for the first gradient extraction:

- move activation/deactivation and pointer-down behavior behind one controller
- keep the current merge implementation as an editor adapter for now
- do not change gradient visuals, insertion order, or export behavior in the first slice

Deferred higher-risk candidates:

- `brush` and `eraser` because Fabric free-draw and raster merge side effects are tightly coupled
- `rect` / `circle` / `line` because preview lifecycle and history suppression need a shared preview adapter first
- `text` because edit-mode handoff to Fabric `IText` introduces focus and cancellation edge cases

## First State-Driven Workspace UI Seam

First seam to target: layers-panel rendering from a workspace snapshot adapter

Initial seam shape:

- editor publishes `getWorkspaceState()` with `tool`, `selection`, and `layers`
- `js/app.js` renders the toolbar/layers UI from that snapshot instead of pulling layer data ad hoc during each render path
- this is an adapter seam, not the final owner; it gives Agent 06 a stable workspace-facing projection while Agent 02 and Agent 03 continue moving shell and document state to their long-term homes

Why this seam is credible:

- it moves a visible workspace surface onto derived state without changing the visual design
- it reduces the amount of editor knowledge embedded in the layers-panel renderer
- it gives later inspector work a place to add explicit `inspector` or `workspace` view-model fields without binding `js/app.js` to Fabric internals

## First Slice Outcome

- the tool lifecycle contract is now explicit
- `gradient` is the first recommended extraction target
- the layers panel has a concrete state-driven seam through `editor.getWorkspaceState()` that can later be replaced by shell/document selectors