# Livery Lab — Architecture Reference

> Agent reference document. Describes code structure, file responsibilities, key
> patterns, and known quirks. Update when new patterns are introduced.

---

## Runtime Environment

- **No build step.** All files served as-is (GitHub Pages / `file://`).
- **Script load order** (bottom of `index.html`):
   1. `js/vendor/tga.js` → exposes `TGA` global
  2. `js/export.js`    → exposes `exportPNG`, `exportTGA`, `showToast`, `triggerDownload`
  3. `js/editor.js`    → exposes `PaintEditor` class
  4. `js/core/dispatcher.js` → exposes `window.LiveryLabDispatcher`
  5. `js/core/app-store.js`  → exposes `window.LiveryLabAppStore`
   6. `js/version.js`   → exposes `window.LIVERY_LAB_VERSION` for the visible top-bar version badge
   7. `js/app.js`       → `DOMContentLoaded` handler, wires everything together
- **CDN libs** (loaded in `<head>`):
  - `fabric.min.js` v5.3 → `window.fabric`
  - `ag-psd/bundle.js` v30.1.0 → `window.agPsd`

---

## Migration Contract Baseline (2026-04-02)

Current reality:
- Runtime logic still lives primarily in `js/app.js`, `js/editor.js`, and `js/export.js`.
- `js/core/dispatcher.js` and `js/core/app-store.js` now provide the first concrete app-shell seam for export-modal state, but most shell and editor orchestration still remains in `js/app.js`.
- `js/core/**`, `js/ui/**`, and adapter modules are the target migration seams, not the current implementation shape.
- New extraction work should move code toward these seams without assuming they already exist in the workspace.

### Module Boundary Map

| Area | Owns | May depend on | Must not own |
|---|---|---|---|
| `js/core/**` | State models, command handlers, history, render contracts, tool contracts, selectors, pure orchestration | Other `js/core/**` modules and stable adapter interfaces | Direct DOM access, `window` globals, Fabric object identity as source of truth, file-input wiring |
| `js/ui/**` | DOM queries, event listeners, panel rendering, modal state wiring, keyboard shortcuts, view-model mapping from store/document selectors | `js/core/**` public contracts and adapter entry points needed for browser interaction | Durable document mutations outside commands, export/render rules, direct layer-data ownership |
| Adapter / integration seams | Translation between core contracts and browser or third-party APIs such as Fabric, PSD decode, TGA encode, local storage, fetch, file IO, and downloads | Browser APIs, vendor globals, `js/core/**` contracts | Business rules that define document shape, app policy, or history semantics |

Target subdomains inside `js/core/**`:
- `js/core/app/**` for app-shell store, dispatch, selectors, and app-level actions.
- `js/core/document/**` for `EditorDocument`, migrations, selection model, and document selectors.
- `js/core/commands/**` for command definitions, execution, and validation.
- `js/core/history/**` for transactions, checkpoints, and undo/redo policy.
- `js/core/render/**` for compositor contracts and export-facing raster composition.
- `js/core/tools/**` for tool controller interfaces and per-tool runtime coordination.

Preferred adapter seams once extraction begins:
- `js/adapters/fabric/**` for Fabric canvas lifecycle and object translation.
- `js/adapters/io/**` for project load/save, template fetch, file upload, and downloads.
- `js/adapters/codecs/**` for PSD and TGA translation.

### State Ownership Matrix

| State domain | Examples | Owner | Serialized / history rule |
|---|---|---|---|
| App-shell state | active tool id, open modal, picker query/filter, recent cars, selected export size, panel collapse state, active document id | app-shell store in `js/core/app/**` | Never serialized into project files; history only records app-shell actions when the UX explicitly requires undoable shell behavior |
| Document state | artboard dimensions, layer stack, layer metadata, background, template metadata, car/export profile, guides, durable selection anchors | `EditorDocument` in `js/core/document/**` | Canonical source of truth for save/load and for history-affecting mutations |
| Transient tool / UI state | pointer drag preview, brush sample path, marquee bounds, hover state, pending text entry, toast queue, in-flight progress flags | tool controllers in `js/core/tools/**`, plus `js/ui/**` controllers for pure UI affordances | Never serialized; never treated as committed history until promoted into a command |

