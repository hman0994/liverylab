# Agent 04 Plan - History And Commands

## Mission

Replace broad snapshot-oriented undo/redo assumptions with a command and transaction model that can scale with the new document architecture.

## Start Condition

May prototype immediately, but final implementation should build on the document contract from Agent 03.

## Primary Outcomes

- Define the operation taxonomy for user actions.
- Introduce grouped transactions and reversible changes.
- Reduce reliance on full-scene JSON snapshots for common edits.
- Make undo/redo semantics explicit and testable.

## Owned Surface Area

- `js/core/history/**` as it is introduced
- command/transaction types shared with dispatcher and document work
- history-facing portions of `js/editor.js`

## Parallel-Safe Tasks

1. Catalog the current history mutation points.
2. Define the first command and transaction types.
3. Decide what should be reversible versus checkpoint-only.
4. Plan grouped undo units for brush, fill, template load, layer changes, and selection changes.
5. Define how checkpoints and replay should interact with the document model.

## Dependencies

- Coordinate command language with Agent 01.
- Depend on Agent 03 for stable document records.
- Coordinate with Agent 05 where render invalidation depends on history operations.

## Non-Goals

- No compositor ownership.
- No shell-state ownership.
- No UI redesign.

## Deliverables

- First operation taxonomy.
- A staged replacement plan for snapshot history.
- Clear rules for grouped undo/redo and checkpoint boundaries.

## Definition Of Done

- Undo/redo behavior is described in operation terms instead of incidental implementation details.
- The migration path away from snapshot-heavy history is concrete.
- Downstream work can reference stable command semantics.

## First Execution Slice

1. Define the minimal set of operations needed for current editing flows.
2. Pick one contained workflow to validate grouped transactions.
3. Identify where checkpointing is still required during transition.

### First Slice Status (2026-04-02)

- Minimal operation taxonomy is now anchored to lower-case dotted command names under `document.*` and `io.*`, matching the shared contract baseline.
- The first operation families are raster commits, layer structure, layer properties, object transforms, and document-boundary loads/imports.
- Reversibility rules for the first slice:
	- `reversible` for layer/property/transform actions that should map cleanly to one undo unit.
	- `checkpoint-only` for document-boundary actions such as template load, PSD import, project load, and artboard resize while the runtime still restores through Fabric JSON.
	- `replay-only` remains reserved for future async or derived operations that cannot yet supply a direct inverse.
- Checkpoint boundaries for the transition:
	- Per-operation checkpoints for discrete layer/property commits.
	- Idle-grouped checkpoints for repeated transform nudges on the same selected object.
	- Forced checkpoints at template/document/import boundaries so redo cannot cross a document reset.
- First validation workflow: keyboard nudging of the selected object now groups repeated arrow-key movement into one `document.object.transform.set` transaction until an idle timeout or another history boundary occurs.
- Integration points for downstream work:
	- History transactions target stable `layers[].id` and object `_id` anchors published by Agent 03.
	- Transactions carry render invalidation metadata with `viewport-and-export` scope so Agent 05 can later replace the snapshot bridge with compositor-aware invalidation.
	- The current snapshot stack remains the canonical restore path, but grouped transactions now define the intended undo unit explicitly.

### Staged Migration Plan

1. Catalog and name current mutations in operation terms while keeping snapshot restore intact.
2. Introduce grouped transactions for contained reversible workflows, starting with selection nudges and then extending to layer visibility, opacity, and z-order changes.
3. Convert high-frequency paint operations such as stroke and fill into command-backed commits that still checkpoint through the snapshot bridge until render work provides narrower patch targets.
4. Move document-boundary actions like PSD import, template load, artboard resize, and project load to explicit checkpoint records that reset redo and annotate migration boundaries.
5. Replace broad scene snapshots with document-targeted reversible patches and periodic checkpoints once document records and render invalidation are stable enough to rebuild from commands.