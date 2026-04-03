/**
 * PaintEditor — Fabric.js canvas wrapper for Livery Lab
 *
 * Responsibilities:
 *  - Manage the Fabric.js canvas (2048×2048 "art" space, zoomed into viewport)
 *  - Expose tools: Select, Brush, Eraser, Rectangle, Circle, Gradient, Text, Upload
 *  - Manage an internal undo/redo stack (JSON snapshot approach)
 *  - Provide a locked "template overlay" layer at the bottom of the stack
 *  - Drive the Layers panel in the right sidebar
 *  - Expose helpers used by app.js (colour, opacity, size, zoom)
 *
 * Dependencies:  Fabric.js 5.x loaded globally as `fabric`
 */

class PaintEditor {

  /* ── Constructor ──────────────────────────────────────────── */
  constructor(canvasId) {

    // Canvas dimensions (full iRacing paint resolution)
    this.ART_W = 2048;
    this.ART_H = 2048;

    // Fabric canvas
    this.canvas = new fabric.Canvas(canvasId, {
      width:  this.ART_W,
      height: this.ART_H,
      backgroundColor: '#ffffff',
      preserveObjectStacking: true,
      selection: true,
      stopContextMenu: true,
    });

    // ── Tool state ─────────────────────────────────────────────
    this.currentTool   = 'select';
    this.primaryColor  = '#cc0000';   // brush / fill / stroke / text colour
    this.secondaryColor = '#ffffff';  // gradient second stop, eraser background
    this.brushSize     = 20;
    this.opacity       = 1.0;
    this.strokeWidth   = 3;
    this.currentFont   = 'Arial';
    this.currentFontSize = 120;
    this.blendMode     = 'source-over';
    this.currentZoom   = 0.40;

    // ── Undo/Redo ──────────────────────────────────────────────
    this._undoStack = [];
    this._redoStack = [];
    this._suspendHistory = false;
    this._nextObjectId = 1;
    this._historyStateProperties = ['_id', 'name', 'locked', '_isGuide', '_isSpecMap', '_groupName', 'globalCompositeOperation', 'perPixelTargetFind', '_primaryColor', '_secondaryColor'];
    this._historySession = window.LiveryLabHistory
      ? window.LiveryLabHistory.createHistorySession({ maxEntries: 50, coalesceWindowMs: 250 })
      : null;
    this._pendingHistoryFlushHandle = 0;

    // ── Template reference ─────────────────────────────────────
    this._templateObject = null;
    this._templateOpacity = 1.0;  // mirrors the slider default (100%)
    this.backgroundColor = '#ffffff';

    // ── Shape drawing state (mouse drag) ──────────────────────
    this._isDrawing  = false;
    this._shapeStart = null;
    this._activeShape = null;

    // ── Active layer (target for brush/eraser drawing) ─────────
    this._activeLayer = null;
    this._toolTargetObject = null;
    this._documentContext = { car: null };

    // Track objects whose interactivity was disabled for paint modes
    this._lockedForPaint = [];

    // ── Callbacks set by app.js ───────────────────────────────
    this.onLayersChanged = null;   // () => void
    this.onSelectionChanged = null; // (fabricObj | null) => void
    this.onToolChanged = null;     // (toolName) => void
    this.onDocumentLoaded = null;  // ({ document, migration }) => void

    this._setupEventListeners();
    this._saveState();             // Push initial (blank) state

    this.setZoom(this.currentZoom);
  }

  /* ── Event Wiring ─────────────────────────────────────────── */
  _setupEventListeners() {
    const c = this.canvas;

    // Save state after any modification
    c.on('object:added',     (e) => this._afterChange(e));
    c.on('object:modified',  (e) => this._afterChange(e));
    c.on('object:removed',   (e) => this._afterChange(e));

    // Merge brush/eraser strokes onto the selected layer instead of creating new path objects
    c.on('path:created', (e) => this._onPathCreated(e));

    // Selection
    c.on('selection:created',  (e) => this._onSelection(e.selected[0]));
    c.on('selection:updated',  (e) => this._onSelection(e.selected[0]));
    c.on('selection:cleared',  ()  => this._onSelection(null));

    // Mouse events for shape drawing tools
    c.on('mouse:down',  (e) => this._onMouseDown(e));
    c.on('mouse:move',  (e) => this._onMouseMove(e));
    c.on('mouse:up',    (e) => this._onMouseUp(e));
  }

  /**
   * When the user finishes a brush/eraser stroke, merge the resulting path
   * onto the currently selected (active) layer image rather than leaving
   * it as a separate path object — matching Photoshop's "draw on active layer" behaviour.
   *
   * If no editable layer is selected, the path is kept as a standalone object.
   */
  _afterChange(event) {
    if (this._suspendHistory || this._isTransientCanvasChange(event)) return;
    this._saveState();
    if (this.onLayersChanged) this.onLayersChanged();
  }

  _isTransientCanvasChange(event) {
    const target = event?.target;
    if (!target) return false;

    if (target === this._activeShape) return true;

    if ((this.currentTool === 'brush' || this.currentTool === 'eraser') && target.type === 'path') {
      return true;
    }

    return false;
  }

  _onPathCreated(e) {
    const path = e.path;
    let target = this._activeLayer;

    // Verify the active layer reference is still on the canvas
    if (target && this.canvas.getObjects().indexOf(target) < 0) {
      target = null;
    }

    // Create a blank layer if no valid paint target exists
    if (!this._isValidPaintLayer(target)) {
      target = this._createBlankLayer(false);
    }

    const isErase = this.currentTool === 'eraser';
    this._mergeObjectOntoLayer(target, path, isErase);

    // Remove the original temporary path from the canvas
    this.canvas.remove(path);
  }


  _onSelection(obj) {
    if (obj && !this._isSelectableUserObject(obj)) {
      this.canvas.discardActiveObject();
      this.canvas.renderAll();
      if (this.onSelectionChanged) this.onSelectionChanged(null);
      return;
    }

    if (obj && this._isSelectableUserObject(obj)) {
      this._toolTargetObject = obj;
    } else if (!obj && this.currentTool === 'select') {
      this._toolTargetObject = null;
    }

    if (obj && this._isValidPaintLayer(obj)) {
      this._activeLayer = obj;
    } else if (!obj && ['brush','eraser','fill','rect','circle','line','gradient','text'].includes(this.currentTool)) {
      // Keep the currently selected paint layer active while using any painting tool.
      // Fabric clears selection in drawing/non-selection modes, but we still want targeted drawing.
    } else if (obj && obj.type !== 'image') {
      // Non-image object selected (e.g. text, shape) — don't clear _activeLayer
      // so painting tools still know which image layer to target.
    } else {
      this._activeLayer = null;
    }

    // When selection is cleared in select mode, restore interactivity for all valid
    // objects so the next canvas click can pick any visible layer.
    if (!obj && this.currentTool === 'select') {
      this._syncObjectInteractivity(null);
    }

    if (this.onSelectionChanged) this.onSelectionChanged(obj || null);
  }

  _isValidPaintLayer(obj) {
    return obj && obj.type === 'image' && !obj._isGuide && !obj._isSpecMap && obj.name !== '__template__';
  }

  _isSelectableUserObject(obj) {
    return !!obj &&
      obj.name !== '__template__' &&
      obj.name !== '__background__' &&
      !obj._isGuide &&
      !obj._isSpecMap &&
      !obj.locked &&
      obj.visible !== false;
  }

  _isInteractiveInCurrentMode(obj) {
    if (!this._isSelectableUserObject(obj)) return false;
    return this.currentTool === 'select';
  }

  _syncObjectInteractivity(target = null) {
    this.canvas.getObjects().forEach(obj => {
      // When a specific target is provided: only that object is interactive so that
      // higher-stacked layers (decals, mask) cannot intercept clicks meant for the
      // selected layer.  When target is null: all valid objects are interactive in
      // select mode so the user can click to pick any layer.
      const interactive = target
        ? (obj === target && this._isSelectableUserObject(obj))
        : this._isInteractiveInCurrentMode(obj);
      obj.set({ selectable: interactive, evented: interactive });
    });

    if (target && this._isSelectableUserObject(target)) {
      this.canvas.setActiveObject(target);
    }
  }

  _ensureObjectId(obj) {
    if (!obj) return null;
    if (!obj._id) {
      obj._id = 'layer-' + this._nextObjectId++;
      return obj._id;
    }

    const match = /^layer-(\d+)$/.exec(String(obj._id));
    if (match) {
      this._nextObjectId = Math.max(this._nextObjectId, Number(match[1]) + 1);
    }
    return obj._id;
  }

  _normalizeObjectIds() {
    this.canvas.getObjects().forEach((obj) => this._ensureObjectId(obj));
  }

  _getObjectById(id) {
    if (!id) return null;
    return this.canvas.getObjects().find((obj) => obj._id === id) || null;
  }

  _getDefaultPaintLayer() {
    return this.canvas.getObjects().find(o => this._isValidPaintLayer(o) && o.visible !== false);
  }