State rule details:
- Selected car metadata belongs to document state once the document contract exists; picker filters and recent-car convenience remain app-shell state.
- Viewport zoom/pan and active selection focus are document-owned session state, but the first serialized schema should exclude them unless a later ADR explicitly opts in.
- UI code may cache derived view models, but ownership stays with the source store or document contract.

### Command And Event Naming Rules

- Commands use lower-case dotted names and imperative verbs: `app.tool.set`, `app.modal.open`, `document.layer.add`, `document.stroke.commit`, `history.undo`.
- Events use lower-case dotted names and describe facts after handling: `app.tool.changed`, `document.layer.added`, `document.stroke.committed`, `history.undo.applied`.
- Async flows use `*.request`, `*.succeeded`, and `*.failed` suffixes when the distinction matters: `io.project.load.request`, `io.project.load.succeeded`, `io.project.load.failed`.
- Command namespaces follow the owning state domain: `app.*`, `document.*`, `history.*`, `render.*`, `io.*`, `tool.*`.
- Do not use vague names such as `updateState`, `changeLayer`, `handleExport`, or `setData` for shared contracts.
- UI events from buttons, keyboard shortcuts, or pointer handlers should be translated at the boundary into commands rather than leaking DOM terminology into core contracts.

### High-Risk Overlap Zones

| Zone | Why it is risky | Agents that must coordinate |
|---|---|---|
| Active tool, active layer, and selection ownership | Current behavior is split implicitly across `js/app.js` and `js/editor.js`; moving one part without the others will break tool routing and undo semantics | 02, 03, 04, 06 |
| Command names for user intents versus committed mutations | Agent 02 needs shell-intent names, Agent 04 needs history-safe mutation names, and Agent 06 needs tool lifecycle names | 02, 04, 06 |
| Document schema fields needed by render/export | Agent 03 defines layer/document records while Agent 05 consumes them for compositing and export parity | 03, 05, 07 |
| Fabric extraction boundary inside `js/editor.js` | Selection, hit-testing, raster merges, and preview behavior are still co-located; concurrent refactors can easily cause drift | 03, 05, 06 |
| Architecture docs and ADR updates | Shared terminology has to stay stable across plans, implementation slices, and QA docs | 01 plus the agent changing the boundary |

### Render And Export Contract Baseline (Agent 05, 2026-04-02)

Current hotspot summary:

| Area | Current path | Root pain point |
|---|---|---|
| Brush merge | `_onPathCreated()` -> `_mergeObjectOntoLayer()` -> `_rasterizeFabricObject()` -> `_replaceLayerWithImage()` | One localized stroke still creates a full-size `fabric.StaticCanvas`, full-size merge canvas, PNG encode/decode hop, and full Fabric image replacement |
| Fill | `_doFill()` -> full-layer offscreen draw -> full `ImageData` scanline fill -> `_replaceLayerWithImage()` | Correctly layer-scoped, but still whole-surface read/modify/write with PNG encode/decode for every committed fill |
| Export | `exportPNG()` / `exportTGA()` -> `getExportImageData()` -> temporary live-scene visibility mutation -> `canvas.toDataURL()` -> redraw into temp canvas | Export truth depends on incidental Fabric scene state instead of a stable compositor contract |
| Layer ownership | `EditorDocument v1` publishes metadata, but pixels still live in Fabric image elements inside `bridge.fabricCanvas` | Document ids exist, but viewport and export do not yet consume a shared layer-surface registry |

First shared compositor target:

