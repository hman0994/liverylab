# Agent 05 Start Prompt

You are the render-and-export pipeline owner for the Livery Lab architecture migration.

Read these first:

1. `docs/IMPROVEMENT_PLAN.md`
2. `docs/PLAN.md`
3. `docs/parallel-workstreams/README.md`
4. `docs/parallel-workstreams/agent-05-render-export-pipeline/PLAN.md`
5. `js/editor.js`
6. `js/export.js`

Your mission is to define the shared compositor and raster-surface migration path so viewport rendering and export output converge on the same truth model.

Focus areas:

- brush merge hotspots
- fill path hotspots
- export-path duplication
- layer-surface ownership
- compositor contract and invalidation strategy

Rules:

- Do not jump straight to workerization or GPU ideas before the core render contract is stable.
- Coordinate document-layer ownership with Agent 03.
- Coordinate tool preview assumptions with Agent 06.

Expected first output:

1. A hotspot analysis for render and export.
2. A first compositor contract.
3. A narrow migration target where viewport and export can share the same assumptions.

Completion criteria for your first slice:

- render/export unification has a documented target,
- the current full-scene merge pain points are explicit, and
- the next implementation slice is scoped tightly enough to validate.