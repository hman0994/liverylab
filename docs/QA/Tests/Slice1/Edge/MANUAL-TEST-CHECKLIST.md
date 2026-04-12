# Livery Lab Manual Test Checklist

Use this checklist during QA passes.
This file is written so you can copy it into a per-slice or per-browser QA folder and tick items directly in Markdown.
Check completed items, and record bugs or notes in the metadata block below.

## Test Run Metadata

- Test owner: hman0994
- Date: 2026-04-02
- Slice / branch / PR: Slice1
- Browser: Edge
- OS: Windows 11
- Run mode: local HTTP
- Overall result:
  - [X] Pass
  - [] Pass with issues
  - [] Blocked
- Bug links:
- Notes:
  - Original line-by-line results below are the first 2026-04-02 pass. The retest and merge-gate closeout blocks record the confirmed 2026-04-03 fixes and final Slice1 signoff.

## Retest Updates

- Retest date: 2026-04-03
- [PASS] Eraser/fill targeting behavior was retested after the follow-up fix and now applies only to the intended target area or selected object.
- [PASS] Gradient creation was retested and now creates a selectable gradient object after drag.
- [PASS] Text controls were retested and now allow colour, size, and font changes as expected.
- [PASS] Upload/duplicate layer placement was retested and no longer breaks the layers-panel folder structure.
- [PASS] Selection-driven secondary-colour and properties-panel sync issues were retested and now behave as expected.
- [PASS] Layer-opacity undo was retested and now collapses one drag into one undo step.
- [INFO] Upload image is now documented and supported as a toolbar action only; the earlier `U` shortcut note below is historical.
- [PASS] Delete-layer and bring-forward/send-backward checks in Section 4 were rerun and now close out Slice1 cleanly in Edge.
- [PASS] Merge-gate retest completed: grouped nudge undo, export modal recovery checks, save/load redo-boundary checks, and workspace-state alignment checks all passed for Slice1.

## Merge-Gate Review Follow-Up

- Review date: 2026-04-03
- Review type: read-only code review against the currently landed transition state
- [REVIEW CLOSED] The targeted manual merge-gate reruns passed for Slice1. No export-modal, grouped-nudge, save/load, or workspace-state regression remains open in this checklist.
- [REVIEW NOTE] Save/load still restores from the transitional `bridge.fabricCanvas` payload even though the saved JSON now publishes `EditorDocument v1` fields. This is currently documented as a known transitional state, not a newly discovered test failure.
- [REVIEW NOTE] Grouped arrow-key nudge history looks intentionally coalesced in code, but the exact undo/redo boundary still needs a manual browser retest before merge-gate signoff.
- [REVIEW NOTE] Toolbar/layers/properties sync is partly driven by the newer workspace-state adapter and partly by direct selection callbacks. Treat the UI-sync checks below as still required even though the main Slice1 regression fixes landed.
- [NEXT ACTION] Slice1 merge-gate evidence is complete in this checklist.

Suggested baseline environment:

- Windows 11
- Latest Chrome or Edge
- Live site or local HTTP server

---

## 1. App Load And First Run

### Smoke

- [PASS] Open the app and confirm the page finishes loading.
- [PASS] Confirm the startup template modal appears immediately.
- [PASS] Confirm the header logo, version badge, toolbar, right panel, and footer controls are visible.
- [PASS] Confirm no obvious broken layout or overlapping controls are present at normal desktop width.

### Template picker

- [PASS] Focus the car search field and confirm results open without typing.
- [PASS] Type part of a car name and confirm the results filter correctly.
- [PASS] Change category chips and confirm results refresh immediately.
- [PASS] Select a bundled car and confirm the modal closes and the canvas loads.
- [PASS] Confirm the top bar updates with the selected car name and resolution.
- [PASS] Reload the app and confirm recent cars appear after a bundled car was previously opened.

### Blank/custom start

- [PASS] Use Start with blank white canvas and confirm the app opens with a blank artboard.
- [PASS] Use Upload custom template and confirm a supported template file can be selected.
- [PASS] If testing a PSD/TGA template, confirm the imported result is visible and usable.

---

## 2. Canvas Navigation And Selection

- [PASS] Switch to Select using the toolbar and the `V` shortcut.
- [PASS] Click a visible editable object and confirm it becomes selected.
- [PASS] Confirm hidden layers do not intercept clicks.
- [PASS] Drag a selected object and confirm it moves correctly.
- [PASS] Use arrow keys to nudge a selected object by 1px.
- [PASS] Use `Shift` + arrow keys to nudge by 10px.
- [PASS] After a short burst of arrow-key nudges on one selected object, undo once and confirm the whole nudge burst reverts as one grouped undo unit.
- [PASS] Undo the grouped nudge, make one different edit, and confirm redo for the old nudge path is cleared.
- [PASS] Use `Delete` or `Backspace` to remove the selection.
- [PASS] Undo the deletion and confirm the object returns.