- Document owns ordered layer records and render-relevant metadata: `id`, `role`, `visible`, `opacity`, `blendMode`, `transform`, `bounds`, and `payloadRef`.
- `js/core/render/**` owns surface lookup and composition using a surface registry keyed by document layer id.
- Fabric remains an interaction and preview adapter during migration; it is not the long-term raster owner.
- Export and viewport base rendering must call the same compositor and differ only by target size and render policy.
- PNG and TGA remain codec wrappers over the same composed `ImageData`.

First compositor contract:

```js
composeDocument({
   document,
   targetWidth,
   targetHeight,
   surfaceRegistry,
   policy,
   dirtyRect = null,
}) => {
   canvas,
   imageData,
   composedLayerIds,
}
```

Stable policy fields:

```js
{
   mode: 'viewport' | 'export',
   includeTemplate: boolean,
   includeGuides: boolean,
   includeSpecMap: boolean,
   includeTransientPreview: boolean,
}
```

Invalidation baseline:

- `layer.content.changed` invalidates the affected layer surface and dirty rect.
- `layer.props.changed` keeps the surface but invalidates composite output for that layer bounds.
- `stack.changed` invalidates composition ordering from the earliest changed stack position upward.
- `document.resized` invalidates every surface and composite cache.
- `preview.changed` is viewport-only and must not dirty committed export output.

Narrow migration target:

- First shared path covers committed raster image layers only.
- Supported composition stays limited to current `source-over` plus eraser `destination-out` semantics.
- Template, guide, and spec-map exclusion becomes policy-driven instead of live-scene mutation.
- Text, shapes, and other transient previews remain Fabric-managed overlays until later tool-runtime work defines a cleaner preview contract.

Coordination boundary:

- Agent 03 owns the mapping from document layer records to payload references; Agent 05 consumes that mapping and must not invent a second identity model.
- Agent 06 owns transient tool preview behavior; Agent 05 treats those previews as optional viewport overlays outside the committed compositor output.

---

## File Responsibilities

### `index.html`
The entire single-page UI. Contains:
- `<head>` — CDN script tags, viewport meta, SEO meta
- Hidden `<input type="file">` elements (triggered programmatically)
- `#toast-root` — notification container
- `#template-modal` — startup car/template picker modal with category filter, search, and bundled dropdown results
- `#export-modal` — resolution + format picker
- `#app` — CSS Grid shell:
   - `#topbar` — full logo, version badge, car label, save/load/export buttons
  - `#toolbar` — left sidebar tool buttons with keyboard shortcut tooltips
  - `#canvas-wrap > #canvas-inner > #paint-canvas` — scrollable canvas viewport
  - `#right-panel` — Properties section + Layers section
- `<footer>` with zoom controls
- Script tags (load order above)

**CSS Grid layout** (`#app`):
```
grid-template-areas:
  "topbar  topbar  topbar"
  "toolbar canvas  panel"
  "bottom  bottom  bottom"
```
Columns: `56px | 1fr | 280px`
Rows: `52px | 1fr | 44px`

---

### `css/style.css`
Single stylesheet. Dark theme. Key CSS custom properties:
```css
--bg:          #111111    /* page background */
--surface:     #1a1a1a    /* topbar/modal background */
--panel:       #222222    /* right sidebar */
--accent:      #a8ff1e    /* neon lime — primary brand colour */
--accent2:     #fff35a    /* bright yellow — secondary */
--toolbar-w:   56px
--panel-w:     280px
--topbar-h:    52px
--bottombar-h: 44px
```
No CSS preprocessor. All selectors are flat.

Recent header updates:
- `.logo img` now renders the full-width `assets/brand/fullLogo.png` asset instead of the compact mark + text treatment
- `.app-version` styles the visible version badge shown beside the current car label

Recent additions:
- `.car-category-chip` — category-filter chips for the startup picker
- `.car-list-option` — bundled car browser rows in the template modal
- `.car-list-empty` — empty-state styling for modal search

---

### `js/editor.js` — `PaintEditor` class

