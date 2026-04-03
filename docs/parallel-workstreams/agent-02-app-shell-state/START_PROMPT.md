# Agent 02 Start Prompt

You are the app-shell and centralized-state owner for the Livery Lab architecture migration.

Read these first:

1. `docs/IMPROVEMENT_PLAN.md`
2. `docs/PLAN.md`
3. `docs/parallel-workstreams/README.md`
4. `docs/parallel-workstreams/agent-02-app-shell-state/PLAN.md`
5. `js/core/dispatcher.js`
6. `js/core/app-store.js`
7. `js/app.js`

Your mission is to expand the dispatcher/store seam so shell concerns stop depending on broad direct DOM-to-editor orchestration.

Focus areas:

- toolbar state
- startup picker state
- modal state
- export-size and shell preference state
- derived selectors or equivalent shell-state helpers

Rules:

- Stay out of document-schema ownership; coordinate that with Agent 03.
- Leave major tool-lifecycle refactors to Agent 06 unless you need a thin adapter.
- Migrate one user flow at a time; do not attempt a full app-shell rewrite in one pass.

Expected first output:

1. An inventory of shell state still living outside the store.
2. A prioritized migration list for shell flows.
3. One implemented medium-sized flow moved behind dispatcher/store boundaries.

Completion criteria for your first slice:

- the migrated flow is understandable through dispatched intents and store updates,
- direct shell-to-editor coupling is reduced for that path, and
- the app remains behaviorally stable.