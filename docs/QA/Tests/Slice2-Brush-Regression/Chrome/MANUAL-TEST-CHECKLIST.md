# Livery Lab Targeted QA Checklist

Use this checklist for the current targeted QA pass around the brush regression and the nearby recently landed migration slices.

## Test Run Metadata

- Test owner:
- Date: 2026-04-05
- Slice / branch / PR: Slice2-Brush-Regression
- Browser: Chrome
- OS: Windows 11
- Run mode: local HTTP
- Overall result:
  - [] Pass
  - [] Pass with issues
  - [X] Blocked
- Bug links:
- Notes:

## Scope For This Pass

- Primary goal: reproduce, classify, and close the current brush regression on the cropped committed-raster path.
- Adjacent retest goal: confirm eraser parity because it uses the same cropped shared-surface commit path.
- Nearby regression goal: confirm the recent translate-drag and template-opacity history slices still behave correctly during this pass.
- Keep this pass narrow. Do not expand into a full app regression cycle unless this checklist exposes broader failures.

Suggested baseline environment:

- Windows 11
- Latest Chrome
- Local HTTP server or hosted site

---

## 1. Preflight And Supported Boundary

- [PASS] Open the app and confirm the page finishes loading without a blocking error.
- [PASS] Load one bundled PSD car over local HTTP.
- [PASS] Confirm the canvas is usable and one visible editable image-backed paint layer can be selected.
- [PASS] Confirm the test flow stays on a supported committed-raster image-backed layer that is pixel-aligned, unscaled, and unrotated before the brush checks begin.

---

## 2. Brush Regression Core

- [PASS] Select Brush with `B`.
- [FAIL] Draw one normal brush stroke on the supported active layer and confirm the committed result appears where expected.
The brush stroke does not appear after releasing the mouse cursor.
- [FAIL] Draw one brush stroke that touches an artboard edge and confirm the committed result is not clipped unexpectedly.
Unable to test, brush stroke does not render after placing.
- [FAIL] Draw one brush stroke on a smaller or offset image-backed layer and confirm the committed pixels stay aligned to that layer instead of shifting.
- [FAIL] If the brush regression appears, record exactly which of the three checks failed and whether the failure looks like clipping, offset drift, missing pixels, wrong-target paint, or history corruption.

---

## 3. Eraser Parity Check

- [PASS] Select Eraser with `E`.
- [FAIL] Erase one normal area on the same supported layer and confirm only the intended painted pixels are removed.
- [FAIL] Erase at an artboard edge and confirm the committed removal matches the visible stroke preview without clipped residue.
- [FAIL] Erase on a smaller or offset image-backed layer and confirm the removal stays aligned to the target layer instead of drifting.
Erasing shows same behavior as brush, no erasing happens after drawing a path.

---

## 4. Undo And Redo For The Affected Path

- [] Undo once after a supported brush edit and confirm the full brush change reverts in one step.
- [] Redo once and confirm the same brush edit returns in one step.
- [] Undo once after a supported eraser edit and confirm the full erase change reverts in one step.
- [] Redo once and confirm the same eraser edit returns in one step.
- [] After undoing one brush or eraser edit, make a different new edit and confirm redo for the earlier path is cleared.

---

## 5. Nearby History Slice Retests

- [PASS] Switch to Select with `V`, drag one selected uploaded image, and confirm the object moves correctly.
- [PASS] Undo once and confirm the drag move reverts in one step.
- [PASS] Redo once and confirm the same drag move returns in one step.
- [PASS] Drag the template-opacity slider once and confirm the template plus guide overlays track live during the drag.
- [PASS] Undo once and confirm the template plus guide overlays restore together in one step.
- [PASS] Redo once and confirm the same template-opacity state returns in one step.

---

## 6. Save, Load, And Export Sanity

- [PASS] Save one project JSON after the supported brush or eraser edits plus the nearby-history retest edits.
- [PASS] Refresh the app and load that JSON file.
- [FAIL] Confirm the brush or eraser result still looks correct after load and remains editable.
- [PASS] Export PNG at `1024x1024` and `2048x2048` and confirm both complete.
- [PASS] Export TGA at `1024x1024` and `2048x2048` and confirm both complete.
- [PASS] Compare the visible canvas against the exported output for the touched supported raster content and confirm no obvious parity drift is present.

---

## 7. Result Classification

- [FAIL] Mark this run `Pass` only if brush, eraser, undo or redo, save or load, and export parity all pass on the supported path.
- [] Mark this run `Pass with issues` if the main brush regression is not reproducible but a nearby retest exposed a smaller issue.
- [] Mark this run `Blocked` if the brush regression reproduces or if the supported path cannot be tested reliably.
- [] If the run is not a clean pass, add a short note saying whether the likely fault line is the cropped shared-raster path, a fallback path, or an unclear mixed-state case.