  /**
   * Return the canvas insertion index just above the lowest editable paint
   * layer (typically "Base Paint").  New user-created layers are placed here
   * so they don't appear above guide/template overlays at the top of the stack.
   */
  _getInsertIndex() {
    const objects = this.canvas.getObjects();
    for (let i = 0; i < objects.length; i++) {
      if (this._isValidPaintLayer(objects[i])) {
        return i + 1; // just above the first paint layer
      }
    }
    return objects.length; // fallback: top of stack
  }

  _getPreferredInsertIndex(preferredAnchor = null) {
    const objects = this.canvas.getObjects();

    const isUsableAnchor = (obj) => {
      if (!obj) return false;
      const index = objects.indexOf(obj);
      return index >= 0 && obj.name !== '__template__' && obj.name !== '__background__';
    };

    const anchor = isUsableAnchor(preferredAnchor)
      ? preferredAnchor
      : (isUsableAnchor(this.canvas.getActiveObject())
          ? this.canvas.getActiveObject()
          : (isUsableAnchor(this._activeLayer) ? this._activeLayer : null));

    if (anchor) {
      return objects.indexOf(anchor) + 1;
    }

    return this._getInsertIndex();
  }

  /**
   * Create a blank transparent image layer at full art resolution.
   * Used as fallback when a painting tool is invoked with no active layer.
   */
  _createBlankLayer(recordHistory = true) {
    const blank = document.createElement('canvas');
    blank.width = this.ART_W;
    blank.height = this.ART_H;
    const count = this.canvas.getObjects().filter(o =>
      !o._isGuide && !o._isSpecMap && o.name !== '__template__' && o.name !== '__background__').length;
    const img = new fabric.Image(blank, {
      left: 0,
      top: 0,
      name: 'Layer ' + (count + 1),
      selectable: true,
      evented: true,
    });
    const idx = this._getInsertIndex();
    this._ensureObjectId(img);

    const previousSuspendHistory = this._suspendHistory;
    if (!recordHistory) this._suspendHistory = true;
    this.canvas.insertAt(img, idx);
    if (!recordHistory) this._suspendHistory = previousSuspendHistory;

    this.canvas.setActiveObject(img);
    this._activeLayer = img;
    return img;
  }

  _replaceLayerWithImage(target, mergedDataUrl) {
    const idx = this.canvas.getObjects().indexOf(target);
    if (idx < 0) return;

    const oldProps = {
      _id:                      target._id,
      name:                     target.name,
      selectable:               target.selectable,
      evented:                  target.evented,
      locked:                   target.locked,
      opacity:                  target.opacity,
      _isGuide:                 target._isGuide,
      _isSpecMap:               target._isSpecMap,
      _groupName:               target._groupName,
      globalCompositeOperation: target.globalCompositeOperation,
      perPixelTargetFind:       !!target.perPixelTargetFind,
      angle:                    target.angle,
    };

    fabric.Image.fromURL(mergedDataUrl, (newImg) => {
      newImg.set(Object.assign({ left: target.left, top: target.top, scaleX: 1, scaleY: 1 }, oldProps));

      const previousSuspendHistory = this._suspendHistory;
      this._suspendHistory = true;
      this.canvas.remove(target);
      this.canvas.insertAt(newImg, idx);
      this._suspendHistory = previousSuspendHistory;

      this._activeLayer = newImg;
      this.canvas.setActiveObject(newImg);
      this.canvas.renderAll();
      this._saveState();
      if (this.onLayersChanged) this.onLayersChanged();
      if (this.onSelectionChanged) this.onSelectionChanged(newImg);
    }, { crossOrigin: 'anonymous' });
  }

  _rasterizeFabricObject(obj, width, height) {
    const tmpCanvas = document.createElement('canvas');
    tmpCanvas.width = width;
    tmpCanvas.height = height;
    const tmpFabric = new fabric.StaticCanvas(tmpCanvas, { width, height });

    const objClone = fabric.util.object.clone(obj);
    objClone.set({ selectable: false, evented: false });
    tmpFabric.add(objClone);
    tmpFabric.renderAll();

    const resultUrl = tmpCanvas.toDataURL('image/png');
    tmpFabric.dispose();
    return resultUrl;
  }

  _mergeObjectOntoLayer(target, obj, isErase = false) {
    if (!this._isValidPaintLayer(target)) return;

    const AW = this.ART_W;
    const AH = this.ART_H;
    const targetWidth = Math.max(1, Math.round(target.width * target.scaleX));
    const targetHeight = Math.max(1, Math.round(target.height * target.scaleY));
    const offscreen = document.createElement('canvas');
    offscreen.width = targetWidth;
    offscreen.height = targetHeight;
    const ctx = offscreen.getContext('2d');

    // Draw existing target layer
    const targetEl = target.getElement ? target.getElement() : target._element;
    if (targetEl) {
      ctx.drawImage(targetEl, 0, 0, targetWidth, targetHeight);
    }

    // Draw object raster
    const objectDataUrl = this._rasterizeFabricObject(obj, AW, AH);
    const objectImg = new Image();
    objectImg.onload = () => {
      ctx.save();
      ctx.globalCompositeOperation = isErase ? 'destination-out' : 'source-over';
      ctx.drawImage(objectImg, -Math.round(target.left), -Math.round(target.top));
      ctx.restore();

      const merged = offscreen.toDataURL('image/png');
      this._replaceLayerWithImage(target, merged);
    };
    objectImg.src = objectDataUrl;
  }

  /* ── Undo / Redo ──────────────────────────────────────────── */
  _serializeCanvasForDocument() {
    return this.canvas.toJSON(this._historyStateProperties);
  }

  _serializeCanvasState() {
    return JSON.stringify(this._serializeCanvasForDocument());
  }

  _pushHistorySnapshot(json, options = {}) {
    if (this._undoStack[this._undoStack.length - 1] === json) return false;

    this._undoStack.push(json);
    if (this._undoStack.length > 50) this._undoStack.shift();

    if (options.clearRedo !== false) {
      this._redoStack = [];
    }

    return true;
  }

  _clearPendingHistoryFlush() {
    if (!this._pendingHistoryFlushHandle) return;
    window.clearTimeout(this._pendingHistoryFlushHandle);
    this._pendingHistoryFlushHandle = 0;
  }

  _schedulePendingHistoryFlush() {
    if (!this._historySession) return;

    this._clearPendingHistoryFlush();
    this._pendingHistoryFlushHandle = window.setTimeout(() => {
      this._pendingHistoryFlushHandle = 0;
      this._flushPendingHistoryTransaction('idle');
    }, 250);
  }

  _flushPendingHistoryTransaction(reason = 'boundary') {
    this._clearPendingHistoryFlush();

    if (!this._historySession || !this._historySession.hasActiveTransaction()) {
      return null;
    }

    const entry = this._historySession.commitActiveTransaction({
      afterSnapshot: this._serializeCanvasState(),
      afterSelectedObjectId: this.canvas.getActiveObject()?._id || null,
      afterActiveLayerId: this.getActiveLayerId(),
      commitReason: reason,
    });

    if (!entry) return null;

    this._pushHistorySnapshot(entry.afterSnapshot, { clearRedo: true });
    return entry;
  }

  _discardPendingHistoryTransaction(reason = 'reset') {
    this._clearPendingHistoryFlush();
    if (!this._historySession || !this._historySession.hasActiveTransaction()) return null;
    return this._historySession.cancelActiveTransaction(reason);
  }

  _resetHistoryState() {
    this._discardPendingHistoryTransaction('reset');
    this._undoStack = [];
    this._redoStack = [];
    if (this._historySession) this._historySession.reset();
  }

  _saveState() {
    this._flushPendingHistoryTransaction('boundary');
    const json = this._serializeCanvasState();
    this._pushHistorySnapshot(json, { clearRedo: true });
  }

  _restoreToolStateAfterHistoryLoad(selectedObjectId = null, activeLayerId = null) {
    const restoredSelectedObject = this._getObjectById(selectedObjectId);
    const restoredActiveLayer = this._getObjectById(activeLayerId);
    const activeObject = this._isSelectableUserObject(restoredSelectedObject)
      ? restoredSelectedObject
      : null;

    if (this._isValidPaintLayer(restoredActiveLayer)) {
      this._activeLayer = restoredActiveLayer;
    } else if (this._isValidPaintLayer(activeObject)) {
      this._activeLayer = activeObject;
    } else {
      this._activeLayer = this._getDefaultPaintLayer();
    }

    this._lockedForPaint = [];

    if (this.currentTool === 'select') {
      // Restore to the previously active object if one existed; otherwise pass
      // null so all valid objects become selectable (all-open click-to-select).
      this._makeOnlyActiveInteractive(activeObject || null);
      return;
    }

    if (this.currentTool === 'brush') {
      if (this._activeLayer) this.canvas.setActiveObject(this._activeLayer);
      this._configureBrush();
      return;
    }

    if (this.currentTool === 'eraser') {
      if (this._activeLayer) this.canvas.setActiveObject(this._activeLayer);
      this._configureEraser();
      return;
    }

    if (['fill', 'rect', 'circle', 'line', 'gradient', 'text'].includes(this.currentTool)) {
      this._lockObjectsForPainting();
    }
  }

