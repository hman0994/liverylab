# Agent Start Prompts

This file indexes the kickoff prompt for each architecture workstream agent.

Use each prompt together with that agent's `PLAN.md`.
The prompt is written to start the agent with the correct scope, guardrails, expected outputs, and handoff behavior.

## Prompts

- [Agent 01 Start Prompt](agent-01-foundation-contracts/START_PROMPT.md)
- [Agent 02 Start Prompt](agent-02-app-shell-state/START_PROMPT.md)
- [Agent 03 Start Prompt](agent-03-document-model-persistence/START_PROMPT.md)
- [Agent 04 Start Prompt](agent-04-history-commands/START_PROMPT.md)
- [Agent 05 Start Prompt](agent-05-render-export-pipeline/START_PROMPT.md)
- [Agent 06 Start Prompt](agent-06-tools-workspace-ui/START_PROMPT.md)
- [Agent 07 Start Prompt](agent-07-qa-cutover-integration/START_PROMPT.md)

## Usage Pattern

1. Give the assigned agent its `PLAN.md` and `START_PROMPT.md`.
2. Tell the agent to stay inside its owned surface area unless the prompt explicitly calls for a documented handoff.
3. Require the agent to update planning docs if it changes shared contracts.
4. Require the agent to report blockers as dependency or ownership issues, not vague uncertainty.

## Shared Expectations

- Keep Livery Lab runnable during migration.
- Prefer additive adapters over broad rewrites.
- Validate the affected behavior before claiming a slice is complete.
- Record docs/changelog updates when the work materially changes repo behavior or planning state.