Central canvas manager. Wraps Fabric.js.

**Constructor args:** `canvasId` (string, e.g. `'paint-canvas'`)

**Key state properties:**
| Property | Type | Purpose |
|---|---|---|
| `ART_W`, `ART_H` | number | Art canvas dimensions (default 2048×2048) |
| `canvas` | `fabric.Canvas` | Fabric.js instance |
| `currentTool` | string | Active tool name |
| `primaryColor` | string | Hex colour for brush/shapes/text |
| `brushSize` | number | Freehand brush width in pixels |
| `opacity` | number | 0–1, for new objects |
| `currentZoom` | number | Current zoom factor (0.05–3.0) |
| `_undoStack` | string[] | JSON snapshots, max 50 |
| `_redoStack` | string[] | Redo snapshots |
| `_templateObject` | fabric.Image\|null | The locked template overlay |
| `_activeLayer` | fabric.Image\|null | Currently targeted paint layer |
| `onLayersChanged` | function\|null | Callback → triggers layer panel re-render |
| `onSelectionChanged` | function\|null | Callback → triggers properties panel sync |

### `templates/cars.json`
Static manifest for bundled car templates.

Each entry contains:
- `name` — user-facing car name
- `file` — PSD filename in `/templates`
- `folder` — iRacing paint folder hint used by the export modal and toasts
- `category` — broad class used by the startup picker filter
- `width`, `height` — default template dimensions

The manifest is fetched by `js/app.js` and rendered into the startup modal.

**Tool names (used in `setTool()`):**
`'select'` · `'brush'` · `'eraser'` · `'fill'` · `'rect'` · `'circle'` · `'line'` · `'gradient'` · `'text'`

**Special Fabric object flags:**
| Flag | Meaning |
|---|---|
| `obj.name === '__template__'` | The locked template overlay image |
| `obj._isGuide === true` | Guide/reference overlay — visible but export-locked |
| `obj._isSpecMap === true` | Spec map layer — always locked |
| `obj._groupName` | String: PSD group name this layer belongs to |

**Key public methods:**
| Method | Purpose |
|---|---|
| `setTool(name)` | Switch active tool |
| `setPrimaryColor(hex)` | Update brush/fill/stroke colour |
| `setBrushSize(n)` | Update freehand brush size |
| `setOpacity(v)` | Update opacity for new objects (0–1) |
| `setLayerOpacity(v)` | Set opacity of currently selected layer |
| `setZoom(z)` | Set zoom (0.05–3.0), resizes Fabric canvas |
| `zoomFit()` | Auto-zoom to fit `#canvas-wrap` viewport |
| `resizeArtboard(w, h)` | Resize canvas, clears all content |
| `loadTemplate(dataUrl, opacity)` | Add a flat image as the template overlay |
| `loadPsdLayers(psd)` | Load ag-psd result as multiple named layers |
| `uploadImage(file)` | Add an image file as a new editable layer |
| `addGradient()` | Add a gradient rect layer |
| `addLayer()` | Add a new blank paint layer |
| `deleteLayerByIndex(i)` | Delete a layer by visual index |
| `toggleLayerVisibility(i)` | Toggle visibility of a layer |
| `getLayers()` | Return array of layer descriptor objects |
| `selectLayerByIndex(i)` | Set active selection to a layer |
| `undo()` / `redo()` | History navigation |
| `saveProject()` | Serialize canvas to JSON and trigger download |
| `loadProject(file)` | Load a saved JSON project file |
| `getExportImageData(size)` | Return `ImageData` at specified size (for export) |
| `setTemplateOpacity(v)` | Set `__template__` layer opacity |
| `setBackgroundColor(hex)` | Set canvas background fill |
| `updateActiveColor(hex)` | Update fill/stroke of selected object in place |
| `deleteSelected()` | Delete currently selected objects |
| `duplicateSelected()` | Duplicate currently selected objects |
| `bringForward()` / `sendBackward()` | Z-order manipulation |
| `nudgeSelected(dx, dy)` | Move the selected editable object and record history |
| `setFont(family)` / `setFontSize(n)` | Text tool configuration |
| `setStrokeWidth(n)` | Shape stroke width |