  _loadState(json, onLoaded = null) {
    this._discardPendingHistoryTransaction('load-state');
    this._suspendHistory = true;
    const data = JSON.parse(json);
    if (Number.isFinite(data?.width) && Number.isFinite(data?.height)) {
      this.ART_W = data.width;
      this.ART_H = data.height;
    }

    const backgroundObject = Array.isArray(data?.objects)
      ? data.objects.find((obj) => obj?.name === '__background__')
      : null;
    if (typeof backgroundObject?.fill === 'string') {
      this.backgroundColor = backgroundObject.fill;
    }

    const templateObject = Array.isArray(data?.objects)
      ? data.objects.find((obj) => obj?.name === '__template__')
      : null;
    if (typeof templateObject?.opacity === 'number') {
      this._templateOpacity = templateObject.opacity;
    }

    const zoom = this.currentZoom;
    const selectedObjectId = this.canvas.getActiveObject()?._id || null;
    const activeLayerId = this._activeLayer?._id || null;

    this.canvas.loadFromJSON(data, () => {
      // Restore zoom (loadFromJSON resets the canvas dimensions to the JSON values)
      this.setZoom(zoom);
      // Re-mark the template object reference
      this._templateObject = null;
      this.canvas.getObjects().forEach(obj => {
        if (obj.name === '__template__') {
          this._templateObject = obj;
          obj.selectable = false;
          obj.evented    = false;
        }
      });
      this._normalizeObjectIds();
      this._restoreToolStateAfterHistoryLoad(selectedObjectId, activeLayerId);
      this.canvas.renderAll();
      this._suspendHistory = false;
      if (this.onLayersChanged) this.onLayersChanged();
      if (this.onSelectionChanged) this.onSelectionChanged(this.canvas.getActiveObject() || null);
      if (onLoaded) onLoaded();
    });
  }

  undo() {
    this._flushPendingHistoryTransaction('undo');
    if (this._undoStack.length <= 1) return;
    const cur = this._undoStack.pop();
    this._redoStack.push(cur);
    this._loadState(this._undoStack[this._undoStack.length - 1]);
  }

  redo() {
    this._flushPendingHistoryTransaction('redo');
    if (this._redoStack.length === 0) return;
    const state = this._redoStack.pop();
    this._undoStack.push(state);
    this._loadState(state);
  }

  canUndo() { return this._undoStack.length > 1; }
  canRedo() { return this._redoStack.length > 0; }

  getActiveLayerId() {
    return this._activeLayer?._id || null;
  }

  getDocumentCar() {
    return this._documentContext.car ? { ...this._documentContext.car } : null;
  }

  setDocumentCar(car) {
    this._documentContext.car = car ? { ...car } : null;
  }

  getDocumentSessionState() {
    return {
      selection: {
        selectedObjectId: this.canvas.getActiveObject()?._id || null,
        activeLayerId: this.getActiveLayerId(),
      },
      viewport: {
        zoom: this.currentZoom,
      },
    };
  }

  getWorkspaceState() {
    const activeObject = this.canvas.getActiveObject() || null;

    return {
      tool: {
        active: this.currentTool,
      },
      selection: {
        selectedObjectId: activeObject?._id || null,
        selectedObjectType: activeObject?.type || null,
        activeLayerId: this.getActiveLayerId(),
      },
      layers: this.getLayers(),
    };
  }

  /* ── Zoom ─────────────────────────────────────────────────── */
  setZoom(zoom) {
    zoom = Math.min(Math.max(zoom, 0.05), 3.0);
    this.currentZoom = zoom;
    this.canvas.setZoom(zoom);
    this.canvas.setWidth(Math.round(this.ART_W * zoom));
    this.canvas.setHeight(Math.round(this.ART_H * zoom));
  }

  zoomIn()  { this.setZoom(this.currentZoom + 0.05); }
  zoomOut() { this.setZoom(this.currentZoom - 0.05); }

  /**
   * Resize the art canvas to new dimensions (e.g. read from a PSD).
   * Clears all canvas content and resets the background.
   */
  resizeArtboard(w, h) {
    this._discardPendingHistoryTransaction('artboard-resize');
    this.ART_W = w;
    this.ART_H = h;
    this.canvas.setWidth(w);
    this.canvas.setHeight(h);
    this.canvas.setZoom(1);
    this.canvas.clear();
    this.setBackgroundColor(this.backgroundColor);
    this._resetHistoryState();
    this._templateObject = null;
    this._saveState();
    this.setZoom(this.currentZoom);
    if (this.onLayersChanged) this.onLayersChanged();
  }

  zoomFit() {
    const wrapW = document.getElementById('canvas-wrap').clientWidth  - 40;
    const wrapH = document.getElementById('canvas-wrap').clientHeight - 40;
    const z = Math.min(wrapW / this.ART_W, wrapH / this.ART_H);
    this.setZoom(z);
  }

  /* ── Tool Selection ───────────────────────────────────────── */
  setTool(toolName) {
    // Restore interactivity from previous paint-lock before switching
    this._unlockObjectsForPainting();

    this.currentTool = toolName;
    const c = this.canvas;

    // Notify app.js so toolbar buttons stay in sync (deferred to ensure
    // Fabric event handlers have finished before the DOM update runs).
    if (this.onToolChanged) {
      const cb = this.onToolChanged;
      const name = toolName;
      queueMicrotask(() => cb(name));
    }

    // Ensure active layer is set for painting tools when possible
    if (toolName !== 'select' && toolName !== 'upload-image' && !this._isValidPaintLayer(this._activeLayer)) {
      const fallbackLayer = this._getDefaultPaintLayer();
      if (fallbackLayer) {
        this._activeLayer = fallbackLayer;
        this.canvas.setActiveObject(fallbackLayer);
      }
    }

    // Disengage shape drawing
    this._isDrawing  = false;
    this._activeShape = null;

    switch (toolName) {
      case 'select':
        c.isDrawingMode = false;
        c.selection     = false;  // disable marquee multi-select
        c.defaultCursor = 'default';
        c.hoverCursor   = 'move';
        this._makeOnlyActiveInteractive();
        break;

      case 'brush':
        c.isDrawingMode = true;
        c.selection     = false;
        // Keep active layer even when brush mode disables selection visuals.
        if (!this._activeLayer) {
          this._activeLayer = this.canvas.getObjects().find(o =>
            o.type === 'image' && !o._isGuide && !o._isSpecMap && o.name !== '__template__');
          if (this._activeLayer) this.canvas.setActiveObject(this._activeLayer);
        }
        this._configureBrush();
        break;

      case 'eraser':
        c.isDrawingMode = true;
        c.selection     = false;
        // Keep active layer even when eraser mode disables selection visuals.
        if (!this._activeLayer) {
          this._activeLayer = this.canvas.getObjects().find(o =>
            o.type === 'image' && !o._isGuide && !o._isSpecMap && o.name !== '__template__');
          if (this._activeLayer) this.canvas.setActiveObject(this._activeLayer);
        }
        this._configureEraser();
        break;

      case 'fill':
        c.isDrawingMode = false;
        c.selection     = false;
        c.defaultCursor = 'crosshair';
        this._lockObjectsForPainting();
        break;

      case 'rect':
      case 'circle':
      case 'line':
        c.isDrawingMode = false;
        c.selection     = false;
        c.defaultCursor = 'crosshair';
        this._lockObjectsForPainting();
        break;

      case 'gradient':
        c.isDrawingMode = false;
        c.selection     = false;
        c.defaultCursor = 'crosshair';
        this._lockObjectsForPainting();
        break;

      case 'text':
        c.isDrawingMode = false;
        c.selection     = false;
        c.defaultCursor = 'text';
        this._lockObjectsForPainting();
        break;

      default:
        c.isDrawingMode = false;
        c.selection     = true;
        c.defaultCursor = 'default';
    }
  }

  /**
   * Temporarily disable selectable/evented on all canvas objects so that
   * mouse interactions in paint tools don't inadvertently move or select
   * other objects.  Stores original state for later restoration.
   */
  _lockObjectsForPainting() {
    this._lockedForPaint = [];
    this.canvas.getObjects().forEach(obj => {
      if (obj.selectable || obj.evented) {
        this._lockedForPaint.push({ obj, selectable: obj.selectable, evented: obj.evented });
        obj.set({ selectable: false, evented: false });
      }
    });
    this.canvas.discardActiveObject();
    this.canvas.renderAll();
  }

  _unlockObjectsForPainting() {
    if (!this._lockedForPaint || this._lockedForPaint.length === 0) return;
    this._lockedForPaint.forEach(({ obj, selectable, evented }) => {
      obj.set({
        selectable: selectable && this._isSelectableUserObject(obj),
        evented: evented && this._isSelectableUserObject(obj),
      });
    });
    this._lockedForPaint = [];
    this.canvas.renderAll();
  }

