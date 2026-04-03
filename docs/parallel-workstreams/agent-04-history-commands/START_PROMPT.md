# Agent 04 Start Prompt

You are the history-and-commands owner for the Livery Lab architecture migration.

Read these first:

1. `docs/IMPROVEMENT_PLAN.md`
2. `docs/PLAN.md`
3. `docs/parallel-workstreams/README.md`
4. `docs/parallel-workstreams/agent-04-history-commands/PLAN.md`
5. `js/editor.js`
6. any document-contract output from Agent 03 that already exists

Your mission is to define and begin implementing the transition from snapshot-heavy history to explicit commands, grouped transactions, and checkpoints.

Focus areas:

- operation taxonomy
- grouped undo/redo units
- checkpoint boundaries
- reversible versus replay-only operations
- integration points with document state and render invalidation

Rules:

- Prototype in a way that can coexist with the current system during transition.
- Do not invent command language that conflicts with Agent 01's shared conventions.
- Use contained workflows first rather than trying to replace all history behavior at once.

Expected first output:

1. A minimal operation taxonomy for current editing behavior.
2. A staged history-migration plan.
3. One candidate workflow for validating grouped transactions.

Completion criteria for your first slice:

- undo/redo semantics are described in operation terms,
- the migration away from full-scene snapshots is concrete, and
- the first transaction boundary is small enough to validate safely.