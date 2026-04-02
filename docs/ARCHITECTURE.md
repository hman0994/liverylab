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
   4. `js/version.js`   → exposes `window.LIVERY_LAB_VERSION` for the visible top-bar version badge
   5. `js/app.js`       → `DOMContentLoaded` handler, wires everything together
- **CDN libs** (loaded in `<head>`):
  - `fabric.min.js` v5.3 → `window.fabric`
  - `ag-psd/bundle.js` v30.1.0 → `window.agPsd`
  - `three.min.js` r128 → `window.THREE`
  - `OrbitControls.js` r128 → `window.THREE.OrbitControls`

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
--accent:      #ff6600    /* orange — primary brand colour */
--accent2:     #00a8e8    /* blue — secondary */
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
- `.car-list-option` / `.car-list-meta` — bundled car browser rows in the template modal
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
| `car-category` | `<select>` | startup category filter |
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
