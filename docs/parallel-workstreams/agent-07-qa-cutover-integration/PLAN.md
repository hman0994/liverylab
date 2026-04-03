# Agent 07 Plan - QA, Cutover, And Integration

## Mission

Keep the modernization effort measurable, testable, and safe to merge by owning baseline metrics, regression coverage, integration cadence, and cutover gates.

## Start Condition

Can start immediately and should remain active across every wave.

## Primary Outcomes

- Capture baseline performance and behavior before risky refactors.
- Keep the QA docs aligned with the architecture migration.
- Define merge gates for each slice.
- Reduce the chance of parallel workstreams drifting into unverified regressions.

## Owned Surface Area

- `docs/QA/QA-TEST-PLAN.md`
- `docs/QA/MANUAL-TEST-CHECKLIST.md`
- integration and cutover sections in planning docs
- any lightweight scripts or notes used strictly for repeatable measurement

## Parallel-Safe Tasks

1. Define baseline scenarios for brush commit, fill, PSD import, undo/redo, PNG export, and TGA export.
2. Map each architecture slice to the tests that must be rerun before merge.
3. Maintain a merge checklist for partial migrations that rely on adapters.
4. Track known temporary regressions or acceptable transition-state limitations.
5. Coordinate final signoff once multiple workstreams land together.

## Dependencies

- Coordinate with all other agents.
- Validate whatever contract changes Agent 01 records.
- Expand QA coverage as Agent 02 through Agent 06 expose new seams.

## Non-Goals

- No ownership of core architecture implementation.
- No feature design ownership outside validation and rollout concerns.

## Deliverables

- Updated baseline and regression expectations for the modernization project.
- Per-slice validation gates.
- An explicit integration checklist for combining parallel workstreams.
- A maintained transition-state risk log so temporary adapters and accepted limitations are recorded outside chat history.

## Definition Of Done

- Every merged architecture slice has known validation requirements.
- Baseline metrics exist for the current hotspots.
- The migration can proceed without relying on memory or ad hoc testing.

## First Execution Slice

1. Publish the baseline measurement scenarios.
2. Tie each current workstream to required regression checks.
3. Define the minimum cutover checklist for partial architecture slices.

## First Slice Source Of Truth

The first slice is complete only when these docs are updated together:

- `docs/QA/QA-TEST-PLAN.md` contains the baseline measurement matrix, workstream regression map, transition-state risks, and final cutover criteria.
- `docs/QA/MANUAL-TEST-CHECKLIST.md` contains the minimum merge checklist used for every partial migration slice.
- This plan continues to point future slices back to those docs instead of relying on chat-only context.

## Early Risk Flags To Raise Immediately

- Any workstream that changes a shared contract without updating its plan or the QA regression map.
- Any slice that claims performance improvement without a repeatable baseline capture method.
- Any adapter period where two systems appear to own the same state but the temporary owner is not documented.
- Any partial cutover where export parity, save/load compatibility, or undo/redo semantics were not rerun.