Select-mode behavior keeps all visible editable user layers clickable, so canvas clicks follow normal topmost-visible hit testing. Hidden, guide, spec-map, template, and background layers are kept non-interactive, while paint tools still lock object manipulation until the user returns to Select.

### `js/core/document/document-schema.js`

First explicit `EditorDocument` contract and persistence adapter.

Purpose:
- Own the versioned project-file shape independently from raw Fabric JSON.
- Publish a minimal layer-record contract that history/render work can target.
- Keep legacy Fabric JSON load compatibility through an explicit migration path.

Current public surface on `window.LiveryLabDocument`:
- `CURRENT_EDITOR_DOCUMENT_VERSION`
- `createDocumentSnapshot(editor)`
- `createSessionSnapshot(editor)`
- `normalizeProjectPayload(payload)`
- `getLegacyFabricCanvas(documentPayload)`

#### EditorDocument v1

The saved project file now uses this top-level structure:

```json
{
   "schema": "liverylab.editor-document",
   "kind": "editor-document",
   "version": 1,
   "metadata": {
      "savedAt": "2026-04-02T00:00:00.000Z",
      "source": "Livery Lab"
   },
   "artboard": {
      "width": 2048,
      "height": 2048,
      "backgroundColor": "#ffffff"
   },
   "car": {
      "name": "Acura ARX06 GTP",
      "file": "acura_arx06_gtp.psd",
      "folder": "acuraarx06gtp",
      "width": 2048,
      "height": 2048
   },
   "template": {
      "opacity": 0.3,
      "hasTemplateLayer": true
   },
   "layers": [],
   "bridge": {
      "fabricCanvas": {}
   }
}
```

#### State ownership after the first document slice

Document-owned and persisted:
- Artboard width, height, and background color
- Car/template metadata needed to reopen the same working document context
- Layer records: id, role, type, visibility, lock state, opacity, blend mode, grouping, and transform metadata

Document-owned session state and not persisted in v1:
- Selection anchors: selected object id and active paint-layer id
- Viewport zoom

App-shell state and never part of the project file:
- Active tool button state
- Modal visibility
- Picker query/category filters
- Recent cars
- Export modal open state and one-off UI affordances

#### Layer-record mapping from current runtime

`layers[]` is intentionally not a dump of Fabric objects. The v1 record is a document-facing summary derived from the runtime:

| Current runtime / Fabric source | EditorDocument v1 field | Notes |
|---|---|---|
| `obj._id` | `layers[].id` | Stable document anchor for history/render work |
| `obj.name` | `layers[].name` | Human label for layer stack and future selectors |
| `obj.type` plus guide/template/spec flags | `layers[].layerType`, `layers[].role` | Prevents raw Fabric `type` from becoming the only long-term semantic model |
| `obj.visible` | `layers[].visible` | Durable visibility state |
| `obj.locked`, `obj._isGuide`, `obj._isSpecMap`, special names | `layers[].locked` | Normalized lock ownership |
| `obj.opacity` | `layers[].opacity` | Durable layer opacity |
| `obj.globalCompositeOperation` | `layers[].blendMode` | Shared render/export target field |
| `obj._groupName` | `layers[].groupName` | PSD/import grouping metadata |
| `obj.left`, `obj.top`, `obj.scaleX`, `obj.scaleY`, `obj.angle` | `layers[].transform` | Geometry summary without exposing the whole Fabric payload |
| `obj.width`, `obj.height` | `layers[].bounds` | Minimal size metadata |
| Raw Fabric object identity | `layers[].payloadRef.objectId` | Explicit bridge pointer, not the long-term schema itself |

