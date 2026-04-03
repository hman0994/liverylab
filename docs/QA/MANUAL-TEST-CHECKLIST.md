# Livery Lab Manual Test Checklist

Use this checklist during QA passes.
This file is written so you can copy it into a per-slice or per-browser QA folder and tick items directly in Markdown.
Check completed items, and record bugs or notes in the metadata block below.

## Test Run Metadata

- Test owner:
- Date:
- Slice / branch / PR:
- Browser:
- OS:
- Run mode: local HTTP / hosted site / `file://`
- Overall result:
	- [] Pass
	- [] Pass with issues
	- [] Blocked
- Bug links:
- Notes:

Suggested baseline environment:

- Windows 11
- Latest Chrome or Edge
- Live site or local HTTP server

---

## 1. App Load And First Run

### Smoke

- [] Open the app and confirm the page finishes loading.
- [] Confirm the startup template modal appears immediately.
- [] Confirm the header logo, version badge, toolbar, right panel, and footer controls are visible.
- [] Confirm no obvious broken layout or overlapping controls are present at normal desktop width.

### Template picker

- [] Focus the car search field and confirm results open without typing.
- [] Type part of a car name and confirm the results filter correctly.
- [] Change category chips and confirm results refresh immediately.
- [] Select a bundled car and confirm the modal closes and the canvas loads.
- [] Confirm the top bar updates with the selected car name and resolution.
- [] Reload the app and confirm recent cars appear after a bundled car was previously opened.

### Blank/custom start

- [] Use Start with blank white canvas and confirm the app opens with a blank artboard.
- [] Use Upload custom template and confirm a supported template file can be selected.
- [] If testing a PSD/TGA template, confirm the imported result is visible and usable.

---

## 2. Canvas Navigation And Selection

- [] Switch to Select using the toolbar and the `V` shortcut.
- [] Click a visible editable object and confirm it becomes selected.
- [] Confirm hidden layers do not intercept clicks.
- [] Drag a selected object and confirm it moves correctly.
- [] Use arrow keys to nudge a selected object by 1px.
- [] Use `Shift` + arrow keys to nudge by 10px.
- [] Use `Delete` or `Backspace` to remove the selection.
- [] Undo the deletion and confirm the object returns.

---

## 3. Paint And Shape Tools

For each tool below, verify the toolbar action and any listed keyboard shortcut where applicable.

### Brush

- [] Select Brush with `B`.
- [] Change primary color.
- [] Change brush size.
- [] Draw on the active paint layer.
- [] Confirm the result appears where expected.
- [] Undo and redo the stroke.

### Eraser

- [] Select Eraser with `E`.
- [] Erase part of a painted area.
- [] Confirm only the intended painted area is removed.
- [] Undo and redo the erase.

### Fill

- [] Select Fill with `F`.
- [] Fill the selected object or active layer target.
- [] Confirm the color change applies as expected.
- [] Confirm filling a selected shape or text object updates that object instead of creating a new layer.
- [] Confirm the filled object remains selected after the fill.
- [] Undo and redo the fill.

### Rectangle, circle, line

- [] Draw a rectangle with `R`.
- [] Draw a circle with `C`.
- [] Draw a line with `L`.
- [] Change stroke width and secondary color where applicable.
- [] Confirm each created object can be selected, moved, and deleted.

### Gradient

- [] Select Gradient with `G`.
- [] Add a gradient layer.
- [] Confirm the gradient is created and can be selected afterward.

### Text

- [] Select Text with `T`.
- [] Place text on the canvas.
- [] Change color, size, and font options if exposed.
- [] Confirm the text remains editable/selectable like other user objects.

### Upload image

- [] Use Upload Image with the toolbar button.
- [] Import a PNG logo/decal.
- [] Confirm it appears as a separate editable object.
- [] Move, duplicate, and delete it.

---

## 4. Layers Panel

- [] Confirm the layer list updates after creating new paint content.
- [] Select different layers from the panel and confirm the matching object becomes active.
- [] Toggle layer visibility and confirm the canvas updates immediately.
- [] Confirm hidden layers cannot be clicked on the canvas.
- [] Change layer opacity and confirm the visual result updates.
- [] Change layer opacity, undo once, and confirm the previous opacity is restored in a single step.
- [] Duplicate a selected object/layer and confirm a new editable item appears.
- [] Delete a layer from the panel or selection tools and confirm it is removed.
- [] Use bring-forward and send-backward controls and confirm layer order changes visibly.

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

