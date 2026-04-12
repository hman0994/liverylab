# QA Tester Guide

Use this folder when you are running a manual QA pass for Livery Lab.

## Folder layout

- `README.md` explains how general testers should run a pass.
- `MANUAL-TEST-CHECKLIST.md` is the master checklist template.
- `QA-TEST-PLAN.md` is the team signoff and merge-gate plan.
- `Tests/` holds per-slice browser-specific checklist copies.
- `fixtures/saves/` holds saved-project fixtures for regression testing.
- `templates/` holds copied template files that QA can use without browsing the full template library.
- `tools/` holds QA helper scripts.

## Which file to use

- Use the checklist copy you were assigned.
- If you were given a browser-specific file, fill out that copy instead of the main template.
- Use `MANUAL-TEST-CHECKLIST.md` when you need a fresh blank checklist.
- Use `Tests/v0.2.0.1-Release/Chrome/MANUAL-TEST-CHECKLIST.md` or `Tests/v0.2.0.1-Release/Edge/MANUAL-TEST-CHECKLIST.md` for the current v0.2.0.1 release validation pass.
- Use `Tests/Slice3-Brush-Fix-Verification/Chrome/MANUAL-TEST-CHECKLIST.md` or `Tests/Slice3-Brush-Fix-Verification/Edge/MANUAL-TEST-CHECKLIST.md` for the earlier post-fix brush verification pass.
- Keep `Tests/Slice2-Brush-Regression/**` as the recorded blocked baseline from the pre-fix regression reproduction.
- For most testers, use Sections 1 through 10 only.
- Use Section 11 only if you are performing a full v0.2.0 release validation or were specifically asked to run an architecture slice merge check.
- For render/export closure checks in Section 11, local preflight steps are allowed first, but final pass or blocked decisions still require browser evidence artifacts.

## Before you start

- Use Windows 11 with the latest Chrome or Edge unless told otherwise.
- Use the live site or a local HTTP server for normal testing.
- Do not use `file://` as your main run mode. That check appears later as a small edge-case test only.
- Start with a fresh page load before a new pass.

## Fill out the metadata block

Complete these fields at the top of the checklist before testing:

- Test owner: your name or handle
- Date: the day you tested
- Slice / branch / PR: the slice, branch, PR, or `general QA pass`
- Browser: the exact browser used
- OS: your operating system
- Run mode: `local HTTP`, `hosted site`, or `file://`
- Overall result: `Pass`, `Pass with issues`, or `Blocked`
- Bug links: any filed issue links
- Notes: short summary of failures, odd behavior, or blockers

## How to mark items

Use one clear result per item:

- `[PASS]` when it worked as expected
- `[FAIL]` when it did not work
- `[PASS W/I]` when the main action worked but something was still wrong
- `[]` only if you did not test that item

If something fails or partly fails, add a short note below it saying:

- what you did
- what happened
- what you expected instead

## What to do

1. Fill in the metadata.
2. Run Smoke first.
3. Work through the checklist in order.
4. Record failures clearly.
5. Finish the final signoff questions after the test pass.

## What not to do

- Do not leave metadata blank.
- Do not mark items as passed if you did not test them.
- Do not treat normal `file://` loading limits as a main app regression when HTTP mode works.
- Do not use Section 11 unless you were asked to.
- Do not stop at the first minor issue unless testing is fully blocked.

## When to mark the run blocked

Set the overall result to `Blocked` if a major issue prevents the rest of the checklist from being completed.

Examples:

- the app does not load
- the canvas cannot be used
- the startup flow fails and testing cannot continue

A good completed checklist should clearly show:

- what environment was used
- what was tested
- what passed
- what failed
- whether testing finished
- whether anything blocks wider testing or release
