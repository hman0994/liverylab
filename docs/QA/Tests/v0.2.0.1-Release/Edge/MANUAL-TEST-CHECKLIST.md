# Livery Lab v0.2.0.1 Release QA Checklist — Edge

This checklist validates the v0.2.0.1 release in Edge.
Work through every section in order. Record failures with a short note explaining what happened and what you expected.

## Test Run Metadata

- Test owner:
- Date:
- Slice / branch / PR: v0.2.0.1 release QA
- Browser: Edge (latest)
- OS: Windows 11
- Run mode: hosted site (GitHub Pages)
- Overall result:
	- [] Pass
	- [] Pass with issues
	- [] Blocked
- Bug links:
- Notes:

Suggested baseline environment:

- Windows 11
- Latest Edge
- Live hosted site at GitHub Pages, or local HTTP server as fallback

---

## 1. App Load And First Run

### Smoke

- [] Open the app and confirm the page finishes loading without errors.
- [] Confirm the startup template modal appears immediately.
- [PASS] Confirm the header logo, version badge (`v0.2.0.1`), toolbar, right panel, and footer controls are visible.
- [] Confirm no obvious broken layout or overlapping controls are present at normal desktop width.
- [] Collapse and reopen the Properties panel once and confirm the header chevron and body visibility stay aligned.
- [] Collapse and reopen the Layers panel once and confirm the header chevron and body visibility stay aligned.
- [] Collapse one panel, reload the app, and confirm the same Properties/Layers panel collapse state is restored when localStorage is available.
- [] Switch between `Select` and `Brush` once and confirm the Properties groups plus Layers panel still refresh without needing the right panel to be reopened.

### Template picker

- [] Focus the car search field and confirm results open without typing.
- [] Type part of a car name and confirm the results filter correctly.
- [] Change category chips and confirm results refresh immediately.
- [] Reopen the template picker over an already loaded document, press Skip, and confirm the modal closes without changing the current top-bar car label or export-folder hint.
- [] Select a bundled car and confirm the modal closes and the canvas loads.
- [] Confirm the top bar updates with the selected car name and resolution.
- [] Open Export Paint after loading a bundled car and confirm the folder hint matches that selected car.
- [] Reload the app and confirm recent cars appear after a bundled car was previously opened.
- [] Before loading a bundled PSD car, create redoable state first, load the car, and confirm redo is cleared instead of restoring pre-load work across the boundary.
- [] After loading a bundled PSD car, run `editor.getHistoryDebugState()` in DevTools and confirm the latest committed entry is `io.psd.import.commit` with `reversibility: checkpoint-only` and `checkpointBoundary: import-load`.
- [] After loading a bundled PSD car, export PNG or TGA once and confirm the post-boundary export still succeeds.

### Blank/custom start

