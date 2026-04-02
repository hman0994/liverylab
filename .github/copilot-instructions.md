# GitHub Copilot Workspace Instructions: racecarPainter

## Project summary
- **Name:** GR86 Paint Studio (racecarPainter)
- **Type:** Static, client-side web app (no backend, no build system)
- **Stack:** HTML/CSS/Vanilla JS, Fabric.js, Three.js, TGA helper in `lib/tga.js`
- **Primary runtime:** `index.html` with modules under `js/` and styles in `css/style.css`
- **Goal:** Browser-based livery painter for iRacing Toyota GR86 Cup cars (PNG/TGA export + template overlay)

## Important files
- `index.html` (UI markup, controls, modals)
- `js/app.js` (contexts, event wiring, tool mode switching)
- `js/editor.js` (canvas layer/data model, tools, undo/redo, patterns, JSON save/load)
- `js/export.js` (export PNG/TGA, download, reports/toast)
- `lib/tga.js` (TGA decode/encode for iRacing templates)
- `css/style.css` (layout, theme, responsive rules)
- `docs/ARCHITECTURE.md` (core behavior and design assumptions)
- `README.md` (user instructions and deploy path via GitHub Pages)
- `PLAN.md` (roadmap/feature ideas)
- `CHANGELOG.md` (release notes and audit trail for changes)
- `.github/copilot-instructions.md` (primary workspace agent runtime guidance)
- `.github/AGENTS.md` (agent configuration and entry points, if present)
- `/memories/repo/livery-lab.md` (agent-owned persistence log)

## Copilot/GitHub specs for workspace instructions
- This repository follows GitHub Copilot Workflows with these structures:
  - `.github/copilot-instructions.md` for permanent workspace instruction rules
  - `.github/AGENTS.md` for custom agent definitions (optional)
  - `.github/prompts/*.prompt.md` for prepared prompt macros (optional)
- `memories` paths are used by this environment illustration; the agent should treat `/memories/repo` as persistent state recording across sessions.
- For local fallback, this project also keeps a hand-editable `memories/repo/livery-lab.md` with welcome context and action logs.

## Agent behavior guidance
- Prioritize safety and minimal scope: apply changes only to intended features.
- Keep modifications compatible with no-build setup; avoid introducing toolchain requirements unless the issue explicitly calls for it.
- Preferred fix pattern: small incremental patch + simple manual testing by opening `index.html` and verifying behavior in browser.
- If touching export format (TGA/PNG), retain backward compatibility with current `iRacing` naming conventions.
- If adding UI controls, keep consistent with existing UI style (dark theme, float panel layout, keybinding assistance) and maintain keyboard shortcuts documentation in both UI toast text and README where appropriate.
- Always update `CHANGELOG.md` for non-trivial code changes in the `## [Unreleased]` section, with date/version/type, files, and reason.
- Append a short entry to `/memories/repo/livery-lab.md` describing action + files touched, for agent historical memory.
- When no `## [Unreleased]` section exists, create it at the top.
- Before each patch, inspect existing changelog and repo memory to avoid duplicate actions.
- If modifying `.github/copilot-instructions.md` itself, append a changelog entry and memory line describing the instruction update, plus commit that file in same change.
- Agents may safely modify `.github/copilot-instructions.md` as part of evolving policy, but must preserve the “Copilot/GitHub specs” section and avoid removing required directives.


## Common requests (high signal)
- add support for additional car templates (car selector, metadata mapping)
- improve undo/redo performance and layer operations
- fix brush behavior across zoom levels and anti-aliasing edges
- durability of save/load JSON across versions
- online/offline auto-update status for CDN assets

## Guidance for code reviews
- run lint manually by eyeballing DOM query usage and null-safety; no automated lint present.
- keep in plain JavaScript (ES6+), avoid transpilation.
- avoid introducing heavy dependencies; if needed, prefer CDN imports with explicit version.

## Local test checklist (manual)
1. Open `index.html` in browser.
2. Load/unload template and custom image.
3. Draw with brush, erase, fill, shape tool.
4. Export PNG/TGA and verify file size + pixel content.
5. Use undo/redo & export project JSON then import back.

## Suggested prompt templates
- "In `js/editor.js`, optimize the brush stroke path to avoid jitter when the pointer moves quickly, keeping existing live preview behavior."
- "In `js/export.js`, add an option to shrink TGA output to 1024x1024 in addition to 2048x2048 while preserving 32-bit color."
- "In `index.html`, add a settings panel toggle and persist user-selected theme (dark/light) in localStorage."

> NOTE: If you’re asked to generate a new feature, confirm acceptance criteria first (user story + manual test steps).
