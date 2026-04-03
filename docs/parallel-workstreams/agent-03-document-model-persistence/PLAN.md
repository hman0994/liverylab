# Agent 03 Plan - Document Model And Persistence

## Mission

Create the first explicit `EditorDocument` contract so the app stops depending on Fabric objects and snapshot serialization as the primary truth model.

## Start Condition

Can start in parallel with Agent 02 once the current runtime state is inventoried.

## Primary Outcomes

- Define the first versioned `EditorDocument` schema.
- Separate document state from shell state and transient tool state.
- Build adapters for legacy project JSON and existing import paths.
- Make future history and render work build against a real document contract.

## Owned Surface Area

- `js/core/document/**` as it is introduced
- document-facing portions of `js/editor.js`
- serialization and migration logic tied to project save/load
- planning/docs that define document-state ownership

## Parallel-Safe Tasks

1. Inventory the state currently hidden in Fabric custom properties and editor instance fields.
2. Define the minimal first document shape needed for migration.
3. Add schema versioning and migration helpers for saved projects.
4. Create bridging code that can derive runtime/editor state from the document without forcing a full rewrite.
5. Identify which import paths can be normalized first: bundled template load, PSD import, JSON load.

## Dependencies

- Coordinate state ownership with Agent 01.
- Coordinate shell/document boundaries with Agent 02.
- Provide stable operation targets for Agent 04 and Agent 05.

## Non-Goals

- No final compositor implementation.
- No tool extraction ownership.
- No workspace UI redesign.

## Deliverables

- First documented `EditorDocument` schema.
- Legacy migration plan for current project JSON.
- An explicit separation between shell state and document state.

## Definition Of Done

- History and render work can target document records instead of incidental scene details.
- Save/load has a versioned contract.
- The repo has a clear answer to what the document owns.

## First Execution Slice

1. Publish the first draft schema.
2. Define legacy migration assumptions.
3. Introduce a minimal runtime bridge that proves the schema can coexist with current behavior.

### First Slice Status (2026-04-02)

- `EditorDocument v1` is the first explicit saved-project contract.
- `layers[]` now publishes document-facing layer records instead of treating raw Fabric object shape as the only durable model.
- Selection and viewport are defined as document-owned session state, but they remain intentionally out of the persisted v1 file.
- Save/load now uses a versioned document wrapper with a transitional `bridge.fabricCanvas` payload so current runtime behavior stays intact.
- Legacy project JSON that contains only Fabric canvas data is loaded through an explicit migration adapter into `EditorDocument v1`.