- [] Use Start with blank white canvas and confirm the app opens with a blank artboard.
- [] Confirm the top bar shows `Blank canvas` with the current resolution after blank start.
- [] Open Export Paint after blank start and confirm the folder hint falls back to `Documents\iRacing\paint\your_car_folder\`.
- [] Use Upload custom template and confirm a supported template file can be selected.
- [] If testing a PSD/TGA template, confirm the imported result is visible and usable.
- [] If testing a custom PSD template, create redoable state first, import the PSD, and confirm redo is cleared instead of restoring pre-import work across the boundary.
- [] While one awaited legacy fallback Brush or Fill commit is still in flight, try to load a bundled or custom PSD template and confirm the current document, shell car label, recent-car state, and success toast do not update until you retry after the paint commit settles.
- [] If testing a custom PSD template, run `editor.getHistoryDebugState()` in DevTools and confirm the latest committed entry is `io.psd.import.commit` with `reversibility: checkpoint-only` and `checkpointBoundary: import-load`.
- [] If testing a custom PSD template, export PNG or TGA once after the import and confirm the post-boundary export still succeeds.
- [] If testing a custom non-PSD template, create redoable state first, load a PNG, JPG, or TGA template, and confirm redo is cleared instead of restoring pre-load work across the boundary.
- [] While one awaited legacy fallback Brush or Fill commit is still in flight, try to load a custom PNG, JPG, or TGA template and confirm the current document, shell car label, and success toast stay unchanged until you retry after the paint commit settles.
- [] If testing a custom non-PSD template whose dimensions match the current artboard, confirm the latest `editor.getHistoryDebugState()` entry is one `document.template.load` checkpoint boundary and that no second adjacent boundary entry is recorded for the same upload.
- [] If testing a custom non-PSD template whose dimensions differ from the current artboard, confirm the canvas resets once to the uploaded resolution and the new template remains visible as the new baseline state.
- [] If testing a custom non-PSD template whose dimensions differ from the current artboard, confirm `editor.getHistoryDebugState()` still shows only one latest `document.template.load` checkpoint boundary for the combined resize-plus-template action.
- [] If testing a custom non-PSD template, run `editor.getHistoryDebugState()` in DevTools and confirm the latest committed entry is `document.template.load` with `reversibility: checkpoint-only` and `checkpointBoundary: import-load`.
- [] If testing a custom non-PSD template, export PNG or TGA once after the load and confirm the post-boundary export still succeeds.
- [] Open Export Paint after loading a custom template and confirm the folder hint still uses `Documents\iRacing\paint\your_car_folder\`.
- [] After loading a custom non-PSD template, confirm the top bar updates to the uploaded template name and measured resolution.
- [] After loading a bundled PSD car, a custom PSD template, or an overlay template, confirm the template-opacity slider reflects the currently loaded document state before you touch it.
- [] Change the template-opacity slider and confirm the template plus guide overlays track live during the drag.
- [] Change the template-opacity slider, undo once, and confirm template plus guide overlays restore together in a single step.
- [] Redo once and confirm the same template-opacity state returns in a single step.
- [] Save a project after changing template opacity, reload it, and confirm the same template-opacity value returns.
- [] Run `editor.getHistoryDebugState()` in DevTools after one template-opacity slider drag and confirm the latest committed entry is `document.template.opacity.set` with reversible semantics and no duplicate adjacent entry for the same drag.

---

## 2. Canvas Navigation And Selection

- [] Switch to Select using the toolbar and the `V` shortcut.
- [] Click a visible editable object and confirm it becomes selected.
- [] Confirm hidden layers do not intercept clicks.
- [] Drag a selected object and confirm it moves correctly.
- [] Drag a selected uploaded image, undo once, and confirm the object returns to its pre-drag position in a single step.
- [] Redo once and confirm the same drag move returns in a single step.
- [] Rotate one selected object if rotate handles are available, undo once, and confirm the object returns to its pre-rotate state in a single step.
- [] Redo once and confirm the same rotate transform returns in a single step.
- [] Scale or resize one selected object if transform handles are available, undo once, and confirm the object returns to its pre-transform state in a single step.
- [] Redo once and confirm the same scale or resize transform returns in a single step.
- [] Use arrow keys to nudge a selected object by 1px.
- [] Use `Shift` + arrow keys to nudge by 10px.
- [] Use `Delete` or `Backspace` to remove the selection.
- [] Undo the deletion and confirm the object returns.

---

## 3. Paint And Shape Tools

For each tool below, verify the toolbar action and any listed keyboard shortcut where applicable.
For one-shot creation tools that should return to select after commit, also confirm the toolbar highlight returns to `Select` when the action completes and the right-panel projected actions resync without a manual refresh.

### Brush

- [] Select Brush with `B`.
- [] Change primary color.
- [] Change brush size.
- [] Draw on the active paint layer.
- [] Confirm the result appears where expected.
- [] Switch into Brush from both the toolbar and `B`, confirm the same active paint layer is retained as before, and confirm leaving Brush does not leave the editor stuck in a transient free-draw state.
- [] Draw one brush stroke that touches an artboard edge on a supported image-backed raster layer and confirm the committed stroke is not clipped unexpectedly.
- [] Draw one brush stroke on a smaller or offset or axis-aligned resized image-backed raster layer and confirm the committed pixels stay aligned to that layer instead of shifting.
- [] Draw one brush stroke on one rotated or skewed or negative-scale existing image-backed raster layer that still stays inside the current committed image-backed blend subset and confirm the visible committed result stays aligned while `editor.getHistoryDebugState()` reports `commitPath: 'shared-surface-commit-only'` instead of the legacy replacement path.
- [] Draw one brush stroke on one axis-aligned existing image-backed raster layer using committed `multiply` or `screen` and confirm the visible committed result stays aligned while `editor.getHistoryDebugState()` reports `commitPath: 'shared-surface-commit-only'`.
- [] Run `editor.getHistoryDebugState()` in DevTools after one committed Brush stroke and confirm the latest committed entry is `document.stroke.commit` with a stable `targetLayerId` plus layer-content invalidation metadata.
- [] Undo once after one committed Brush stroke and confirm the canvas returns to the exact pre-stroke state without leaving a stray standalone path object behind, then redo once and confirm only the committed raster stroke returns.
- [] On one existing image-backed raster layer whose committed stroke reports `commitPath: 'shared-surface'`, undo once and redo once and confirm the same layer is restored as the active paint target after both steps instead of drifting to a different layer.
- [] On one existing image-backed raster layer whose committed stroke reports `commitPath: 'shared-surface-commit-only'`, undo once and redo once and confirm the same layer is restored directly as the active paint target after both steps when the current target still matches the documented committed shared-raster boundary.
- [] On one known awaited legacy fallback Brush target such as an image-backed raster layer using a blend outside the current committed image-backed subset, trigger Undo immediately after mouse-up and confirm history does not step across the in-flight paint commit; once the stroke settles, Undo should remove only the committed raster result in one step.
- [] On a supported committed mixed-content document with a qualifying image-backed raster target, confirm the mounted shared viewport base stays active during one live Brush stroke and is still available again after undo or redo when the restored target still qualifies.
- [] On one committed image-backed raster target using `multiply` or `screen`, confirm live Brush or Eraser still uses the normal Fabric fallback during the stroke and the document returns to the shared committed viewport/export path after the stroke settles if the rest of the document still qualifies.

### Eraser

- [] Select Eraser with `E`.
- [] Erase part of a painted area.
- [] Confirm only the intended painted area is removed.
- [] Switch into Eraser from both the toolbar and `E`, confirm the same active paint layer is retained as before, and confirm leaving Eraser does not leave the editor stuck in a transient free-draw state.
- [] Erase at an artboard edge on a supported image-backed raster layer and confirm the erased edge matches the visible stroke preview without clipped residue.
- [] Erase on a smaller or offset or axis-aligned resized image-backed raster layer and confirm the removal stays aligned to the target layer instead of drifting.
- [] Erase on one rotated or skewed or negative-scale existing image-backed raster layer that still stays inside the current committed image-backed blend subset and confirm the visible committed removal stays aligned while `editor.getHistoryDebugState()` reports `commitPath: 'shared-surface-commit-only'` instead of the legacy replacement path.
- [] Erase on one axis-aligned existing image-backed raster layer using committed `multiply` or `screen` and confirm the visible committed removal stays aligned while `editor.getHistoryDebugState()` reports `commitPath: 'shared-surface-commit-only'`.
- [] Run `editor.getHistoryDebugState()` in DevTools after one committed Eraser action and confirm the latest committed entry is `document.stroke.commit` with the same stable target-layer metadata shape used by Brush.
- [] Undo once after one committed Eraser action and confirm the canvas returns to the exact pre-erase state without leaving a stray standalone path object behind, then redo once and confirm only the committed raster erase returns.
- [] On one existing image-backed raster layer whose committed erase reports `commitPath: 'shared-surface'`, undo once and redo once and confirm the same layer is restored as the active paint target after both steps instead of drifting to a different layer.
- [] On one existing image-backed raster layer whose committed erase reports `commitPath: 'shared-surface-commit-only'`, undo once and redo once and confirm the same layer is restored directly as the active paint target after both steps when the current target still matches the documented committed shared-raster boundary.
- [] On one image-backed raster layer with a blend outside the current committed image-backed subset or another unsupported committed content case, confirm Brush or Eraser still falls back instead of claiming the new commit-only shared-surface path.

### Fill

- [] Select Fill with `F`.
- [] Fill the selected object or active layer target.
- [] Confirm the color change applies as expected.
- [] Confirm filling one selected fillable retained object such as text, rectangle, ellipse, circle, or another currently supported fillable shape updates that same object instead of creating a new layer; confirm a selected line still does not claim that retained fillable-object path.
- [] Confirm the filled object remains selected after the fill.
- [] Run `editor.getHistoryDebugState()` in DevTools after filling a selected retained non-raster fillable object and confirm the latest committed entry is `document.fill.apply` with the retained target id plus invalidation metadata.
- [] Undo once and redo once after one supported retained text fill and confirm the same selected text object plus retained-target routing restore cleanly in one step on the documented targeted replay lane.
- [] If you have one gradient-backed retained rectangle, ellipse, or circle on the current supported fillable-object path, undo once and redo once after filling it and confirm the same selected object plus gradient fill restore cleanly through the retained non-raster targeted replay lane.
- [] If you have a retained non-raster fill case whose target snapshot cannot be rebuilt through the documented retained-object helper path, undo once and redo once and confirm history still falls back cleanly to full snapshot restore.
- [] Select one existing image-backed raster layer that still matches the current translated or axis-aligned resized shared-surface boundary, fill it once, and confirm the selected retained layer updates in place instead of retargeting through a different layer or creating a new one.
- [] Run `editor.getHistoryDebugState()` in DevTools after that supported retained raster fill and confirm the latest committed entry is `document.fill.apply` with the retained target id plus stable `targetLayerId`, `targetOwnership: 'layer-id'`, and `commitPath: 'shared-surface'`.
- [] Undo once and redo once after that supported retained raster fill and confirm the same raster layer plus retained-target routing restore cleanly in one step without forcing a visible full-document fallback, while the layer stays on the documented retained-raster targeted replay lane.
- [] Select one rotated or skewed or negative-scale or committed image-backed `destination-out` or `multiply` or `screen` raster layer, fill it once, and confirm the visible committed output stays aligned while `editor.getHistoryDebugState()` reports `commitPath: 'shared-surface-commit-only'`.
- [] On one retained-raster fill whose committed entry reports `commitPath: 'shared-surface-commit-only'`, undo once and redo once and confirm the same raster layer plus retained-target routing restore directly in one step when the current target still matches the documented committed shared-raster boundary.
- [] Confirm active-layer raster fill still targets the active paint layer and not a different layer.
- [] Run `editor.getHistoryDebugState()` in DevTools after one active paint-layer fill and confirm the latest committed entry is `document.fill.apply` with the active paint-layer id plus invalidation metadata.
- [] On one active paint-layer fill whose committed entry reports `commitPath: 'shared-surface'`, undo once and redo once and confirm the same raster layer returns in one step and remains the active paint target after both steps.
- [] On one active paint-layer fill whose committed entry reports `commitPath: 'shared-surface-commit-only'`, undo once and redo once and confirm the same raster layer returns in one step and remains the active paint target after both steps when the current target still matches the documented committed shared-raster boundary.
- [] On one active paint-layer fill that uses the legacy image-replacement fallback, trigger Undo immediately and confirm history does not step across the in-flight fill commit; once the fill settles, Undo should remove only the committed fill in one step.
- [] On one selected image-backed raster layer with a blend outside the current committed image-backed subset, fill once and confirm the committed entry still uses the documented legacy fallback boundary instead of claiming either shared-surface lane.
- [] Clear the active paint-layer target, fill once, and confirm the blank-layer fallback still creates and fills a new paint layer.
- [] Run `editor.getHistoryDebugState()` in DevTools after that blank-layer auto-create fill and confirm the latest committed entry is `document.fill.apply` with the created target-layer id plus `createdTargetLayer` metadata and no adjacent `document.layer.add` entry for the same action.
- [] After the blank-layer auto-create fill, undo once and confirm the created layer is removed entirely in one step, then redo once and confirm the same filled layer returns cleanly.
- [] After redoing that blank-layer auto-create fill, immediately switch back to Fill and confirm the restored created layer is the active paint target instead of the pre-fill target.
- [] Set fill opacity to `0`, clear the active paint-layer target, fill once, and confirm the no-op path removes the temporary blank layer again instead of leaving an extra empty layer behind while preserving the prior retained-target and active paint-layer routing state.
- [] Undo and redo the fill.

### Rectangle, circle, line

- [] Draw a rectangle with `R`.
- [] Draw a circle with `C`.
- [] Draw a line with `L`.
- [] Confirm the drag preview for rectangle, circle, and line tracks the cursor correctly in every direction.
- [] Start a rectangle, circle, or line drag, switch tools before mouse-up, and confirm the preview is cleared without committing a layer.
- [] Change stroke width and secondary color where applicable.
- [] Confirm each created object can be selected, moved, and deleted.
- [] Undo and redo one rectangle, one circle, and one line and confirm each returns in a single step with the created shape still selectable.
- [] Confirm the toolbar returns to `Select` after each committed rectangle, circle, and line.

### Gradient

- [] Select Gradient with `G`.
- [] Add a gradient layer.
- [] Confirm the gradient is created and can be selected afterward.
- [] Confirm the toolbar returns to `Select` after the gradient commit finishes.

### Text

- [] Select Text with `T`.
- [] Place text on the canvas.
- [] Confirm the inserted text enters editing immediately after the click.
- [] Change color, size, and font options if exposed.
- [] Confirm the text remains editable/selectable like other user objects.
- [] Undo once after placing text and confirm the inserted text layer is removed in a single step.
- [] Redo once and confirm the same text layer returns selected in the same position.
- [] Confirm the toolbar returns to `Select` after placing the text object.

### Upload image

- [] Use Upload Image with the toolbar button.
- [] Import a PNG logo/decal.
- [] Confirm it appears as a separate editable object.
- [] Move, duplicate, and delete it.
- [] Undo once after uploading an image and confirm the inserted image is removed in a single step.
- [] Redo once and confirm the same uploaded image returns selected in the same position.
- [] Confirm the toolbar returns to `Select` after the image import completes.

---

## 4. Layers Panel

- [] Collapse the Layers panel and confirm the list body hides.
- [] Reopen the Layers panel and confirm the previous layer list returns.
- [] After collapsing and reopening the right-panel sections, confirm a layer-row click, one row visibility toggle, and the right-panel duplicate or delete buttons still respond without needing another panel reopen.
- [] Confirm the layer list updates after creating new paint content.
- [] Select different visible unlocked layers from the panel and confirm the matching object becomes active.
- [] While a paint or one-shot creation tool is active, select a visible unlocked layer from the panel and confirm the toolbar returns to `Select` with the same object active.
- [] After one rectangle, circle, line, gradient, or text commit that auto-returns to `Select`, confirm the right-panel duplicate/delete/reorder buttons and selected layer-opacity state resync to the committed projected target without requiring an extra canvas click.
- [] Click one guide, spec-map, hidden, or otherwise protected row in the Layers panel and confirm it does not become the active selection or retarget the active paint layer.
- [] Confirm the background row stays protected in the Layers panel and does not expose a delete action after the projected-id row-action changes.
- [] Clear the selection or point the workspace at one protected or hidden row state and confirm the right-panel duplicate/delete/reorder buttons disable instead of targeting a stale previously selected row.
- [] Toggle visibility from one editable row button and confirm the clicked projected row changes even when nearby rows are hidden or protected.
- [] Re-show one hidden editable row from its own row button and confirm that exact row becomes visible again instead of a different visual-position layer.
- [] Select one text, one line, one gradient-backed object, and one rectangle or circle from both the canvas and the Layers panel, and confirm the Properties panel shows the same groups as before for each selection.
- [] While changing those selections, confirm the projected Properties values stay in sync for primary or secondary colour, text font or size where applicable, and selected layer opacity without requiring a raw-object refresh path.
- [] After selecting one object from the canvas and one from the Layers panel, change primary colour, secondary colour where applicable, selected-object opacity, stroke width where applicable, font family, and font size where applicable, and confirm each write lands on that same projected selected object instead of a different raw active object.
- [] Drag one selected-object opacity or stroke-width control once, pause longer than `250ms` before release, and confirm Undo still restores the pre-drag value in one step instead of stepping through intermediate slider positions.
- [] Use one selected-object colour picker drag once, pause longer than `250ms` before release, and confirm Undo still restores the pre-drag colour in one step instead of stepping through adjacent colour-pick inputs.
- [] After one selected-object Properties change, run `editor.getHistoryDebugState()` in DevTools and confirm the latest committed entry is `document.object.properties.set` with the expected `propertyKey`; for one drag-style control confirm there is no duplicate adjacent entry for the same drag.
- [] Undo once and redo once after one selected-object Properties change and confirm the same object is restored as selected on both steps instead of drifting to a different editable row or target.
- [] While one awaited legacy fallback Brush or Fill commit is still in flight, try one selected-object primary or secondary colour, opacity, stroke-width, font-family, or font-size change and confirm the Properties control snaps back to the real selected-object value instead of leaking that rejected write into the future-drawing defaults path or landing later after the paint commit settles.
- [] After changing one selected object's primary colour or selected-object opacity, clear the selection or switch to a paint/shape tool and confirm future drawing defaults stay at their prior default values instead of inheriting the selected object's edit.
- [] Select a layer from the panel, undo or redo one real edit afterward, and confirm the layer-row click itself did not create a separate undo step.
- [] Save and reload after selecting from the panel and confirm the document content restores normally without treating that panel selection as persisted project state.
- [] Clear the selection or switch from `Select` to a paint or shape tool after selecting an object with a non-default opacity, and confirm the main Properties opacity value resets back to the current editor default instead of keeping the stale selected-object opacity.
- [] Clear the selection or select guide/spec/template content and confirm the layer-opacity slider disables itself instead of staying editable and snapping back only after a failed write.
- [] Toggle layer visibility and confirm the canvas updates immediately.
- [] Hide the currently selected layer and confirm the selection clears instead of staying attached to a hidden layer.
- [] Hide the current active paint layer and confirm painting falls back to the expected visible paint layer instead of staying attached to the hidden target.
- [] Confirm hidden layers cannot be clicked on the canvas.
- [] Toggle layer visibility, undo once, and confirm the previous visibility state is restored in a single step.
- [] Change layer opacity after selecting a layer from the panel and confirm the visual result updates on that same selected projected row.
- [] While one awaited legacy fallback Brush or Fill commit is still in flight, drag the layer-opacity slider and confirm the control snaps back to the real selected-layer opacity instead of leaving the UI at an uncommitted value.
- [] While one awaited legacy fallback Brush or Fill commit is still in flight, confirm row visibility/delete buttons plus the right-panel duplicate/delete/reorder actions disable or otherwise stay blocked in sync with the workspace projection instead of advertising a writable state that the editor is already rejecting.
- [] Change layer opacity, undo once, and confirm the previous opacity is restored in a single step.
- [] After undoing or redoing one layer visibility or layer-opacity change from a panel-selected row, confirm the same selected target and active paint layer are restored instead of drifting to a different row.
- [] Duplicate a selected object/layer with the toolbar button after selecting it from the panel and confirm a new editable item appears from that same selected projected row.
- [] While one awaited legacy fallback Brush or Fill commit is still in flight, trigger Duplicate Selected or Upload Image and confirm no deferred duplicate or uploaded layer appears later after the paint commit settles unless you retry the action.
- [] Undo once after duplicating and confirm the duplicate is removed in a single step.
- [] Redo once and confirm the duplicate returns offset by `+30`/`+30` and remains selected.
- [] Delete a layer from the panel or selection tools and confirm the clicked projected row is the one removed.
- [] Delete a layer from the panel after hiding or showing a nearby row and confirm the delete still removes the clicked projected row instead of a different visual-position layer.
- [] Delete the currently selected layer with `Delete` or `Backspace`, undo once, and confirm the same layer returns in a single step.
- [] Delete a layer from the panel, undo once, and confirm the removed layer returns without leaving the selection attached to a missing layer.
- [] Delete the current active paint layer and confirm the next paint action retargets to the expected visible paint layer instead of the removed layer.
- [] Try to delete locked, template, guide, or spec-map layers and confirm those protected layers remain undeletable.
- [] Select a layer from the panel, use bring-forward and send-backward controls, and confirm the same selected projected row changes order visibly.
- [] Undo and redo one bring-forward or send-backward action and confirm the layer order restores in single steps.
- [] Confirm the same layer stays selected and targeted after bring-forward or send-backward, and after undo and redo of that reorder.

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
- [] For selected-object properties, single-object transforms, layer visibility/opacity, one-step reorder, and template-opacity edits, undo and redo restore the intended selected target and active paint layer in one step.
- [] For supported one-shot `document.layer.add` inserts and narrow single-layer `document.layer.remove` deletes, undo and redo restore the expected layer stack, selected target, and active paint layer in one step without forcing a visible full-document fallback.
- [] For the current targeted paint replay subset, undo and redo restore supported existing-layer Brush/Eraser on both the strict `shared-surface` lane and the broader existing-raster `shared-surface-commit-only` lane, existing paint-layer Fill and retained-object `layer-id` retained-raster Fill on either the strict shared-surface boundary or the broader committed shared-raster boundary, the narrow retained non-raster retained-object Fill helper subset, and deterministic auto-create Fill in one step, while unsupported retained fill states plus legacy-fallback or unsupported paint cases still use the documented fallback lane.
- [] For one replayable no-selection action such as template opacity, commit the change while nothing is selected, click a different fillable object afterward without creating a new history entry, then undo and redo and confirm the replayed null-selection state clears the visible selection; immediately switch to `Fill`, click inside that same later object, and confirm the fill does not treat it as a retained selected-object target unless you explicitly reselect it first.

---

## 6. Save And Load Project JSON

- [] Create a small project containing at least brush work, one shape, one text object, and one uploaded image.
- [] Save the project as JSON.
- [] Open the saved JSON once and confirm it contains top-level `schema`, `kind`, and `version` fields plus `artboard`, `template`, `car`, `layers`, and `bridge.fabricCanvas` entries.
- [] Refresh the app.
- [] Before loading the saved JSON, make one undoable change, undo it once, and confirm redo is available.
- [] Load the saved JSON project.
- [] Confirm the visible content is restored.
- [] Confirm the layer list is populated correctly.
- [] Run `editor.getLiveDocumentMirror({ includeSession: true })` in DevTools after load and confirm the returned artboard, template, car, and ordered layer ids match the restored document and that `session.selection` plus `session.viewport.zoom` reflect the current editor state.
- [] Confirm restored objects can still be selected and edited.
- [] Select a different editable layer, change zoom once, then run `editor.getLiveDocumentMirror({ includeSession: true })` again and confirm the selected-object id or active-layer id plus zoom anchors update without changing the persisted document fields.
- [] Confirm the top bar car label and export folder hint match the restored project car metadata, and confirm the template-opacity plus background-colour controls also match the restored document metadata after load.
- [] Confirm the right-panel duplicate/delete/reorder buttons plus selected layer-opacity control also match the restored workspace projection immediately after load without requiring an extra selection click.
- [] Confirm redo is cleared after the project load and does not restore the pre-load document state.
- [] Undo once after the project load, then redo once, and confirm the layer list still matches the visible document order and the restored project remains editable.
- [] Create or use one deliberately drifted v1 project JSON copy whose top-level `layers[]` order does not match `bridge.fabricCanvas`, load it, and confirm the restored visible document plus layer list follow the bridge payload order instead of the stale `layers[]` order.
- [] Save again after that drifted project load, reopen the newly saved JSON, and confirm its top-level `layers[]` order now matches the restored document order instead of preserving the stale drifted order.
- [] With a valid project still open, try to load one malformed or otherwise invalid project JSON and confirm the error leaves the previous visible document, top-bar car label, template-opacity/background-colour controls, template/background metadata, and `editor.getLiveDocumentMirror({ includeSession: true })` state unchanged after the failed rollback.
- [] After that failed project-load rollback, confirm the right-panel duplicate/delete/reorder buttons plus selected layer-opacity state still match the restored workspace projection instead of the rejected load attempt.
- [] While one awaited legacy fallback Brush or Fill commit is still in flight, try to load a project JSON and confirm the blocked attempt does not cross the boundary, then succeeds from the preserved retry path when you retry after the paint commit settles.
- [] Run `editor.getHistoryDebugState()` in DevTools and confirm the latest committed entry is `io.project.load.commit` with `reversibility: checkpoint-only` and `checkpointBoundary: document-load`.
- [] If you have an older raw Fabric-era project JSON fixture, load it and confirm the app reports a successful legacy migration and restores an editable project.
- [] Export the restored project to confirm load did not break export and the post-boundary export path still works.

## 6A. Standalone Artboard Resize Boundary

- [] Resize the artboard from a non-empty document and confirm the canvas resets once to the new width and height.
- [] Run `editor.getHistoryDebugState()` in DevTools after that resize and confirm the latest committed entry is `document.artboard.resize` with `reversibility: checkpoint-only` and no duplicate adjacent generic snapshot entry for the same resize.
- [] Confirm redo is cleared after the resize boundary and does not restore the pre-resize document.
- [] Confirm selection, active layer, and the right-panel/layers-panel workspace projection all reset cleanly after the resize instead of pointing at stale pre-resize rows.
- [] While one awaited legacy fallback Brush or Fill commit is still in flight, try to resize the artboard and confirm the resize is rejected cleanly with no partial reset and no history entry.
- [] Export PNG or TGA after the resize and confirm the output uses the resized dimensions instead of the pre-resize artboard size.
- [] Save the resized document to project JSON, reload it immediately, and confirm the restored artboard dimensions still match the resized width and height before rechecking export.

---

## 7. Export Workflow

### Export modal

- [] Open Export Paint.
- [] Confirm the folder hint matches the selected bundled car when applicable.
- [] Confirm `2048x2048` is selected by default.
- [] Switch between `1024x1024` and `2048x2048` and confirm the selected state updates.
- [] Close and reopen the export modal and confirm the last selected export size remains selected for the current session.
- [] Reload the app after changing export size and confirm the last selected export size is restored when localStorage is available.

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
- [] If localStorage is available, confirm export size and Properties/Layers panel collapse preferences persist after reload.
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

## 11. Architecture Migration Validation (v0.2.0-Specific)

This section validates the architecture migration that shipped in v0.2.0.
Run Section 11 only if you are performing a full release validation or were specifically asked to check architecture parity.

### Render/Export Merge-Gate Evidence

Complete the evidence rows below. Do not mark any row as Pass unless you attach a note or screenshot confirming the browser result.

| Check ID | Scenario | Pass criteria | Result | Evidence |
|---|---|---|---|---|
| A05-RX-01 | Supported committed mixed-content viewport/export parity | Committed viewport base output and exported PNG/TGA match for the touched edit set. | [] | |
| A05-RX-02 | Policy-driven exclusion rules | Template, guide, and spec-map inclusion/exclusion behavior matches current policy for viewport/export. | [] | |
| A05-RX-03 | Strict shared-surface lane coverage | One artboard-edge Brush/Eraser case and one smaller/offset/axis-aligned resized image-layer alignment case both stay on expected strict lane and visually match export. | [] | |
| A05-RX-04 | Commit-only shared-surface lane | One transformed existing-raster or committed `multiply`/`screen` case stays on commit-only lane and matches export. | [] | |
| A05-RX-05 | Fallback boundary validation | One unsupported committed-content or blend case falls back to legacy without claiming shared-path parity. | [] | |
| A05-RX-06 | Mounted live overlay checks | One single-object transform and one keyboard nudge burst keep mounted base active; unsupported cases suspend/fallback then resume. | [] | |
| A05-RX-07 | Viewport-base helper and canvas reuse | At non-1.0 zoom, `editor.getViewportBaseRenderState()` reports supported output; caller-supplied canvas reuse has no stale state. | [] | |
| A05-RX-08 | Save/load durability after supported edit | Save/load roundtrip preserves expected render/export parity behavior. | [] | |
| A05-RX-09 | Export fallback reason visibility | Unsupported case exports through legacy path and surfaces expected fallback reason in warning. | [] | |

### Architecture History/Replay Checks

- [] Repeated arrow-key nudges on one selected object collapse into one undo unit after the idle boundary and still clear redo after a divergent action.
- [] Drag one selected uploaded image, one text object, and one shape, confirm each drag move maps to one undo unit, and confirm redo clears after a divergent action.
- [] After one translate-only drag confirm `editor.getHistoryDebugState()` reports `mode: 'pointer-move'` for that latest committed transform entry.
- [] On single selected objects run one rotate, one scale or resize, and when the current controls allow it one skew, flip, or mixed transform, confirm each action maps to one undo unit, and confirm redo clears after a divergent action.
- [] After one non-translate single-object transform confirm `editor.getHistoryDebugState()` reports `mode: 'pointer-transform'` plus the expected `kind` and `transformKinds` metadata.
- [] Use one known awaited stroke or fill path, immediately attempt Undo or Redo plus one document-boundary action, and confirm those later actions are ignored while the paint commit is still in flight.
- [] Use one replay-backed Brush or Eraser or active paint-layer Fill case, trigger Undo or Redo, immediately trigger the same history action again before the first replay visually settles, and confirm the second request is ignored until the first replay finishes.
- [] Commit one transformed or committed supported-blend existing-raster Brush/Eraser plus one existing paint-layer Fill and one retained-raster Fill that each report `commitPath: 'shared-surface-commit-only'`, then undo once and redo once for each and confirm the same target layer is restored.
- [] Upload one image, duplicate one selected layer, place one text layer, and commit one rect or circle or line or gradient preview, confirm each maps to one undo unit and redo returns the inserted layer through targeted replay.
- [] Delete one single selected layer and one layer through the panel row action, confirm each maps to one undo unit and undo/redo restores or removes the correct layer.
- [] Verify project load and PSD import both clear redo, stay non-undoable across the boundary, and expose the expected checkpoint-only debug entry.

### Architecture Live Viewport Checks

- [] At one non-1.0 zoom run `editor.getViewportBaseRenderState()` on a supported committed mixed-content document and confirm it reports `supported: true` with current-zoom target dimensions.
- [] Pass the same caller-supplied canvas for two consecutive supported renders and confirm the second result does not inherit stale transform, opacity, or blend state.
- [] Pointer-drag one supported single selected committed layer in select mode and confirm the mounted shared base stays active while only the transformed object renders above it.
- [] Run one short keyboard nudge burst on one selected supported committed layer and confirm the mounted shared base stays active.
- [] Immediately click a different object after one supported keyboard nudge burst and confirm the temporary keyboard live overlay tears down cleanly.
- [] Run one keyboard nudge burst on an unsupported selected target and confirm normal Fabric fallback during the burst, then shared base resumes.
- [] Place or edit one text layer on a supported committed mixed-content document and confirm the editor stays on normal Fabric scene during text editing, then resumes shared base after.
- [] Start one rect or circle or line or gradient preview and confirm the preview stays visible while mounted shared base remains active underneath.
- [] Run one transaction-backed layer mutation such as visibility toggle on a supported document and confirm the mounted shared base resyncs immediately.
- [] Start one Brush or Eraser stroke on a qualifying raster target and confirm the mounted shared base stays active underneath the live stroke preview.
- [] On one rotated or skewed or otherwise unsupported raster free-draw target, confirm Brush or Eraser still stays on the normal Fabric fallback path.
- [] With Brush or Eraser still selected after one undo or redo on a qualifying raster target, confirm the mounted shared base is available again.