  /**
   * Make only the given object (or the current active object) interactive
   * on the canvas.  All other non-locked objects become non-selectable/evented.
   * This prevents the select tool from grabbing higher-stacked layers when
   * the user intends to work with a specific layer chosen from the panel.
   */
  _makeOnlyActiveInteractive(target) {
    target = target || this.canvas.getActiveObject();
    this._syncObjectInteractivity(target && this._isSelectableUserObject(target) ? target : null);
    this.canvas.renderAll();
  }

  _configureBrush() {
    const brush = new fabric.PencilBrush(this.canvas);
    brush.color       = this._colorWithOpacity(this.primaryColor, this.opacity);
    brush.width       = this.brushSize;
    brush.decimate    = 2;
    this.canvas.freeDrawingBrush = brush;
  }

  _configureEraser() {
    // Draw an opaque stroke for visual feedback; actual pixel removal is
    // handled by the destination-out composite in _mergeObjectOntoLayer.
    const brush = new fabric.PencilBrush(this.canvas);
    brush.color  = 'rgba(255,0,0,1)';
    brush.width  = this.brushSize * 2;
    this.canvas.freeDrawingBrush = brush;
  }

  _createGradientFill(width, height) {
    return new fabric.Gradient({
      type: 'linear',
      coords: {
        x1: 0,
        y1: 0,
        x2: Math.max(1, width),
        y2: Math.max(1, height),
      },
      colorStops: [
        { offset: 0, color: this.primaryColor },
        { offset: 1, color: this.secondaryColor },
      ],
    });
  }

  _createLineStroke(line) {
    const x1 = Number.isFinite(Number(line?.x1)) ? Number(line.x1) : 0;
    const y1 = Number.isFinite(Number(line?.y1)) ? Number(line.y1) : 0;
    const x2 = Number.isFinite(Number(line?.x2)) ? Number(line.x2) : x1 + 1;
    const y2 = Number.isFinite(Number(line?.y2)) ? Number(line.y2) : y1;

    return new fabric.Gradient({
      type: 'linear',
      coords: {
        x1,
        y1,
        x2,
        y2,
      },
      colorStops: [
        { offset: 0, color: this._colorWithOpacity(this.primaryColor, this.opacity) },
        { offset: 1, color: this._colorWithOpacity(this.secondaryColor, this.opacity) },
      ],
    });
  }

  _applyObjectColorMetadata(obj, primaryColor = this.primaryColor, secondaryColor = this.secondaryColor) {
    if (!obj) return;
    obj._primaryColor = primaryColor;
    obj._secondaryColor = secondaryColor;
  }

  _hasGradientFill(obj) {
    const fill = obj?.fill;
    return !!fill && typeof fill === 'object' && Array.isArray(fill.colorStops);
  }

  _isGradientObject(obj) {
    return !!obj && (obj.type === 'rect' || obj.type === 'image') && this._hasGradientFill(obj);
  }

  _getRetainedToolTarget() {
    const target = this.canvas.getActiveObject() || this._toolTargetObject;
    if (!this._isSelectableUserObject(target)) return null;
    if (this.canvas.getObjects().indexOf(target) < 0) return null;
    return target;
  }

  _isFillableObject(obj) {
    return !!obj && ['path', 'i-text', 'text', 'rect', 'ellipse', 'circle'].includes(obj.type);
  }

  _isPointInsideObject(obj, x, y) {
    if (!obj || typeof obj.getBoundingRect !== 'function') return false;
    const bounds = obj.getBoundingRect(true, true);
    return x >= bounds.left && x <= bounds.left + bounds.width && y >= bounds.top && y <= bounds.top + bounds.height;
  }

  _fillSelectedObject(target) {
    if (!this._isFillableObject(target)) return false;

    target.set('fill', this._colorWithOpacity(this.primaryColor, this.opacity));
    target._primaryColor = this.primaryColor;
    target.set({ selectable: true, evented: true });

    if (typeof target.setCoords === 'function') target.setCoords();

    this.canvas.setActiveObject(target);
    this.canvas.renderAll();
    this._saveState();
    if (this.onSelectionChanged) this.onSelectionChanged(target);
    return true;
  }

  /* ── Mouse handlers for shape drawing ────────────────────── */
  _canvasPoint(event) {
    const ptr = this.canvas.getPointer(event.e);
    return { x: ptr.x, y: ptr.y };
  }

  _onMouseDown(event) {
    const tool = this.currentTool;
    if (!['rect', 'circle', 'line', 'fill', 'text', 'gradient'].includes(tool)) return;

    const pt = this._canvasPoint(event);

    if (tool === 'fill') {
      this._doFill(pt.x, pt.y);
      return;
    }
    if (tool === 'text') {
      this._addTextAt(pt.x, pt.y);
      return;
    }
    // Start drawing a shape
    this._isDrawing  = true;
    this._shapeStart = pt;

    const common = {
      left:        pt.x,
      top:         pt.y,
      fill:        this._colorWithOpacity(this.primaryColor, this.opacity),
      stroke:      this.strokeWidth > 0 ? this.secondaryColor : null,
      strokeWidth: this.strokeWidth,
      strokeUniform: true,
      selectable:  false,
      evented:     false,
      _primaryColor: this.primaryColor,
      _secondaryColor: this.secondaryColor,
    };

    if (tool === 'rect') {
      this._activeShape = new fabric.Rect({ ...common, width: 0, height: 0 });
    } else if (tool === 'circle') {
      this._activeShape = new fabric.Ellipse({ ...common, rx: 0, ry: 0 });
    } else if (tool === 'line') {
      const line = new fabric.Line(
        [pt.x, pt.y, pt.x, pt.y],
        { stroke:
            this._colorWithOpacity(this.primaryColor, this.opacity),
          strokeWidth: this.brushSize, selectable: false, evented: false }
      );
      line.set('stroke', this._createLineStroke(line));
      this._applyObjectColorMetadata(line);
      this._activeShape = line;
    } else if (tool === 'gradient') {
      this._activeShape = new fabric.Rect({
        ...common,
        width: 0,
        height: 0,
        stroke: null,
        strokeWidth: 0,
        fill: this._createGradientFill(1, 1),
      });
      this._applyObjectColorMetadata(this._activeShape);
    }

    this._suspendHistory = true;
    this.canvas.add(this._activeShape);
    this.canvas.renderAll();
  }

  _onMouseMove(event) {
    if (!this._isDrawing || !this._activeShape) return;
    const pt    = this._canvasPoint(event);
    const start = this._shapeStart;
    const tool  = this.currentTool;

    if (tool === 'rect') {
      const x = Math.min(pt.x, start.x);
      const y = Math.min(pt.y, start.y);
      this._activeShape.set({ left: x, top: y, width: Math.abs(pt.x - start.x), height: Math.abs(pt.y - start.y) });
    } else if (tool === 'circle') {
      const rx = Math.abs(pt.x - start.x) / 2;
      const ry = Math.abs(pt.y - start.y) / 2;
      this._activeShape.set({ left: Math.min(pt.x, start.x), top: Math.min(pt.y, start.y), rx, ry });
    } else if (tool === 'line') {
      this._activeShape.set({ x2: pt.x, y2: pt.y });
      this._activeShape.set('stroke', this._createLineStroke(this._activeShape));
    } else if (tool === 'gradient') {
      const x = Math.min(pt.x, start.x);
      const y = Math.min(pt.y, start.y);
      const width = Math.max(1, Math.abs(pt.x - start.x));
      const height = Math.max(1, Math.abs(pt.y - start.y));
      this._activeShape.set({
        left: x,
        top: y,
        width,
        height,
        fill: this._createGradientFill(width, height),
      });
      this._applyObjectColorMetadata(this._activeShape);
    }

    this.canvas.renderAll();
  }

  _onMouseUp() {
    if (!this._isDrawing || !this._activeShape) return;
    this._isDrawing = false;

    const shape = this._activeShape;
    this._activeShape = null;
    this._suspendHistory = false;

    // Give the shape a proper name and group for the layers panel
    const groupName = (this._activeLayer && this._activeLayer._groupName) || '';
    const toolNames = { rect: 'Rectangle', circle: 'Ellipse', line: 'Line', gradient: 'Gradient' };
    shape.set({
      selectable: true,
      evented: true,
      name: toolNames[this.currentTool] || 'Shape',
      _groupName: groupName,
    });

    // Insert as an independent layer above Base Paint
    this.canvas.remove(shape);  // remove the temp preview
    const idx = this._getPreferredInsertIndex(this._activeLayer);
    this.canvas.insertAt(shape, idx);
    this._makeOnlyActiveInteractive(shape);
    this._saveState();
    if (this.onLayersChanged) this.onLayersChanged();

    this.canvas.renderAll();
    this.setTool('select');
  }

