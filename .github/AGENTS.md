# AGENTS.md — racecarPainter

This repository uses GitHub Copilot agent customization 1.0 patterns.

## Custom agent definitions
- `default` is provided by the extension and uses `.github/copilot-instructions.md` as the baseline instructions.
- Custom agents can be added by including an agent manifest file in `.github/agents/` if needed.

## Agent behavior contracts
- Use `.github/copilot-instructions.md` for workspace policies and per-task guidance.
- Track persistent status in `/memories/repo/livery-lab.md`.
- Ensure “changelog first” rule before any production code commit.

## Memory API convention
- In this workspace, `/memories/repo/...` and `/memories/session/...` are agent-managed state storage keys.
- The memory API is explicit and orthogonal to Git operations: it stores agent reasoning/action history (not required for project runtime).
- Local `.md` files (like `memories/repo/livery-lab.md`) can be edited directly by the agent to persist its activity.

## Self-update policy
- Agents are permitted to update `.github/copilot-instructions.md` as needed, but must include a changelog line in `CHANGELOG.md` and memory append line in `memories/repo/livery-lab.md` when doing so.
- Updates to the agent instructions should not delete the core instructions section and should preserve the “Copilot/GitHub specs” statements.
