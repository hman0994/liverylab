# Agent 02 Plan - App Shell And State Boundary

## Mission

Move the application shell toward a dispatcher/store-driven model so UI intent is separated from editor implementation details.

## Start Condition

Can start immediately after reviewing the current dispatcher/store seam.

## Primary Outcomes

- Expand centralized app-shell state ownership.
- Remove direct DOM-to-editor orchestration where a dispatched intent should exist instead.
- Make toolbar, picker, modal, export-size, and other shell concerns flow through predictable state changes.

## Owned Surface Area

- `js/core/dispatcher.js`
- `js/core/app-store.js`
- `js/app.js`
- app-shell portions of `index.html`

## Parallel-Safe Tasks

1. Inventory all current app-shell state still living as ad hoc local variables.
2. Define selectors or equivalent derived-state helpers for shell UI.
3. Move one UI flow at a time behind the dispatcher/store boundary.
4. Introduce lightweight adapters rather than forcing the editor core to change all at once.
5. Reduce imperative DOM update sprawl in favor of state-driven render/update helpers.

## Dependencies

- Coordinate command naming with Agent 01.
- Coordinate document/editor ownership boundaries with Agent 03.
- Leave tool-lifecycle refactors to Agent 06 unless a thin adapter is required.

## Non-Goals

- No document schema ownership.
- No transaction history design.
- No compositor ownership.

## Deliverables

- A larger portion of shell state routed through the dispatcher/store.
- A documented list of remaining direct UI-to-editor coupling.
- Cleaner seams for startup flow, export modal flow, and toolbar state.

## Definition Of Done

- Major app-shell flows can be understood through dispatched intents and store updates.
- New UI work no longer defaults to direct editor calls for shell-only concerns.
- App-shell state ownership is visibly narrower and easier to reason about.

## First Execution Slice

1. Catalog remaining uncaptured shell state.
2. Migrate one medium-sized user flow end to end.
3. Leave explicit adapter seams for later document and tool work.

## First Slice Inventory (2026-04-02)

Shell state still living outside the store after this slice:

- Toolbar active tool state still routes through `setActiveTool()`, `editor.setTool()`, and `editor.onToolChanged` in `js/app.js`.
- Startup picker state still lives in local variables and DOM helpers: `activeCarCategory`, the search query input value, dropdown-open state, and the rendered result set.
- Template/startup modal visibility still uses direct `openModal()` and `closeModal()` calls.
- Recent-car persistence still lives in `recentCarFiles`, localStorage helpers, and picker rendering in `js/app.js`.
- Selected-car shell projection still depends on the local `selectedCar` adapter plus direct DOM writes for the car label and export hints.
- Panel collapse state still toggles DOM classes directly and has no store owner.
- Export execution still needs a thin adapter to call `exportPNG()` and `exportTGA()` with the current editor instance.

State now moved behind the dispatcher/store seam in this slice:

- Export modal visibility via `app.modal.open` and `app.modal.close`.
- Export-size preference state via `app.export.size.set` plus shell selectors in `js/core/app-store.js`.
- Export execution entry via `app.export.request`, which reads the selected export-size preference from store state.

## Prioritized Migration List

1. Startup picker shell state: modal visibility, category filter, search query, dropdown-open state, and recent-result projection.
2. Toolbar state: active tool ownership and state-driven toolbar rendering, while leaving editor tool lifecycle changes to Agent 06.
3. Selected-car shell projection: top-bar label and export-hint rendering behind selectors, while keeping durable car/template ownership coordinated with Agent 03.
4. Recent-cars state and persistence: move recents into the shell store with a storage adapter instead of ad hoc local variables.
5. Panel collapse and other shell preferences: capture panel visibility and similar UI-only preferences once the higher-risk picker and toolbar flows are stable.

## Implemented First Slice

Implemented flow: export modal open/close, export-size selection, and export dispatch.

- UI intent now dispatches `app.modal.open`, `app.modal.close`, `app.export.size.set`, and `app.export.request`.
- `js/core/app-store.js` owns the selected export size and active modal for this flow.
- `js/app.js` renders the export modal from selectors instead of mutating button state and modal visibility ad hoc.
- The editor remains outside the store; export execution uses a thin adapter that reads shell state and invokes the existing export helpers.