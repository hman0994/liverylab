# Agent 01 Plan - Foundation And Contracts

## Mission

Own the shared architectural contracts that let the other agents work in parallel without redefining the system from scratch in each lane.

## Start Condition

Can start immediately.

## Primary Outcomes

- Define the core module boundaries for `js/core`, `js/ui`, and integration adapters.
- Establish the first command, event, and state naming conventions.
- Clarify which seams are stable enough for downstream agents to build against.
- Keep architecture documentation aligned with actual implementation direction.

## Owned Surface Area

- `docs/IMPROVEMENT_PLAN.md`
- `docs/ARCHITECTURE.md`
- `docs/parallel-workstreams/**`
- shared module-boundary decisions affecting `js/core/**`

## Parallel-Safe Tasks

1. Define a proposed target folder layout and responsibility map.
2. Define command/event naming rules for dispatcher-driven flows.
3. Define what belongs in app state versus document state versus transient UI state.
4. Record ADRs for major migration decisions as they become real.
5. Maintain a dependency and collision map for all workstreams.

## Must Coordinate With

- Agent 02 for store and dispatcher boundaries.
- Agent 03 for document ownership boundaries.
- Agent 04 for command semantics.
- Agent 05 for render contract shape.
- Agent 06 for tool lifecycle shape.

## Non-Goals

- No direct feature work in editor tools.
- No history implementation.
- No compositor implementation.
- No UI redesign execution.

## Deliverables

- Updated architecture documentation that reflects the chosen migration seams.
- Stable definitions for command naming, ownership boundaries, and integration touch points.
- A maintained record of what each workstream may edit without prior coordination.

## Definition Of Done

- Other agents can point to a stable set of architectural guardrails.
- Shared terminology is consistent across the planning package.
- High-risk overlap areas are explicitly documented.

## First Execution Slice

1. Publish the initial module-boundary map.
2. Publish the first state-ownership rules.
3. Review the first downstream implementation slices for contract drift.

### First Slice Output Contract

- Module-boundary map covering `js/core/**`, `js/ui/**`, and adapter/integration seams.
- State-ownership matrix covering app-shell state, document state, and transient tool/UI state.
- Shared command/event naming rules with concrete examples other agents can reuse.
- Explicit high-risk overlap zones that require coordination before editing shared seams.