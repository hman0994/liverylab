# Livery Lab Manual Test Checklist

Use this checklist during QA passes.
This file is written so you can copy it into a per-slice or per-browser QA folder and tick items directly in Markdown.
Check completed items, and record bugs or notes in the metadata block below.

## Test Run Metadata

- Test owner: hman0994
- Date: 2026-04-02
- Slice / branch / PR: Slice1
- Browser: Chrome
- OS: Windows 11
- Run mode: local HTTP
- Overall result:
  - [] Pass
  - [X] Pass with issues
  - [] Blocked
- Bug links:
- Notes:
  - Original line-by-line results below are the first 2026-04-02 pass. See the retest update block for confirmed 2026-04-03 fixes.

## Retest Updates

- Retest date: 2026-04-03
- [PASS] Fill behavior was retested after the follow-up fix and now applies the expected colour change to the intended selected object or target.
- [PASS] Gradient creation was retested and now creates a selectable gradient object after drag.
- [PASS] Text controls were retested and now allow colour, size, and font changes as expected.
- [PASS] Upload/duplicate layer placement was retested and no longer breaks the layers-panel folder structure.
- [PASS] Selection-driven secondary-colour and properties-panel sync issues were retested and now behave as expected.
- [PASS] Layer-opacity undo was retested and now collapses one drag into one undo step.
- [INFO] Upload image is now documented and supported as a toolbar action only; the earlier `U` shortcut note below is historical.

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
- [FAIL] Confirm the color change applies as expected.
- [PASS] Undo and redo the fill.

### Rectangle, circle, line

- [PASS] Draw a rectangle with `R`.
- [PASS] Draw a circle with `C`.
- [PASS] Draw a line with `L`.
- [PASS W/I] Change stroke width and secondary color where applicable.
- [PASS] Confirm each created object can be selected, moved, and deleted.
The secondary color needs exposed on R, C, L, since the line has a color and it is white by default.

### Gradient

- [PASS] Select Gradient with `G`.
- [PASS] Add a gradient layer.
- [FAIL] Confirm the gradient is created and can be selected afterward.
This currently paints the baselayer, instead create a gradient on drag like the R tool.

### Text

- [PASS] Select Text with `T`.
- [PASS] Place text on the canvas.
- [FAIL] Change color, size, and font options if exposed.
- [PASS] Confirm the text remains editable/selectable like other user objects.
There is no size option, only stroke and it does not properly resize the text, just the box. Add options for font selection.
### Upload image

- [PASS W/I] Use Upload Image with the toolbar button or `U`.
- [PASS] Import a PNG logo/decal.
- [PASS] Confirm it appears as a separate editable object.
- [PASS W/I] Move, duplicate, and delete it.
U shortcut does not function. Duplicating, or adding a second image will break the folder structure of the layers, where a second 'paintable area' folder will apear. Deleting the first placed image fixes the UI bug.
---

## 4. Layers Panel

- [PASS] Confirm the layer list updates after creating new paint content.
- [PASS] Select different layers from the panel and confirm the matching object becomes active.
- [PASS] Toggle layer visibility and confirm the canvas updates immediately.
- [PASS] Confirm hidden layers cannot be clicked on the canvas.
- [PASS] Change layer opacity and confirm the visual result updates.
- [PASS] Duplicate a selected object/layer and confirm a new editable item appears.
- [PASS] Delete a layer from the panel or selection tools and confirm it is removed.
- [PASS] Use bring-forward and send-backward controls and confirm layer order changes visibly.
Duping any item breaks the folder structure of layers. Suggest complete overhaul of layer management.
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
- [PASS W/I] Canvas state changes step-by-step in the correct order.
- [PASS] Layer metadata remains coherent enough to keep working.
- [PASS] Previously created objects remain selectable after redo.
When adjusting the layer opacity, it seems many steps are recorded, so you have to undo many, many times.
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

---

## 7. Export Workflow

### Export modal

- [PASS] Open Export Paint.
- [PASS] Confirm the folder hint matches the selected bundled car when applicable.
- [PASS] Confirm `2048x2048` is selected by default.
- [PASS] Switch between `1024x1024` and `2048x2048` and confirm the selected state updates.
- [PASS] Close and reopen the export modal and confirm the last selected export size remains selected for the current session.

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

---

## 9. Browser/Run-Mode Edge Cases

- [] Open the app with `file://` once and confirm whether bundled car loading is blocked in that browser.
- [] Verify the limitation is understood and not mis-filed as an app regression when HTTP mode works.
- [] If localStorage is available, confirm recent cars persist after reload.
- [] If localStorage is unavailable or restricted, confirm the app still remains usable.

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

## 11. Architecture Slice Merge Checklist

Run this checklist for every partial migration slice before merge.

- [] Record the owning workstream or workstreams for the slice.
- [] Confirm the changed files match the owned surface area or have an explicit cross-workstream handoff.
- [] Confirm [QA-TEST-PLAN.md](../../../QA-TEST-PLAN.md) still matches the touched slice boundaries and validation expectations.
- [] Run Smoke first.
- [] Run the workstream-specific checks from the regression map in [QA-TEST-PLAN.md](../../../QA-TEST-PLAN.md).
- [] If the slice changes save/load or document ownership, verify `qa-baseline-2048.json` can still be loaded and exported, or explicitly record that the fixture has not been created yet.
- [] If the slice changes render/export behavior, compare the visible canvas with both PNG and TGA output for the edited feature set.
- [] If the slice changes history behavior, verify one user action still maps to the intended undo unit and that redo clears after a new divergent action.
- [] For the current Agent 04 prototype, verify repeated arrow-key nudges on one selected object collapse into one undo unit after the idle boundary and still clear redo after a divergent action.
- [] If the slice changes tool or workspace behavior, verify toolbar state, shortcut state, inspector state, and layer-panel state stay aligned.
- [] Log every accepted temporary limitation in the transition-state risk table in [QA-TEST-PLAN.md](../../../QA-TEST-PLAN.md); do not leave it only in chat or reviewer memory.
- [] Do not merge if a dependency drift, undocumented adapter, or unverified shared-contract assumption is still open.