- [] No crash or frozen UI occurs.
- [] Canvas state changes step-by-step in the correct order.
- [] Layer metadata remains coherent enough to keep working.
- [] Previously created objects remain selectable after redo.

---

## 6. Save And Load Project JSON

- [] Create a small project containing at least brush work, one shape, one text object, and one uploaded image.
- [] Save the project as JSON.
- [] Open the saved JSON once and confirm it contains top-level `schema`, `kind`, and `version` fields.
- [] Refresh the app.
- [] Load the saved JSON project.
- [] Confirm the visible content is restored.
- [] Confirm the layer list is populated correctly.
- [] Confirm restored objects can still be selected and edited.
- [] If you have an older raw Fabric-era project JSON fixture, load it and confirm the app reports a successful legacy migration and restores an editable project.
- [] Export the restored project to confirm load did not break export.

---

## 7. Export Workflow

### Export modal

- [] Open Export Paint.
- [] Confirm the folder hint matches the selected bundled car when applicable.
- [] Confirm `2048x2048` is selected by default.
- [] Switch between `1024x1024` and `2048x2048` and confirm the selected state updates.
- [] Close and reopen the export modal and confirm the last selected export size remains selected for the current session.

### PNG

- [] Export PNG at `1024x1024`.
- [] Export PNG at `2048x2048`.
- [] Confirm both downloads complete.
- [] Confirm success toast text references the expected iRacing folder path.

### TGA

- [] Export TGA at `1024x1024`.
- [] Export TGA at `2048x2048`.
- [] Confirm both downloads complete.
- [] Confirm success toast text explains renaming to `car_XXXXXXXX.tga`.

### Output validation

- [] Confirm the downloaded filenames match the app's current naming behavior.
- [] Open the exported PNG to confirm visible artwork matches the canvas.
- [] If possible, open the TGA in a viewer/editor that supports 32-bit TGA.
- [] Confirm export still works after undo/redo and after loading a saved JSON project.

---

## 8. Layout And Responsiveness

- [] Test at standard desktop width and confirm left toolbar, canvas, and right panel remain usable.
- [] Reduce the browser width gradually and confirm controls remain reachable.
- [] Confirm the startup modal remains readable on a smaller viewport.
- [] Confirm the floating car search dropdown positions correctly and does not detach from the input.
- [] Confirm the export modal remains usable without clipped buttons.

---

## 9. Browser/Run-Mode Edge Cases

- [] Open the app with `file://` once and confirm whether bundled car loading is blocked in that browser.
- [] Verify the limitation is understood and not mis-filed as an app regression when HTTP mode works.
- [] If localStorage is available, confirm recent cars persist after reload.
- [] If localStorage is unavailable or restricted, confirm the app still remains usable.

---

## 10. Final QA Signoff Questions

Before closing the test pass, answer these:

- [] Can a new user open the app and start painting without confusion?
- [] Do the main shortcuts and tool switches behave consistently?
- [] Can a tester complete a full workflow from template selection to export?
- [] Does save/load preserve enough state for real continued editing?
- [] Are any failures severe enough to block team testing or broader release?

If any answer is `No`, file the issue and include the failed checklist section.

---

## 11. Architecture Slice Merge Checklist

Run this checklist for every partial migration slice before merge.

- [] Record the owning workstream or workstreams for the slice.
- [] Confirm the changed files match the owned surface area or have an explicit cross-workstream handoff.
- [] Confirm [QA-TEST-PLAN.md](./QA-TEST-PLAN.md) still matches the touched slice boundaries and validation expectations.
- [] Run Smoke first.
- [] Run the workstream-specific checks from the regression map in [QA-TEST-PLAN.md](./QA-TEST-PLAN.md).
- [] If the slice changes save/load or document ownership, verify `qa-baseline-2048.json` can still be loaded and exported, or explicitly record that the fixture has not been created yet.
- [] If the slice changes render/export behavior, compare the visible canvas with both PNG and TGA output for the edited feature set.
- [] If the slice changes history behavior, verify one user action still maps to the intended undo unit and that redo clears after a new divergent action.
- [] For the current Agent 04 prototype, verify repeated arrow-key nudges on one selected object collapse into one undo unit after the idle boundary and still clear redo after a divergent action.
- [] If the slice changes tool or workspace behavior, verify toolbar state, shortcut state, inspector state, and layer-panel state stay aligned.
- [] Log every accepted temporary limitation in the transition-state risk table in [QA-TEST-PLAN.md](./QA-TEST-PLAN.md); do not leave it only in chat or reviewer memory.
- [] Do not merge if a dependency drift, undocumented adapter, or unverified shared-contract assumption is still open.