  /* ── Fill Tool ────────────────────────────────────────────── */
  /**
   * Flood-fill approach:
   * 1. Render the entire Fabric canvas to a temp off-screen canvas at
   *    full art resolution.
   * 2. Run a scanline flood-fill on its pixel data.
   * 3. Replace the Fabric canvas contents with the flood-filled image.
   *
   * This is intentionally "destructive" (flattens all layers) because
   * iRacing paint files are flat bitmaps — the layers concept in the
   * editor is pre-export convenience.
   */
  _doFill(x, y) {
    const retainedTarget = this._getRetainedToolTarget();
    if (this._isFillableObject(retainedTarget) && this._isPointInsideObject(retainedTarget, x, y)) {
      if (this._fillSelectedObject(retainedTarget)) return;
    }

    const target = this._activeLayer;
    if (this._isValidPaintLayer(target)) {
      const targetEl = target.getElement ? target.getElement() : target._element;
      if (!targetEl) return;

      const targetWidth  = Math.round(target.width * target.scaleX);
      const targetHeight = Math.round(target.height * target.scaleY);

      const px = Math.round(x);
      const py = Math.round(y);
      if (px < target.left || px >= target.left + targetWidth || py < target.top || py >= target.top + targetHeight) return;

      const localX = Math.round(px - target.left);
      const localY = Math.round(py - target.top);

      const offscreen = document.createElement('canvas');
      offscreen.width  = targetWidth;
      offscreen.height = targetHeight;
      const ctx = offscreen.getContext('2d');

      // Only draw the active layer onto the offscreen canvas
      ctx.drawImage(targetEl, 0, 0, targetWidth, targetHeight);

      const id = ctx.getImageData(0, 0, targetWidth, targetHeight);
      const fillRGBA = this._hexToRGBA(this.primaryColor, this.opacity);
      const targetRGBA = this._getPixel(id.data, localX, localY, targetWidth);
      if (this._colorsMatch(targetRGBA, fillRGBA)) return;

      this._scanlineFill(id.data, localX, localY, targetWidth, targetHeight, targetRGBA, fillRGBA);
      ctx.putImageData(id, 0, 0);

      const filledUrl = offscreen.toDataURL('image/png');
      this._replaceLayerWithImage(target, filledUrl);
      return;
    }

    // No active layer — create a new layer filled with the primary colour
    const AW = this.ART_W;
    const AH = this.ART_H;
    const newLayer = this._createBlankLayer(false);
    const px = Math.round(x);
    const py = Math.round(y);
    if (px < 0 || px >= AW || py < 0 || py >= AH) return;

    const offscreen = document.createElement('canvas');
    offscreen.width  = AW;
    offscreen.height = AH;
    const ctx = offscreen.getContext('2d');
    ctx.fillStyle = this._colorWithOpacity(this.primaryColor, this.opacity);
    ctx.fillRect(0, 0, AW, AH);
    const filledUrl = offscreen.toDataURL('image/png');
    this._replaceLayerWithImage(newLayer, filledUrl);
  }

  _getPixel(data, x, y, width) {
    const i = (y * width + x) * 4;
    return [data[i], data[i+1], data[i+2], data[i+3]];
  }

  _colorsMatch(a, b, tol = 30) {
    return Math.abs(a[0]-b[0]) <= tol &&
           Math.abs(a[1]-b[1]) <= tol &&
           Math.abs(a[2]-b[2]) <= tol &&
           Math.abs(a[3]-b[3]) <= tol;
  }

  _scanlineFill(data, startX, startY, width, height, targetColor, fillColor) {
    const stack   = [[startX, startY]];
    const visited = new Uint8Array(width * height);

    while (stack.length > 0) {
      let [x, y] = stack.pop();

      // Scan left
      while (x >= 0 && this._colorsMatch(this._getPixel(data, x, y, width), targetColor)) x--;
      x++;

      let spanAbove = false;
      let spanBelow = false;

      while (x < width && this._colorsMatch(this._getPixel(data, x, y, width), targetColor)) {
        const idx = (y * width + x) * 4;
        data[idx]   = fillColor[0];
        data[idx+1] = fillColor[1];
        data[idx+2] = fillColor[2];
        data[idx+3] = fillColor[3];

        const vi = y * width + x;
        visited[vi] = 1;

        if (y > 0) {
          const aboveMatch = this._colorsMatch(this._getPixel(data, x, y-1, width), targetColor);
          if (!spanAbove && aboveMatch && !visited[(y-1)*width+x]) {
            stack.push([x, y-1]);
            spanAbove = true;
          } else if (spanAbove && !aboveMatch) {
            spanAbove = false;
          }
        }

        if (y < height - 1) {
          const belowMatch = this._colorsMatch(this._getPixel(data, x, y+1, width), targetColor);
          if (!spanBelow && belowMatch && !visited[(y+1)*width+x]) {
            stack.push([x, y+1]);
            spanBelow = true;
          } else if (spanBelow && !belowMatch) {
            spanBelow = false;
          }
        }

        x++;
      }
    }
  }

  /* ── Add Objects ──────────────────────────────────────────── */
  _addTextAt(x, y) {
    // Inherit the group name from the active layer so it appears in the
    // correct category in the layers panel.
    const groupName = (this._activeLayer && this._activeLayer._groupName) || '';
    const obj = new fabric.IText('Text', {
      left:       x,
      top:        y,
      fontSize:   this.currentFontSize,
      fontFamily: this.currentFont,
      fontWeight: 'bold',
      fill:       this._colorWithOpacity(this.primaryColor, this.opacity),
      stroke:     null,
      name:       'Text',
      _groupName: groupName,
      _primaryColor: this.primaryColor,
    });

    // Text gets its own independent layer so it can be repositioned
    this._unlockObjectsForPainting();
    const idx = this._getPreferredInsertIndex(this._activeLayer);
    this._ensureObjectId(obj);
    this.canvas.insertAt(obj, idx);
    this._makeOnlyActiveInteractive(obj);
    obj.enterEditing();
    obj.selectAll();
    this.canvas.renderAll();
    this.setTool('select');
  }

  addRectangle() {
    const obj = new fabric.Rect({
      left:        200, top: 200,
      width:       400, height: 200,
      fill:        this._colorWithOpacity(this.primaryColor, this.opacity),
      stroke:      this.strokeWidth > 0 ? this.secondaryColor : null,
      strokeWidth: this.strokeWidth,
      strokeUniform: true,
      name:        'Rectangle',
      _primaryColor: this.primaryColor,
      _secondaryColor: this.secondaryColor,
    });
    this._addAndSelect(obj);
  }

  addCircle() {
    const obj = new fabric.Ellipse({
      left:        200, top: 200,
      rx:          200, ry: 150,
      fill:        this._colorWithOpacity(this.primaryColor, this.opacity),
      stroke:      this.strokeWidth > 0 ? this.secondaryColor : null,
      strokeWidth: this.strokeWidth,
      strokeUniform: true,
      name:        'Ellipse',
      _primaryColor: this.primaryColor,
      _secondaryColor: this.secondaryColor,
    });
    this._addAndSelect(obj);
  }

  addGradient() {
    // Called from toolbar addGradient action — merges onto active layer
    this._addGradientToLayer();
  }

  _addGradientToLayer() {
    const obj = new fabric.Rect({
      left: 0, top: 0,
      width: this.ART_W, height: this.ART_H,
      opacity: this.opacity,
      name: 'Gradient',
      _primaryColor: this.primaryColor,
      _secondaryColor: this.secondaryColor,
    });
    obj.set('fill', this._createGradientFill(this.ART_W, this.ART_H));
    this._addAndSelect(obj);
  }

  addLine() {
    const obj = new fabric.Line([200, 400, 1800, 400], {
      stroke:      this._colorWithOpacity(this.primaryColor, this.opacity),
      strokeWidth: this.brushSize,
      name:        'Line',
      _primaryColor: this.primaryColor,
      _secondaryColor: this.secondaryColor,
    });
    obj.set('stroke', this._createLineStroke(obj));
    this._addAndSelect(obj);
  }

  _addAndSelect(obj, alwaysMerge = true) {
    this._ensureObjectId(obj);
    let target = this._activeLayer;
    if (!this._isValidPaintLayer(target) && alwaysMerge) {
      target = this._createBlankLayer(false);
    }
    if (this._isValidPaintLayer(target)) {
      this.canvas.add(obj); // needed for rendering the object state
      this._mergeObjectOntoLayer(target, obj, false);
      this.canvas.remove(obj);
      this.canvas.setActiveObject(target);
    } else {
      const idx = this._getPreferredInsertIndex(this._activeLayer);
      this.canvas.insertAt(obj, idx);
      this.canvas.setActiveObject(obj);
    }
    this.canvas.renderAll();
    this.setTool('select');
  }