---

## 3. Paint And Shape Tools

For each tool below, verify both toolbar click and keyboard shortcut where applicable.

### Brush

- [PASS] Select Brush with `B`.
- [PASS] Change primary color.
- [PASS] Change brush size.
- [PASS] Draw on the active paint layer.
- [PASS] Confirm the result appears where expected.
- [PASS] Undo and redo the stroke.

### Eraser

- [PASS] Select Eraser with `E`.
- [PASS] Erase part of a painted area.
- [PASS] Confirm only the intended painted area is removed.
- [PASS] Undo and redo the erase.

### Fill

- [PASS] Select Fill with `F`.
- [PASS] Fill the active area or layer target.
- [PASS] Confirm the color change applies as expected.
- [PASS] Undo and redo the fill.

### Rectangle, circle, line

- [PASS] Draw a rectangle with `R`.
- [PASS] Draw a circle with `C`.
- [PASS] Draw a line with `L`.
- [PASS] Change stroke width and secondary color where applicable.
- [PASS] Confirm each created object can be selected, moved, and deleted.

### Gradient

- [PASS] Select Gradient with `G`.
- [PASS] Add a gradient layer.
- [PASS] Confirm the gradient is created and can be selected afterward.

### Text

- [PASS] Select Text with `T`.
- [PASS] Place text on the canvas.
- [PASS] Change color, size, and font options if exposed.
- [PASS] Confirm the text remains editable/selectable like other user objects.
### Upload image

- [PASS] Use Upload Image with the toolbar button.
- [PASS] Import a PNG logo/decal.
- [PASS] Confirm it appears as a separate editable object.
- [PASS] Move, duplicate, and delete it.
---

## 4. Layers Panel

- [PASS] Confirm the layer list updates after creating new paint content.
- [PASS] Select different layers from the panel and confirm the matching object becomes active.
- [PASS] Toggle layer visibility and confirm the canvas updates immediately.
- [PASS] Confirm hidden layers cannot be clicked on the canvas.
- [PASS] Change layer opacity and confirm the visual result updates.
- [PASS] Change layer opacity, undo once, and confirm the previous opacity is restored in a single step.
- [PASS] Duplicate a selected object/layer and confirm a new editable item appears.
- [PASS] Delete a layer from the panel or selection tools and confirm it is removed.
- [PASS] Use bring-forward and send-backward controls and confirm layer order changes visibly.
---

## 5. Undo And Redo Regression

Run this as one continuous sequence:

1. Load a bundled car.
2. Paint with the brush.
3. Add a shape.
4. Add text.
5. Upload an image.
6. Hide and re-show a layer.
7. Move one selected object.
8. Undo repeatedly back to the earlier state.
9. Redo repeatedly back to the final state.

Expected result:

- [PASS] No crash or frozen UI occurs.
- [PASS] Canvas state changes step-by-step in the correct order.
- [PASS] Layer metadata remains coherent enough to keep working.
- [PASS] Previously created objects remain selectable after redo.
---

## 6. Save And Load Project JSON

