# Parallel Architecture Workstreams

This folder breaks the modernization effort into agent-owned workstreams that can run in parallel with controlled overlap.

Each subfolder contains a `PLAN.md` for one agent.
That agent owns the scope, sequencing, handoffs, and verification described in its file.
Each subfolder also contains a `START_PROMPT.md` that can be used to kick off that agent's first slice.

## How To Use This Folder

1. Assign one agent to each workstream folder.
2. Have that agent read `docs/IMPROVEMENT_PLAN.md`, `docs/PLAN.md`, and its own `PLAN.md` before starting implementation work.
3. Keep cross-workstream changes behind explicit handoffs instead of having multiple agents edit the same architectural seam at once.
4. Treat these plans as execution contracts, not loose notes.

## Workstream List

- `agent-01-foundation-contracts/PLAN.md` — shared architecture guardrails, module boundaries, and migration contracts
- `agent-02-app-shell-state/PLAN.md` — dispatcher/store expansion and app-shell state migration
- `agent-03-document-model-persistence/PLAN.md` — `EditorDocument` schema, persistence, and migration adapters
- `agent-04-history-commands/PLAN.md` — command model, transactions, undo/redo, and checkpointing
- `agent-05-render-export-pipeline/PLAN.md` — compositor, raster surfaces, and export-path unification
- `agent-06-tools-workspace-ui/PLAN.md` — tool controllers, inspector flow, layers/workspace UI migration
- `agent-07-qa-cutover-integration/PLAN.md` — regression coverage, baseline metrics, integration cadence, and release gates

See [PROMPTS.md](PROMPTS.md) for the kickoff prompt index.

## Recommended Parallel Waves

### Wave 0

- Agent 01 defines contracts and no-fly zones.
- Agent 07 captures baseline metrics and updates verification docs.

### Wave 1

- Agent 02 expands app-shell state boundaries.
- Agent 03 defines the first document model and migration adapters.

### Wave 2

- Agent 04 builds the command and history model on top of the document contract.
- Agent 05 builds the render/export contract on top of the document contract.

### Wave 3

- Agent 06 extracts tool runtime and starts the workspace/inspector migration using the app-shell and document seams.

### Wave 4

- Agent 07 coordinates cutover validation for each merged slice.
- Agent 01 updates architecture docs and records final contract decisions.

## Shared Rules For All Agents

- Keep the app runnable throughout the migration.
- Prefer additive seams and adapters before destructive rewrites.
- Do not silently change another workstream's contract.
- If a plan requires changing shared contracts, update the relevant planning docs first or in the same change.
- Re-run the relevant manual and QA checks for every architectural slice.

## Contract Baseline For Parallel Work

- `js/core/**` is the target owner for state, commands, history, render contracts, and tool contracts.
- `js/ui/**` is the target owner for DOM binding, panel rendering, keyboard shortcuts, and view-model projection.
- Adapter seams isolate Fabric, IO, storage, manifest fetches, and vendor codecs from the core contracts.
- Commands use lower-case dotted namespaces by owner domain such as `app.tool.set`, `document.layer.add`, and `history.undo`.
- Events use lower-case dotted namespaces that describe completed facts such as `app.tool.changed` and `document.layer.added`.
- The first serialized document schema excludes transient tool/UI state. Picker filters, recent cars, and modal visibility are app-shell concerns rather than document data.

## High-Risk Overlap Areas

- `js/app.js` intersects Agent 02 and Agent 06.
- `js/editor.js` intersects Agent 03, Agent 04, Agent 05, and Agent 06.
- `js/export.js` intersects Agent 05 and Agent 07.
- `docs/ARCHITECTURE.md` intersects Agent 01 and any agent changing shipped boundaries.

Coordination required before editing:
- Active tool, active layer, and selection ownership in `js/app.js` or `js/editor.js` requires agreement between Agents 02, 03, 04, and 06.
- Any new shared command/event names require agreement between Agents 02, 04, and 06 before implementation spreads.
- Any new document fields consumed by export/render require agreement between Agents 03, 05, and 07.

Use small integration slices and explicit handoffs whenever touching these files.