The actual drawable payload still lives in `bridge.fabricCanvas` for this first slice. That is a transitional adapter field so current runtime behavior keeps working while downstream work moves to document records.

#### Save/load and legacy compatibility strategy

- New saves write `EditorDocument v1` instead of top-level raw Fabric canvas JSON.
- The runtime still restores from `bridge.fabricCanvas` during this slice.
- Older project JSON files that only contain Fabric canvas data are detected as `legacy-fabric-json` and wrapped into `EditorDocument v1` on load.
- Legacy migration preserves editability by deriving `artboard`, `template`, and `layers[]` from the old payload, then storing the original Fabric scene under `bridge.fabricCanvas`.
- If a future schema version is introduced, `normalizeProjectPayload()` is the single upgrade entry point.

### `js/core/dispatcher.js`

Small command bus used by architecture slices that need explicit shell intents without introducing a build step or module loader.

Current usage:

- Routes `app.modal.open`, `app.modal.close`, `app.export.size.set`, and `app.export.request` for the first Agent 02 slice.
- Keeps command naming aligned with the migration contract while the app still runs from global scripts.

### `js/core/app-store.js`

First centralized shell-state store used for app-level UI state.

Current usage:

- Owns export modal visibility and export-size preference state for the migrated export flow.
- Exposes selectors for active modal and export-size reads so `js/app.js` can render shell state without re-owning it.
- Intentionally does not own document or editor state; selected car, layers, and tool lifecycle still live elsewhere until later slices.

**Brush/eraser rasterization (`_onPathCreated`):**
When a freehand stroke finishes, it's merged directly onto the target image layer
using an offscreen canvas + a temporary `fabric.StaticCanvas`. This prevents
stroke objects accumulating in the layer stack, and the final merged result is
recorded as a single undo step instead of separate path/add/remove checkpoints.
Note: creates a full `fabric.StaticCanvas` per stroke (potential perf concern at
high canvas sizes).

**Undo/redo snapshots:**
History snapshots preserve custom layer metadata such as `_groupName`, `_isGuide`,
and `_isSpecMap` so the layers panel can be rebuilt consistently after undo/redo.

### `js/core/history/transaction-history.js`

First transition-stage history module for explicit operation metadata.

Current usage:

- Publishes the initial operation taxonomy for transactional history using Agent 01 naming rules.
- Tracks grouped transaction metadata separately from the legacy snapshot undo stack so the app can migrate incrementally.
- Defines checkpoint boundaries and reversibility classes without requiring a full history-engine cutover.

First-slice operation taxonomy:

| Operation family | Command names | Reversibility | Checkpoint rule |
|---|---|---|---|
| Raster commits | `document.stroke.commit`, `document.fill.apply` | reversible while the snapshot bridge remains in place | one checkpoint per committed user action |
| Layer structure | `document.layer.add`, `document.layer.remove`, `document.layer.order.set` | reversible | one checkpoint per committed mutation |
| Layer properties | `document.layer.visibility.set`, `document.layer.opacity.set`, `document.template.opacity.set` | reversible | one checkpoint per committed mutation |
| Object transforms | `document.object.transform.set` | reversible | may be grouped until an idle or boundary flush |
| Document boundaries | `document.artboard.resize`, `document.template.load`, `io.psd.import.commit`, `io.project.load.commit` | checkpoint-only during transition | force a checkpoint boundary and reset redo |

Transition notes:

- Snapshot history still performs the actual canvas restore during undo and redo.
- Explicit transactions currently describe intent, grouping, and invalidation metadata so the cutover can happen workflow by workflow.
- The first grouped transaction prototype is selection nudging: repeated arrow-key nudges on the same object coalesce into one `document.object.transform.set` transaction until `250ms` of idle time or another history boundary occurs.

---

### `js/export.js`

Standalone functions only (no class). All accessed via `window` globals.

