# Livery Lab Targeted QA Checklist

Use this checklist for the fresh post-fix verification pass after the blocked Slice2 brush-regression run.

## Test Run Metadata

- Test owner:
- Date: 2026-04-05
- Slice / branch / PR: Slice3-Brush-Fix-Verification
- Browser: Edge
- OS: Windows 11
- Run mode: local HTTP
- Overall result:
  - [X] Pass
  - [] Pass with issues
  - [] Blocked
- Bug links:
- Notes:

## Scope For This Pass

- Primary goal: verify that supported-path brush commits now persist after mouse release.
- Adjacent retest goal: verify eraser parity because it uses the same repaired commit seam.
- Boundary goal: confirm one transformed image-backed raster target still commits through the legacy fallback without geometry drift or layer jump.
- Nearby regression goal: confirm the recent translate-drag and template-opacity history slices still behave correctly after the fix.
- Open follow-up goal: track the newer mounted live free-draw checks separately so this recorded pass does not overclaim mounted-base evidence it never executed.
- Keep this pass narrow. Slice2 remains the blocked pre-fix baseline and should not be overwritten.

Suggested baseline environment:

- Windows 11
- Latest Edge
- Local HTTP server or hosted site

---

## 1. Preflight And Supported Boundary

- [PASS] Open the app and confirm the page finishes loading without a blocking error.
- [PASS] Load one bundled PSD car over local HTTP.
- [PASS] Confirm the canvas is usable and one visible editable image-backed paint layer can be selected.
- [PASS] Confirm the main verification flow stays on a supported committed-raster image-backed layer that remains axis-aligned and is either translated or resized without rotation, skew, or negative-scale before the brush checks begin.

---

## 2. Brush Verification

- [PASS] Select Brush with `B`.
- [PASS] Draw one normal brush stroke on the supported active layer and confirm the committed result remains visible after releasing the mouse.
- [PASS] Draw one brush stroke that touches an artboard edge and confirm the committed result is not clipped unexpectedly.
- [PASS] Draw one brush stroke on a smaller or offset or axis-aligned resized image-backed layer and confirm the committed pixels stay aligned to that layer instead of shifting.
- [PASS] Undo once and confirm the full supported-path brush change reverts in one step.
- [PASS] Redo once and confirm the same supported-path brush change returns in one step.

---

## 3. Eraser Verification

- [PASS] Select Eraser with `E`.
- [PASS] Erase one normal area on the same supported layer and confirm only the intended painted pixels are removed.
- [PASS] Erase at an artboard edge and confirm the committed removal matches the visible stroke preview without clipped residue.
- [PASS] Erase on a smaller or offset or axis-aligned resized image-backed layer and confirm the removal stays aligned to the target layer instead of drifting.
- [PASS] Undo once and confirm the full supported-path erase reverts in one step.
- [PASS] Redo once and confirm the same supported-path erase returns in one step.

---

## 4. Fallback Boundary Sanity

- [PASS] Take one image-backed raster layer that is outside the cropped shared-raster support boundary by rotating, skewing, or flipping it with negative scale.
- [PASS] Draw one brush stroke on that transformed target and confirm the edit still commits without the layer jumping, collapsing, or changing its geometry unexpectedly.
- [PASS] Confirm the transformed layer keeps the same visible size, position, and rotation after the brush edit.
- [PASS] Erase once on that same transformed target and confirm the edit still commits without the layer jumping, collapsing, or changing its geometry unexpectedly.
- [PASS] Confirm the transformed layer still keeps the same visible size, position, and rotation after the erase edit.

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
- [PASS] Confirm the brush or eraser result still looks correct after load and remains editable.
- [PASS] Export PNG at `1024x1024` and `2048x2048` and confirm both complete.
- [PASS] Export TGA at `1024x1024` and `2048x2048` and confirm both complete.
- [PASS] Compare the visible canvas against the exported output for the touched raster content and confirm no obvious parity drift is present.

---

## 7. Result Classification

- [PASS] Mark this run `Pass` only if supported-path brush and eraser, the unsupported-target fallback sanity note, undo or redo, save or load, and export sanity all pass.
- [] Mark this run `Pass with issues` if the main supported-path regression is fixed but a smaller nearby or fallback-boundary issue remains.
- [] Mark this run `Blocked` if supported-path brush or eraser still fails, or if the target path cannot be tested reliably.
- [] Add a short note comparing this run against the blocked Slice2 baseline so it is clear whether the original regression is closed.

---

## 8. Open Mounted Live-Base Follow-Up

- [] Confirm one supported translated or axis-aligned resized brush live stroke keeps the mounted shared base active while the live stroke preview stays visible above it.
- [] Confirm one supported translated or axis-aligned resized eraser live stroke keeps the mounted shared base active while the live erase preview stays visible above it.
- [] Confirm one rotated or skewed or negative-scale raster target still falls back to the normal Fabric scene during live Brush or Eraser interaction.
- [] Confirm Brush or Eraser still keeps the normal Fabric fallback path after one undo or redo while the tool remains selected.
- [] Treat these items as open follow-up coverage for the mounted live free-draw slice; they were not part of the originally recorded Slice3 pass above.