- [PASS] Create a small project containing at least brush work, one shape, one text object, and one uploaded image.
- [PASS] Save the project as JSON.
- [PASS] Open the saved JSON once and confirm it contains top-level `schema`, `kind`, and `version` fields.
{
  "schema": "liverylab.editor-document",
  "kind": "editor-document",
  "version": 1,

- [PASS] Refresh the app.
- [PASS] Load the saved JSON project.
- [PASS] Confirm the visible content is restored.
- [PASS] Confirm the layer list is populated correctly.
- [PASS] Confirm restored objects can still be selected and edited.
- [PASS] If you have an older raw Fabric-era project JSON fixture, load it and confirm the app reports a successful legacy migration and restores an editable project.
- [PASS] Export the restored project to confirm load did not break export.
- [PASS] After loading a saved project, confirm redo from the pre-load document does not remain available and that new undo/redo now applies only to the loaded project state.

---

## 7. Export Workflow

### Export modal

- [PASS] Open Export Paint.
- [PASS] Confirm the folder hint matches the selected bundled car when applicable.
- [PASS] Confirm `2048x2048` is selected by default.
- [PASS] Switch between `1024x1024` and `2048x2048` and confirm the selected state updates.
- [PASS] Close and reopen the export modal and confirm the last selected export size remains selected for the current session.
- [PASS] After each PNG and TGA export, confirm template, guide, and spec-map visibility returns to the same visible state the canvas had before export.
- [PASS] No export error left the modal or canvas in a bad state during this rerun.

### PNG

- [PASS] Export PNG at `1024x1024`.
- [PASS] Export PNG at `2048x2048`.
- [PASS] Confirm both downloads complete.
- [PASS] Confirm success toast text references the expected iRacing folder path.

### TGA

- [PASS] Export TGA at `1024x1024`.
- [PASS] Export TGA at `2048x2048`.
- [PASS] Confirm both downloads complete.
- [PASS] Confirm success toast text explains renaming to `car_XXXXXXXX.tga`.

### Output validation

- [PASS] Confirm the downloaded filenames match the app's current naming behavior.
- [PASS] Open the exported PNG to confirm visible artwork matches the canvas.
- [PASS] If possible, open the TGA in a viewer/editor that supports 32-bit TGA.
- [PASS] Confirm export still works after undo/redo and after loading a saved JSON project.

---

## 8. Layout And Responsiveness

- [PASS] Test at standard desktop width and confirm left toolbar, canvas, and right panel remain usable.
- [PASS] Reduce the browser width gradually and confirm controls remain reachable.
- [PASS] Confirm the startup modal remains readable on a smaller viewport.
- [PASS] Confirm the floating car search dropdown positions correctly and does not detach from the input.
- [PASS] Confirm the export modal remains usable without clipped buttons.
- [PASS] While switching tools and selecting different object types, confirm toolbar active state, layers-panel selection state, and properties-panel controls stay aligned with the actual selection.

---

## 9. Browser/Run-Mode Edge Cases

- [PASS] Open the app with `file://` once and confirm whether bundled car loading is blocked in that browser.
- [PASS] Verify the limitation is understood and not mis-filed as an app regression when HTTP mode works.
- [PASS] If localStorage is available, confirm recent cars persist after reload.
- [PASS] If localStorage is unavailable or restricted, confirm the app still remains usable.

---

## 10. Final QA Signoff Questions

Before closing the test pass, answer these:

- [Yes] Can a new user open the app and start painting without confusion?
- [Yes] Do the main shortcuts and tool switches behave consistently?
- [Yes] Can a tester complete a full workflow from template selection to export?
- [Yes] Does save/load preserve enough state for real continued editing?
- [No] Are any failures severe enough to block team testing or broader release?

If any answer (aside from the last item) is `No`, file the issue and include the failed checklist section.

---

## 11. Slice1 Merge-Gate Follow-Up

- [PASS] Re-run the Smoke checks above before marking the slice ready for the next architecture step.
- [PASS] Re-run the export modal checks in Section 7 and record whether any export leaves the canvas in a changed guide/template/spec visibility state.
- [PASS] Re-run the save/load checks in Section 6 and record whether the loaded project starts with a clean redo boundary.
- [PASS] Re-run the grouped nudge checks in Section 2 and record whether one nudge burst still maps to one undo unit.
- [PASS] Re-run the workspace-state alignment check in Section 8 and record whether toolbar, layers, and properties remain in sync.
- [PASS] Final merge-gate decision for Slice1 before the next slice: Pass

---

## 11. Architecture Slice Merge Checklist

Run this checklist for every partial migration slice before merge.

- [PASS] Record the owning workstream or workstreams for the slice.
- [PASS] Confirm the changed files match the owned surface area or have an explicit cross-workstream handoff.
- [PASS] Confirm [QA-TEST-PLAN.md](../../../QA-TEST-PLAN.md) still matches the touched slice boundaries and validation expectations.
- [PASS] Run Smoke first.
- [PASS] Run the workstream-specific checks from the regression map in [QA-TEST-PLAN.md](../../../QA-TEST-PLAN.md).
- [PASS] If the slice changes save/load or document ownership, verify `qa-baseline-2048.json` can still be loaded and exported, or explicitly record that the fixture has not been created yet.
- [PASS] If the slice changes render/export behavior, compare the visible canvas with both PNG and TGA output for the edited feature set.
- [PASS] If the slice changes history behavior, verify one user action still maps to the intended undo unit and that redo clears after a new divergent action.
- [PASS] For the current history prototype, verify repeated arrow-key nudges on one selected object collapse into one undo unit after the idle boundary and still clear redo after a divergent action.
- [PASS] If the slice changes tool or workspace behavior, verify toolbar state, shortcut state, inspector state, and layer-panel state stay aligned.
- [PASS] Log every accepted temporary limitation in the transition-state risk table in [QA-TEST-PLAN.md](../../../QA-TEST-PLAN.md); do not leave it only in chat or reviewer memory.
- [PASS] Do not merge if a dependency drift, undocumented adapter, or unverified shared-contract assumption is still open.