| Function | Signature | Purpose |
|---|---|---|
| `triggerDownload` | `(data, filename)` | Create blob URL, click `<a>` to download |
| `exportPNG` | `async (editor, outputSize, carFolder)` | Export canvas as PNG |
| `exportTGA` | `async (editor, outputSize, carFolder)` | Export canvas as 32-bit TGA |
| `showToast` | `(message, type='')` | Show/dismiss a toast notification |

`showToast` appends a `.toast` div to `#toast-root`, auto-dismisses after 3.5s.
Types: `''` (grey) · `'success'` (green) · `'error'` (red).

---

### `js/vendor/tga.js`

Standalone TGA codec. Exposes `window.TGA` with:
- `TGA.decode(arrayBuffer)` → data URL string
- `TGA.encode(imageData)` → `Uint8Array` (32-bit TGA)

---

## Data Flow

```
User interaction
   │
   ▼
app.js (event listeners)
   │  calls
   ▼
PaintEditor (editor.js)
   │  fires callbacks
   ├─ onLayersChanged  ──► renderLayersPanel() in app.js
   └─ onSelectionChanged ► updatePropertiesFromObject() in app.js

Export button
   │
   ▼
exportPNG() / exportTGA()  (export.js)
   │  calls
   ├─ editor.getExportImageData(size)
   └─ TGA.encode() / canvas.toBlob()
        │
        ▼
    triggerDownload()
```

---

## Key HTML IDs (referenced by JS)

| ID | Element | Used by |
|---|---|---|
| `paint-canvas` | `<canvas>` | `PaintEditor` constructor |
| `toast-root` | `<div>` | `showToast()` |
| `template-modal` | `.modal-backdrop` | template picker |
| `car-category` | `<div>` | startup category-chip group |
| `car-search` | `<input>` | bundled car search |
| `car-list` | `<div>` | bundled car results |
| `export-modal` | `.modal-backdrop` | export flow |
| `car-label` | `<div>` | `updateCarLabel()` |
| `layers-list` | `<div>` | `renderLayersPanel()` |
| `btn-upload-template` | `<button>` | trigger file input |
| `btn-skip-template` | `<button>` | blank canvas |
| `btn-open-export` | `<button>` | open export modal |
| `btn-save-project` | `<button>` | save JSON |
| `btn-load-project` | `<button>` | load JSON |
| `btn-undo`, `btn-redo` | `<button>` | history |
| `btn-delete` | `<button>` | delete selected |
| `btn-duplicate` | `<button>` | duplicate selected |
| `btn-bring-fwd`, `btn-send-bck` | `<button>` | z-order |
| `prop-primary-color` | `<input type="color">` | colour picker |
| `prop-bg-color` | `<input type="color">` | background colour |
| `prop-brush-size` | `<input type="range">` | brush size |
| `prop-opacity` | `<input type="range">` | opacity |
| `layer-opacity` | `<input type="range">` | layer opacity |
| `prop-stroke-width` | `<input type="range">` | stroke width |
| `tmpl-opacity` | `<input type="range">` | template overlay opacity |
| `zoom-slider` | `<input type="range">` | zoom |
| `zoom-label` | `<span>` | zoom % label |
| `input-template-file` | `<input type="file">` | template upload |
| `input-image-file` | `<input type="file">` | decal upload |
| `input-project-file` | `<input type="file">` | project load |
| `export-resolution-hint` | `<strong>` | export resolution hint text |

---

## Known Bugs / Limitations

| # | Severity | Description | Location |
|---|---|---|---|
| 1 |  Medium | Eraser paints white, not transparent — correct for iRacing but wrong for general use | `editor.js:_configureEraser()` |
| 3 | 🟡 Medium | Brush rasterization creates a full `StaticCanvas` per stroke — may lag on 4096 canvas | `editor.js:_onPathCreated()` |
| 4 | 🟠 Low | Built-in car manifest loading depends on `fetch()`, which may be blocked in some `file://` browser contexts | `js/app.js:loadCarManifest()`, startup modal |
