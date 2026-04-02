# Livery Lab — Agent Memory Log

## 2026-04-02 — Selection & Editing Fixes (Issue: Notes on Selection & Editing Issues v0.1.0)

**Action:** Fixed remaining selection and interactivity issues in `js/editor.js`.

**Files touched:** `js/editor.js`, `CHANGELOG.md`, `memories/repo/livery-lab.md`

**What was done:**
- `_syncObjectInteractivity`: changed so that when a specific `target` is provided, **only** that
  object is made interactive (selectable/evented). Previously all valid objects stayed selectable in
  select mode, letting mask/decals layers intercept clicks meant for the selected layer.
- `_onSelection(null)`: added `_syncObjectInteractivity(null)` call when selection is cleared in
  select mode, restoring all-objects interactivity so the next click can re-select any valid layer.
- `_restoreToolStateAfterHistoryLoad`: removed `fallbackInteractiveObject` fallback; now passes
  `null` (open/all-selectable) when no prior selection existed, so undo/redo leaves all layers
  clickable rather than locking to an arbitrary layer.
- `_addPsdLayer`: added `perPixelTargetFind: true` so clicks on transparent pixels of PSD layers
  (decals, mask, etc.) fall through to the layer below.
- `uploadImage`: added `perPixelTargetFind: true` to user-uploaded image objects for same reason.
- `_replaceLayerWithImage`: added `perPixelTargetFind` to `oldProps` so the setting survives paint
  merges and layer replacements.
- `_historyStateProperties`: added `'perPixelTargetFind'` so the property is serialized in
  undo/redo state and project JSON saves.