  uploadImage(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      fabric.Image.fromURL(e.target.result, (img) => {
        if (img.width > 1200) img.scaleToWidth(600);
        const groupName = (this._activeLayer && this._activeLayer._groupName) || '';
      img.set({ left: 300, top: 300, name: file.name.replace(/\.[^.]+$/, ''), _groupName: groupName, perPixelTargetFind: true });
      const idx = this._getPreferredInsertIndex(this.canvas.getActiveObject() || this._activeLayer);
        this._ensureObjectId(img);
        this.canvas.insertAt(img, idx);
        this._makeOnlyActiveInteractive(img);
        this.canvas.renderAll();
        this.setTool('select');
      }, { crossOrigin: 'anonymous' });
    };
    reader.readAsDataURL(file);
  }

  /* ── Template ─────────────────────────────────────────────── */
  loadTemplate(dataUrl, opacity = 0.30) {
    return new Promise((resolve) => {
      this._flushPendingHistoryTransaction('boundary');

      // Remove previous template if one exists
      if (this._templateObject) {
        this.canvas.remove(this._templateObject);
        this._templateObject = null;
      }

      fabric.Image.fromURL(dataUrl, (img) => {
        img.set({
          left:       0,
          top:        0,
          selectable: false,
          evented:    false,
          opacity:    opacity,
          name:       '__template__',
        });
        img.scaleToWidth(this.ART_W);
        this._templateObject = img;

        this.canvas.add(img);
        img.sendToBack();
        this.canvas.renderAll();
        this._saveState();
        if (this.onLayersChanged) this.onLayersChanged();
        resolve();
      }, { crossOrigin: 'anonymous' });
    });
  }


  setTemplateOpacity(v) {
    this._templateOpacity = v;
    if (this._templateObject) this._templateObject.set('opacity', v);
    this.canvas.getObjects().forEach(obj => {
      if (obj._isGuide) obj.set('opacity', v);
    });
    this.canvas.renderAll();
  }

  /* ── PSD layer import ─────────────────────────────────────── */

  /**
   * Parse a Psd object (from ag-psd) and add every raster layer as
   * a separate Fabric.js image, preserving position, opacity, blend
   * mode and visibility.
   *
   * Layers whose ancestor group matches /turn\s*off/i are flagged as
   * _isGuide: locked overlay excluded from TGA export.
   */
  async loadPsdLayers(psd) {
    this._discardPendingHistoryTransaction('psd-import');
    this._suspendHistory = true;
    this.ART_W = psd.width;
    this.ART_H = psd.height;
    this.canvas.setZoom(1);
    this.canvas.clear();
    this.canvas.setWidth(psd.width);
    this.canvas.setHeight(psd.height);
    this.canvas.setBackgroundColor(this.backgroundColor, () => {});
    this.createBackgroundLayer(this.backgroundColor);
    this._templateObject = null;

    const flat = [];
    this._flattenPsdLayers(psd.children || [], flat, false, '');

    // Debug: raw PSD tree + resolved flat list
    console.group('[PSD] Raw layer tree');
    this._dumpPsdTree(psd.children || [], 0);
    console.groupEnd();
    console.group(`[PSD] ${flat.length} layers after flatten`);
    flat.forEach((ld, i) => console.log(
      `[${i}] ${ld.isGuide ? '🔒guide' : '✏️paint'} | group="${ld.groupName}" | "${ld.name}" | hasCanvas=${!!ld.canvas}`
    ));
    console.groupEnd();

    // flat[] is in canvas stacking order (bottom → top) because ag-psd stores
    // children with index 0 = bottommost. canvas.add() in this order is correct.
    for (const ld of flat) {
      await this._addPsdLayer(ld);
    }

    this._resetHistoryState();
    this._suspendHistory = false;
    this._saveState();

    // Default active layer after loading PSD: first editable paint layer
    const defaultLayer = this._getDefaultPaintLayer();
    if (defaultLayer) {
      this.canvas.setActiveObject(defaultLayer);
      this._activeLayer = defaultLayer;
    }

    this.setZoom(this.currentZoom);
    this.canvas.renderAll();
    if (this.onLayersChanged) this.onLayersChanged();
  }

  /**
   * Walk the ag-psd layer tree and push one descriptor per raster layer into
   * `result`.  ag-psd stores children with index 0 = bottommost, so forward
   * iteration naturally gives bottom-to-top canvas stacking order.
   *
   * Group fallback: if a group's children are all adjustment/smart-object layers
   * (no raster .canvas), ag-psd still composites a .canvas for the group itself.
   * We use that rather than silently dropping the group.
   */
  _flattenPsdLayers(layers, result, isGuideGroup, displayGroup) {
    const BLEND_MAP = {
      'norm': 'source-over', 'mul ': 'multiply', 'scrn': 'screen',
      'over': 'overlay',     'dark': 'darken',   'lite': 'lighten',
      'hLit': 'hard-light',  'sLit': 'soft-light','diff': 'difference',
      'smud': 'exclusion',   'div ': 'color-dodge','idiv': 'color-burn',
    };
    for (let i = 0; i < layers.length; i++) {
      const layer = layers[i];
      if (layer.children) {
        // Skip only the Car Patterns group (default paint schemes we never want).
        // Do NOT skip hidden groups in general — Custom Spec Map is marked hidden
        // in the PSD but its layers still need to be loaded.
        if (/car[\s_-]*patterns?/i.test(layer.name || '')) continue;

        const childIsGuide   = isGuideGroup || /turn\s*off/i.test(layer.name || '');
        const childIsSpecMap = /custom\s*spec\s*map/i.test(layer.name || '');
        const childGroup     = displayGroup || (layer.name || '');

        const before = result.length;
        this._flattenPsdLayers(layer.children, result, childIsGuide, childGroup);

        // If no raster leaf layers came out of this group but the group has a
        // composite canvas (all-adjustment sub-group), use that composite.
        if (result.length === before && layer.canvas) {
          result.push({
            name:      layer.name || 'Group',
            canvas:    layer.canvas,
            left:      layer.left  || 0,
            top:       layer.top   || 0,
            visible:   true,
            opacity:   (layer.opacity ?? 1),
            blendMode: BLEND_MAP[layer.blendMode] || 'source-over',
            isGuide:   childIsGuide,
            isSpecMap: childIsSpecMap,
            groupName: childGroup,
            locked:    false,
          });
        }
      } else if (layer.canvas) {
        // Detect if this leaf's top-level group is Custom Spec Map
        const leafIsSpecMap = /custom\s*spec\s*map/i.test(displayGroup || '');
        result.push({
          name:      layer.name || 'Layer',
          canvas:    layer.canvas,
          left:      layer.left  || 0,
          top:       layer.top   || 0,
          visible:   !layer.hidden,
          opacity:   (layer.opacity ?? 1),
          blendMode: BLEND_MAP[layer.blendMode] || 'source-over',
          isGuide:   isGuideGroup,
          isSpecMap: leafIsSpecMap,
          groupName: displayGroup || '',
          locked:    !!(layer.protected &&
                       (layer.protected.position || layer.protected.composite)),
        });
      }
      // Pure adjustment layers with no canvas are silently skipped
    }
  }

  /** Print the raw ag-psd layer tree to the browser console for debugging. */
  _dumpPsdTree(layers, depth) {
    const pad = '  '.repeat(depth);
    for (const l of layers) {
      const tag = l.children ? '📁' : (l.canvas ? '🖼' : '⚙️');
      console.log(`${pad}${tag} [${l.hidden ? 'hidden' : 'vis'}] "${l.name}" canvas=${!!l.canvas} blend=${l.blendMode || '-'}`);
      if (l.children) this._dumpPsdTree(l.children, depth + 1);
    }
  }

  /** Create a fabric.Image from one flattened PSD layer descriptor. */
  _addPsdLayer(ld) {
    return new Promise((resolve) => {
      const isVisible = ld.isSpecMap ? false : ld.visible;
      const isEditable = !ld.isGuide && !ld.isSpecMap && !ld.locked && isVisible;
      const url = ld.canvas.toDataURL('image/png');
      fabric.Image.fromURL(url, (img) => {
        img.set({
          left:                     ld.left,
          top:                      ld.top,
          // Spec Map layers: always hidden & locked (future paywall feature)
          visible:                  isVisible,
          // Guide layers use template-opacity slider, spec map forced to 0
          opacity:                  ld.isSpecMap ? 0 : (ld.isGuide ? this._templateOpacity : ld.opacity),
          globalCompositeOperation: ld.blendMode,
          name:                     ld.name,
          selectable:               isEditable,
          evented:                  isEditable,
          locked:                   ld.locked || ld.isSpecMap,
          _isGuide:                 ld.isGuide,
          _isSpecMap:               ld.isSpecMap,
          _groupName:               ld.groupName,
          // Per-pixel hit-testing so clicks on fully-transparent areas of one
          // layer (e.g. a decals or mask layer) fall through to the layer below.
          perPixelTargetFind:       true,
        });
        this._ensureObjectId(img);
        this.canvas.add(img);
        resolve();
      }, { crossOrigin: 'anonymous' });
    });
  }

  /* ── Colour & Style setters ───────────────────────────────── */
  setPrimaryColor(hex) {
    this.primaryColor = hex;
    if (this.currentTool === 'brush') this._configureBrush();
    if (this.currentTool === 'eraser') this._configureEraser();
  }

  setSecondaryColor(hex) { this.secondaryColor = hex; }

  setBrushSize(size) {
    this.brushSize = size;
    if (this.canvas.freeDrawingBrush) {
      this.canvas.freeDrawingBrush.width =
        this.currentTool === 'eraser' ? size * 2 : size;
    }
  }

  /** Controls opacity of NEW drawings / shapes only. Does not touch existing layers. */
  setOpacity(v) {
    this.opacity = v;
    if (this.currentTool === 'brush') this._configureBrush();
  }

  /** Sets the opacity of the currently selected layer in the panel. */
  setLayerOpacity(v) {
    const active = this.canvas.getActiveObject();
    if (!active || active._isGuide || active._isSpecMap || active.name === '__template__') return;

    const nextOpacity = Math.max(0, Math.min(1, Number(v)));
    if (!Number.isFinite(nextOpacity)) return;

    const currentOpacity = Number.isFinite(Number(active.opacity)) ? Number(active.opacity) : 1;
    if (Math.abs(currentOpacity - nextOpacity) < 0.0001) return;

    const historyApi = window.LiveryLabHistory;
    const operationName = historyApi?.OPERATION_TYPES?.LAYER_OPACITY_SET || 'document.layer.opacity.set';
    const checkpointBoundary = historyApi?.CHECKPOINT_BOUNDARIES?.TRANSACTION_IDLE || 'transaction-idle';
    const reversibility = historyApi?.REVERSIBILITY?.REVERSIBLE || 'reversible';

    if (this._historySession) {
      const transactionMeta = {
        name: operationName,
        label: 'Adjust layer opacity',
        coalesceKey: `layer-opacity:${active._id || 'active-object'}`,
        reversibility,
        checkpointBoundary,
        beforeSnapshot: this._serializeCanvasState(),
        beforeSelectedObjectId: active._id || null,
        beforeActiveLayerId: this.getActiveLayerId(),
        renderInvalidation: {
          scope: 'viewport-and-export',
          kind: 'layer-opacity',
          layerIds: [active._id || null].filter(Boolean),
        },
      };

      if (!this._historySession.canExtendActiveTransaction(transactionMeta)) {
        this._flushPendingHistoryTransaction('boundary');
        this._historySession.openTransaction(transactionMeta);
      }

      this._historySession.recordOperation({
        name: operationName,
        targetId: active._id || null,
        opacity: nextOpacity,
        mode: 'slider',
      });
    }

    active.set('opacity', nextOpacity);
    this.canvas.renderAll();

    if (!this._historySession) {
      this._saveState();
    }

    if (this.onLayersChanged) this.onLayersChanged();
    if (this.onSelectionChanged) this.onSelectionChanged(active);
  }

  commitLayerOpacityChange() {
    if (this._historySession) {
      this._flushPendingHistoryTransaction('explicit');
    }
  }

  setStrokeWidth(w) {
    this.strokeWidth = w;
    const active = this.canvas.getActiveObject();
    if (active && active.strokeWidth !== undefined) {
      active.set('strokeWidth', w);
      this.canvas.renderAll();
    }
  }

  createBackgroundLayer(color) {
    const existing = this.canvas.getObjects().find(o => o.name === '__background__');
    if (existing) {
      existing.set({ fill: color, width: this.ART_W, height: this.ART_H, left: 0, top: 0 });
      this.canvas.sendToBack(existing);
      return existing;
    }

    const rect = new fabric.Rect({
      left: 0,
      top: 0,
      width: this.ART_W,
      height: this.ART_H,
      fill: color,
      selectable: false,
      evented: false,
      hasControls: false,
      hasBorders: false,
      hoverCursor: 'default',
      name: '__background__',
    });
    this.canvas.add(rect);
    this.canvas.sendToBack(rect);
    return rect;
  }

  setBackgroundColor(hex) {
    this.backgroundColor = hex;
    this.createBackgroundLayer(hex);
    this.canvas.renderAll();
    this._saveState();
  }

  setFont(family) {
    this.currentFont = family;
    this.updateActiveTextStyle({ fontFamily: family });
  }

  setFontSize(size) {
    this.currentFontSize = size;
    this.updateActiveTextStyle({ fontSize: size });
  }

  /* ── Active Object helpers ────────────────────────────────── */
  getActiveObject() { return this.canvas.getActiveObject() || null; }

  updateActiveColor(hex) {
    const obj = this.canvas.getActiveObject();
    if (!obj) return;
    if (obj.type === 'path' || obj.type === 'i-text' || obj.type === 'text') {
      obj.set('fill', hex);
      obj._primaryColor = hex;
    } else if (obj.type === 'rect' || obj.type === 'ellipse' || obj.type === 'circle') {
      if (this._isGradientObject(obj)) {
        obj.set('fill', this._createGradientFill(obj.width || 1, obj.height || 1));
      } else {
        obj.set('fill', hex);
      }
      obj._primaryColor = hex;
    } else if (obj.type === 'line') {
      obj.set('stroke', this._createLineStroke(obj));
      obj._primaryColor = hex;
    }
    this.canvas.renderAll();
  }

  updateActiveSecondaryColor(hex) {
    const obj = this.canvas.getActiveObject();
    if (!obj) return;

    if (obj.type === 'line') {
      obj.set('stroke', this._createLineStroke(obj));
      obj._secondaryColor = hex;
    } else if (this._isGradientObject(obj)) {
      obj.set('fill', this._createGradientFill(obj.width || 1, obj.height || 1));
      obj._secondaryColor = hex;
    } else if (obj.type === 'rect' || obj.type === 'ellipse' || obj.type === 'circle') {
      obj.set('stroke', hex);
      obj._secondaryColor = hex;
    }

    this.canvas.renderAll();
  }

  updateActiveTextStyle(changes = {}) {
    const obj = this.canvas.getActiveObject();
    if (!obj || (obj.type !== 'i-text' && obj.type !== 'text')) return;

    obj.set(changes);
    if (typeof obj.setCoords === 'function') obj.setCoords();
    this.canvas.renderAll();
  }

  updateActiveOpacity(v) {
    const obj = this.canvas.getActiveObject();
    if (!obj) return;
    obj.set('opacity', v);
    this.canvas.renderAll();
  }

  deleteSelected() {
    const active = this.canvas.getActiveObjects();
    if (!active.length) return;
    active.forEach(o => {
      if (o.name !== '__template__') this.canvas.remove(o);
    });
    this.canvas.discardActiveObject();
    this.canvas.renderAll();
    this._saveState();
    if (this.onLayersChanged) this.onLayersChanged();
  }

  duplicateSelected() {
    const active = this.canvas.getActiveObject();
    if (!active || active.name === '__template__') return;
    active.clone((cloned) => {
      cloned.set({
        left: active.left + 30,
        top: active.top + 30,
        _groupName: cloned._groupName || active._groupName || '',
      });
      if (cloned.name) cloned.name = cloned.name + ' copy';
      this._ensureObjectId(cloned);
      const idx = this._getPreferredInsertIndex(active);
      this.canvas.insertAt(cloned, idx);
      this._makeOnlyActiveInteractive(cloned);
      this.canvas.renderAll();
    });
  }

  nudgeSelected(dx, dy) {
    const active = this.canvas.getActiveObject();
    if (!this._isSelectableUserObject(active)) return false;

    const historyApi = window.LiveryLabHistory;
    const operationName = historyApi?.OPERATION_TYPES?.OBJECT_TRANSFORM_SET || 'document.object.transform.set';
    const checkpointBoundary = historyApi?.CHECKPOINT_BOUNDARIES?.TRANSACTION_IDLE || 'transaction-idle';
    const reversibility = historyApi?.REVERSIBILITY?.REVERSIBLE || 'reversible';

    if (this._historySession) {
      const transactionMeta = {
        name: operationName,
        label: 'Nudge selection',
        coalesceKey: `nudge:${active._id || 'active-object'}`,
        reversibility,
        checkpointBoundary,
        beforeSnapshot: this._serializeCanvasState(),
        beforeSelectedObjectId: active._id || null,
        beforeActiveLayerId: this.getActiveLayerId(),
        renderInvalidation: {
          scope: 'viewport-and-export',
          kind: 'object-transform',
          layerIds: [active._id || null].filter(Boolean),
        },
      };

      if (!this._historySession.canExtendActiveTransaction(transactionMeta)) {
        this._flushPendingHistoryTransaction('boundary');
        this._historySession.openTransaction(transactionMeta);
      }
    }

    active.set({
      left: (active.left || 0) + dx,
      top: (active.top || 0) + dy,
    });
    active.setCoords();
    this.canvas.renderAll();

    if (this._historySession) {
      this._historySession.recordOperation({
        name: operationName,
        targetId: active._id || null,
        delta: { dx, dy },
        mode: 'nudge',
      });
      this._schedulePendingHistoryFlush();
    } else {
      this._saveState();
    }

    if (this.onLayersChanged) this.onLayersChanged();
    if (this.onSelectionChanged) this.onSelectionChanged(active);
    return true;
  }

  getHistoryDebugState() {
    return this._historySession ? this._historySession.getDebugState() : null;
  }

  bringForward() {
    const a = this.canvas.getActiveObject();
    if (a) { this.canvas.bringForward(a); this.canvas.renderAll(); this._saveState(); if (this.onLayersChanged) this.onLayersChanged(); }
  }

  sendBackward() {
    const a = this.canvas.getActiveObject();
    if (a && a.name !== '__template__') { this.canvas.sendBackwards(a); this.canvas.renderAll(); this._saveState(); if (this.onLayersChanged) this.onLayersChanged(); }
  }

  /* ── Layers API (used by app.js to build the layers panel) ── */

  /**
   * Return a list of layer descriptors (bottom → top so index 0 is background).
   * We reverse for a "top = front" visual convention in the UI.
   */
  getLayers() {
    const objects = this.canvas.getObjects();
    return objects.map((obj, i) => ({
      index:     i,
      id:        obj._id || i,
      name:      obj.name || obj.type || 'Layer ' + (i + 1),
      type:      obj.type,
      visible:   obj.visible !== false,
      locked:    obj.name === '__template__' || !!obj._isGuide || !!obj._isSpecMap || !!obj.locked,
      isGuide:   !!obj._isGuide,
      isSpecMap: !!obj._isSpecMap,
      groupName: obj._groupName || '',
      selected:  obj === this.canvas.getActiveObject(),
      opacity:   (obj.opacity === undefined || obj.opacity === null) ? 1 : obj.opacity,
    })).reverse(); // Top visual layer first
  }

  selectLayerByIndex(visualIndex) {
    const objects = this.canvas.getObjects();
    const internalIndex = objects.length - 1 - visualIndex;
    if (internalIndex < 0) return;
    const obj = objects[internalIndex];
    if (this._isSelectableUserObject(obj)) {
      this._activeLayer = (obj.type === 'image') ? obj : this._activeLayer;
      // Switch to select tool first, then make this specific object interactive
      this.currentTool = 'select';
      this.canvas.isDrawingMode = false;
      this.canvas.selection = false;
      this.canvas.defaultCursor = 'default';
      this.canvas.hoverCursor = 'move';
      this._isDrawing = false;
      this._activeShape = null;
      this._unlockObjectsForPainting();
      this._makeOnlyActiveInteractive(obj);
      if (this.onToolChanged) {
        const cb = this.onToolChanged;
        queueMicrotask(() => cb('select'));
      }
      if (this.onSelectionChanged) this.onSelectionChanged(obj);
    }
  }

  toggleLayerVisibility(visualIndex) {
    const objects = this.canvas.getObjects();
    const internalIndex = objects.length - 1 - visualIndex;
    if (internalIndex < 0) return;
    const obj = objects[internalIndex];
    // Block spec map layers from being toggled visible
    if (obj._isSpecMap) return;
    const nextVisible = !obj.visible;
    obj.set({
      visible: nextVisible,
      selectable: nextVisible && this._isInteractiveInCurrentMode(obj),
      evented: nextVisible && this._isInteractiveInCurrentMode(obj),
    });
    if (!nextVisible && this.canvas.getActiveObject() === obj) {
      this.canvas.discardActiveObject();
      if (this._activeLayer === obj) this._activeLayer = this._getDefaultPaintLayer();
    } else if (nextVisible && this.currentTool === 'select') {
      this._syncObjectInteractivity(this.canvas.getActiveObject());
    }
    this.canvas.renderAll();
    this._saveState();
    if (this.onLayersChanged) this.onLayersChanged();
    if (this.onSelectionChanged) this.onSelectionChanged(this.canvas.getActiveObject() || null);
  }

  deleteLayerByIndex(visualIndex) {
    const objects = this.canvas.getObjects();
    const internalIndex = objects.length - 1 - visualIndex;
    if (internalIndex < 0) return;
    const obj = objects[internalIndex];
    if (obj.name === '__template__' || obj._isGuide || obj._isSpecMap) return;
    this.canvas.remove(obj);
    this.canvas.renderAll();
    this._saveState();
    if (this.onLayersChanged) this.onLayersChanged();
  }

  /* ── Export / Serialization ───────────────────────────────── */

  /**
   * Render all non-template layers to a flat canvas at the requested
   * output resolution and return the ImageData.
   *
  * @param {number} outputSize  1024 or 2048
   * @returns {ImageData}
   */
  getExportImageData(outputSize = 2048) {
    const scale  = outputSize / this.ART_W;
    const tmpEl  = document.createElement('canvas');
    tmpEl.width  = outputSize;
    tmpEl.height = outputSize;
    const tmpCtx = tmpEl.getContext('2d');

    // Hide template, guide overlays, and spec map layers while exporting
    const savedOpacity = this._templateObject ? this._templateObject.opacity : null;
    if (this._templateObject) this._templateObject.set('opacity', 0);
    const hiddenForExport = [];
    this.canvas.getObjects().forEach(obj => {
      if (obj._isGuide || obj._isSpecMap) {
        hiddenForExport.push({ obj, opacity: obj.opacity, visible: obj.visible });
        obj.set({ opacity: 0, visible: false });
      }
    });
    this.canvas.renderAll();

    const dataUrl = this.canvas.toDataURL({ format: 'png', multiplier: scale });

    if (this._templateObject && savedOpacity !== null) this._templateObject.set('opacity', savedOpacity);
    hiddenForExport.forEach(({ obj, opacity, visible }) => obj.set({ opacity, visible }));
    this.canvas.renderAll();

    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        tmpCtx.drawImage(img, 0, 0, outputSize, outputSize);
        resolve(tmpCtx.getImageData(0, 0, outputSize, outputSize));
      };
      img.src = dataUrl;
    });
  }

  saveProject() {
    this._flushPendingHistoryTransaction('save-project');
    const payload = window.LiveryLabDocument
      ? window.LiveryLabDocument.createDocumentSnapshot(this)
      : this._serializeCanvasForDocument();
    const json = JSON.stringify(payload, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    triggerDownload(blob, 'livery-lab-project.json');
  }

  loadProject(file) {
    this._discardPendingHistoryTransaction('project-load');
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target.result);
        const normalized = window.LiveryLabDocument
          ? window.LiveryLabDocument.normalizeProjectPayload(data)
          : {
              document: {
                artboard: {
                  width: data?.width || this.ART_W,
                  height: data?.height || this.ART_H,
                  backgroundColor: this.backgroundColor,
                },
                car: null,
                template: { opacity: this._templateOpacity },
                bridge: { fabricCanvas: data },
              },
              migration: {
                source: 'legacy-fabric-json',
                applied: ['loaded-without-document-schema-module'],
              },
            };

        const fabricCanvas = window.LiveryLabDocument
          ? window.LiveryLabDocument.getLegacyFabricCanvas(normalized.document)
          : normalized.document.bridge.fabricCanvas;

        if (!fabricCanvas) {
          throw new Error('Project file is missing its runtime canvas payload.');
        }

        this.setDocumentCar(normalized.document.car || null);
        if (typeof normalized.document.artboard?.backgroundColor === 'string') {
          this.backgroundColor = normalized.document.artboard.backgroundColor;
        }
        if (typeof normalized.document.template?.opacity === 'number') {
          this._templateOpacity = normalized.document.template.opacity;
        }

        this._resetHistoryState();
        this._loadState(JSON.stringify(fabricCanvas), () => {
          this._resetHistoryState();
          this._saveState();

          if (this.onDocumentLoaded) {
            this.onDocumentLoaded(normalized);
          }

          if (typeof showToast === 'function') {
            const isLegacyMigration = normalized.migration?.source === 'legacy-fabric-json';
            const message = isLegacyMigration
              ? `Legacy project loaded and migrated to EditorDocument v${normalized.document.version}.`
              : `Project loaded (EditorDocument v${normalized.document.version}).`;
            showToast(message, 'success');
          }
        });
      } catch (error) {
        if (typeof showToast === 'function') {
          showToast('Could not load project: ' + error.message, 'error');
        }
      }
    };
    reader.readAsText(file);
  }

  /* ── Utility Helpers ──────────────────────────────────────── */
  _colorWithOpacity(hex, opacity) {
    if (opacity >= 1) return hex;
    const [r, g, b] = this._hexToRGBA(hex, opacity);
    return `rgba(${r},${g},${b},${opacity})`;
  }

  _hexToRGBA(hex, alpha = 1) {
    const h = hex.replace('#', '');
    const r = parseInt(h.substring(0, 2), 16);
    const g = parseInt(h.substring(2, 4), 16);
    const b = parseInt(h.substring(4, 6), 16);
    const a = Math.round(alpha * 255);
    return [r, g, b, a];
  }
}
