/**
 * PaintEditor — Fabric.js canvas wrapper for Livery Lab
 *
 * Responsibilities:
 *  - Manage the Fabric.js canvas (2048×2048 "art" space, zoomed into viewport)
 *  - Own editor-side tool runtime, layer targeting, and committed paint helpers
 *  - Expose tools: Select, Brush, Eraser, Fill, Rectangle, Circle, Line, Gradient, Text, Upload
 *  - Manage transitional undo/redo with targeted replay plus JSON snapshot fallback
 *  - Provide a locked "template overlay" layer at the bottom of the stack
 *  - Publish workspace state and editor-owned actions consumed by app-shell UI controllers
 *  - Expose helpers used by app.js and extracted controllers (colour, opacity, size, zoom)
 *
 * Dependencies:  Fabric.js 5.x loaded globally as `fabric`
 */

class PaintEditor {

  /* ── Constructor ──────────────────────────────────────────── */
  constructor(canvasId) {

    // Canvas dimensions (full iRacing paint resolution)
    this.ART_W = 2048;
    this.ART_H = 2048;

    // ── Selection control appearance ─────────────────────────
    // Make selection handles visible and easy to grab.  Fabric.js
    // defaults use transparent (hollow) corners in a pale colour that
    // become invisible on busy livery art.  Set filled corners, a
    // contrasting colour, and a generous hit-size.
    fabric.Object.prototype.transparentCorners = false;
    fabric.Object.prototype.cornerColor        = '#00e676';
    fabric.Object.prototype.cornerStrokeColor  = '#1b5e20';
    fabric.Object.prototype.borderColor        = '#00e676';
    fabric.Object.prototype.cornerSize         = 14;
    fabric.Object.prototype.cornerStyle        = 'circle';
    fabric.Object.prototype.borderScaleFactor  = 1.5;
    fabric.Object.prototype.rotatingPointOffset = 30;

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
    this.primaryColor  = '#cc0000';
    this.secondaryColor = '#ffffff';
    this.brushSize     = 20;
    this.opacity       = 1.0;
    this.strokeWidth   = 3;
    this.currentFont   = 'Arial';
    this.currentFontSize = 120;
    this.blendMode     = 'source-over';
    this.currentZoom   = 0.40;
    this._viewportBaseCanvas = null;
    this._viewportBaseActive = false;
    this._viewportBaseSuspended = false;
    this._viewportBaseLiveOverlay = null;
    this._viewportBaseSuspendedForFreeDraw = false;
    this._viewportBaseSuspendedForKeyboardNudge = false;
    this._viewportBaseSuspendedForTextEditing = false;
    this._viewportBaseSyncHandle = 0;
    this._viewportBaseSyncUsesAnimationFrame = false;

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
    this._exclusiveAsyncPaintMutation = null;
    this._nextExclusiveAsyncPaintMutationId = 1;
    this._asyncHistoryReplayMutation = null;
    this._nextAsyncHistoryReplayMutationId = 1;

    // ── Template reference ─────────────────────────────────────
    this._templateObject = null;
    this._templateOpacity = 1.0;
    this._pendingTemplateOpacityCommit = false;
    this._pendingWorkspaceInspectorCommit = false;
    this.backgroundColor = '#ffffff';

    // ── Pending pointer transform capture ─────────────────────
    this._pendingPointerTransform = null;

    // ── Shape drawing state (mouse drag) ──────────────────────
    this._isDrawing  = false;
    this._shapeStart = null;
    this._activeShape = null;

    // ── Active layer (target for brush/eraser drawing) ─────────
    this._activeLayer = null;
    this._toolTargetObject = null;
    this._documentContext = { car: null };
    this._liveDocumentMirror = null;
    this._toolControllerContext = this._createToolControllerContext();
    this._toolControllers = {
      select: new SelectToolController(this._toolControllerContext),
      brush: new FreeDrawToolController('brush', this._toolControllerContext),
      eraser: new FreeDrawToolController('eraser', this._toolControllerContext),
      fill: new FillToolController(this._toolControllerContext),
      rect: new ShapeToolController('rect', this._toolControllerContext),
      circle: new ShapeToolController('circle', this._toolControllerContext),
      line: new ShapeToolController('line', this._toolControllerContext),
      gradient: new GradientToolController(this._toolControllerContext),
      text: new TextToolController(this._toolControllerContext),
    };
    this._activeToolController = null;

    // Track objects whose interactivity was disabled for paint modes
    this._lockedForPaint = [];

    // ── Callbacks set by app.js ───────────────────────────────
    this.onLayersChanged = null;
    this.onSelectionChanged = null;
    this.onToolChanged = null;
    this.onDocumentLoaded = null;
    this.onDocumentLoadFailed = null;

    this._setupViewportBaseCanvas();
    this._setupEventListeners();
    this._saveState();

    this.setZoom(this.currentZoom);
  }

  _setupViewportBaseCanvas() {
    const wrapperEl = this.canvas?.wrapperEl;
    const lowerCanvasEl = this.canvas?.lowerCanvasEl;
    if (!wrapperEl || !lowerCanvasEl || this._viewportBaseCanvas) return;

    const baseCanvas = document.createElement('canvas');
    baseCanvas.className = 'shared-viewport-base-canvas';
    baseCanvas.setAttribute('aria-hidden', 'true');
    wrapperEl.insertBefore(baseCanvas, lowerCanvasEl);

    this._viewportBaseCanvas = baseCanvas;
    this._setViewportBaseActive(false);
  }

  _cancelViewportBaseSync() {
    if (!this._viewportBaseSyncHandle) return;

    if (this._viewportBaseSyncUsesAnimationFrame && typeof window.cancelAnimationFrame === 'function') {
      window.cancelAnimationFrame(this._viewportBaseSyncHandle);
    } else {
      window.clearTimeout(this._viewportBaseSyncHandle);
    }

    this._viewportBaseSyncHandle = 0;
    this._viewportBaseSyncUsesAnimationFrame = false;
  }

  _applyViewportBasePresentation() {
    const wrapperEl = this.canvas?.wrapperEl;
    const lowerCanvasEl = this.canvas?.lowerCanvasEl;
    const baseCanvas = this._viewportBaseCanvas;
    if (!wrapperEl || !lowerCanvasEl || !baseCanvas) return;

    const overlayActive = !!this._viewportBaseActive && !!this._viewportBaseLiveOverlay && !this._viewportBaseSuspended;
    wrapperEl.classList.toggle('shared-viewport-base-active', !!this._viewportBaseActive);
    baseCanvas.style.display = this._viewportBaseActive ? 'block' : 'none';
    lowerCanvasEl.style.opacity = this._viewportBaseActive && !overlayActive ? '0' : '1';
    lowerCanvasEl.style.visibility = this._viewportBaseActive && !overlayActive ? 'hidden' : 'visible';
  }

  _isViewportBaseLiveOverlayActive(kind = null) {
    if (!this._viewportBaseLiveOverlay) return false;
    if (!kind) return true;
    return this._viewportBaseLiveOverlay.kind === kind;
  }

  _setViewportBaseLiveOverlayObject(liveObject, originalVisibility = null) {
    const state = this._viewportBaseLiveOverlay;
    if (!state) return false;

    const objects = this.canvas?.getObjects?.() || [];
    const visibleObject = liveObject && objects.includes(liveObject) ? liveObject : null;
    const visibilityMap = originalVisibility instanceof Map
      ? new Map(originalVisibility)
      : new Map(state.hiddenObjects.map((entry) => [entry.object, entry.visible]));

    objects.forEach((obj) => {
      if (!visibilityMap.has(obj)) {
        visibilityMap.set(obj, obj.visible !== false);
      }
      obj.visible = obj === visibleObject;
    });

    if (this.canvas) {
      this.canvas.backgroundColor = 'rgba(0,0,0,0)';
    }

    state.hiddenObjects = Array.from(visibilityMap.entries()).map(([object, visible]) => ({ object, visible }));
    state.liveObjectId = visibleObject?._id || null;
    this._applyViewportBasePresentation();
    return true;
  }

  _beginViewportBaseLiveOverlay(kind, liveObject = null) {
    if (!kind || !this._viewportBaseActive || this._viewportBaseSuspended || !this._viewportBaseCanvas) {
      return false;
    }

    this._cancelViewportBaseSync();

    const originalVisibility = this._viewportBaseLiveOverlay
      ? new Map(this._viewportBaseLiveOverlay.hiddenObjects.map((entry) => [entry.object, entry.visible]))
      : null;

    this._viewportBaseLiveOverlay = {
      kind,
      hiddenObjects: [],
      liveObjectId: null,
      canvasBackgroundColor: this.canvas?.backgroundColor ?? this.backgroundColor,
    };

    return this._setViewportBaseLiveOverlayObject(liveObject, originalVisibility);
  }

  _restoreViewportBaseLiveOverlay(options = {}) {
    const state = this._viewportBaseLiveOverlay;
    if (!state) return false;

    state.hiddenObjects.forEach(({ object, visible }) => {
      if (!object) return;
      object.visible = visible;
    });

    if (this.canvas) {
      this.canvas.backgroundColor = state.canvasBackgroundColor ?? this.backgroundColor;
    }

    this._viewportBaseLiveOverlay = null;
    this._applyViewportBasePresentation();

    if (options.render !== false) {
      this.canvas.renderAll();
    }

    return true;
  }

  _setViewportBaseActive(active) {
    const nextActive = !!active && !this._viewportBaseSuspended;
    if (!nextActive && this._viewportBaseLiveOverlay) {
      this._viewportBaseActive = nextActive;
      this._restoreViewportBaseLiveOverlay({ render: true });
      return;
    }

    this._viewportBaseActive = nextActive;
    this._applyViewportBasePresentation();
  }

  _syncViewportBaseCanvasSize(width, height) {
    const baseCanvas = this._viewportBaseCanvas;
    if (!baseCanvas) return;

    baseCanvas.style.width = `${width}px`;
    baseCanvas.style.height = `${height}px`;
  }

  _syncViewportBaseNow() {
    this._viewportBaseSyncHandle = 0;
    this._viewportBaseSyncUsesAnimationFrame = false;

    const baseCanvas = this._viewportBaseCanvas;
    if (!baseCanvas) return;

    if (this._viewportBaseSuspended) {
      this._setViewportBaseActive(false);
      return;
    }

    const renderState = this.getViewportBaseRenderState({ targetCanvas: baseCanvas });
    this._syncViewportBaseCanvasSize(renderState.targetWidth, renderState.targetHeight);

    if (!renderState.supported || !renderState.canvas) {
      this._setViewportBaseActive(false);
      return;
    }

    this._setViewportBaseActive(true);
  }

  _scheduleViewportBaseSync() {
    if (!this._viewportBaseCanvas || this._viewportBaseSyncHandle || this._viewportBaseLiveOverlay) return;

    if (typeof window.requestAnimationFrame === 'function') {
      this._viewportBaseSyncUsesAnimationFrame = true;
      this._viewportBaseSyncHandle = window.requestAnimationFrame(() => this._syncViewportBaseNow());
      return;
    }

    this._viewportBaseSyncUsesAnimationFrame = false;
    this._viewportBaseSyncHandle = window.setTimeout(() => this._syncViewportBaseNow(), 0);
  }

  _setViewportBaseSuspended(suspended) {
    const nextSuspended = !!suspended;
    if (this._viewportBaseSuspended === nextSuspended && !(nextSuspended && this._viewportBaseLiveOverlay)) return;

    this._viewportBaseSuspended = nextSuspended;
    if (nextSuspended) {
      if (this._viewportBaseLiveOverlay) {
        this._restoreViewportBaseLiveOverlay({ render: true });
      }
      this._cancelViewportBaseSync();
      this._setViewportBaseActive(false);
      return;
    }

    this._scheduleViewportBaseSync();
  }

  _syncViewportBaseSuspensionReasons() {
    this._viewportBaseSuspendedForFreeDraw = this._shouldSuspendViewportBaseForCurrentFreeDraw();
    this._setViewportBaseSuspended(
      this._viewportBaseSuspendedForFreeDraw
      || this._viewportBaseSuspendedForKeyboardNudge
      || this._viewportBaseSuspendedForTextEditing
    );
  }

  _beginViewportBaseFreeDraw() {
    this._syncViewportBaseSuspensionReasons();
  }

  _endViewportBaseFreeDraw() {
    this._viewportBaseSuspendedForFreeDraw = false;
    this._syncViewportBaseSuspensionReasons();
  }

  _beginViewportBaseKeyboardManipulation(target = null) {
    if (this._canKeepViewportBaseMountedForKeyboardInteraction(target)) {
      this._viewportBaseSuspendedForKeyboardNudge = false;
      if (this._isViewportBaseLiveOverlayActive('keyboard-nudge')) {
        if (this._viewportBaseLiveOverlay?.liveObjectId === (target?._id || null)) {
          this._setViewportBaseLiveOverlayObject(target);
          return;
        }
        this._restoreViewportBaseLiveOverlay({ render: false });
      }

      this._beginViewportBaseLiveOverlay('keyboard-nudge', target);
      return;
    }

    if (this._isViewportBaseLiveOverlayActive('keyboard-nudge')) {
      this._restoreViewportBaseLiveOverlay({ render: false });
    }

    if (
      this._viewportBaseSuspendedForKeyboardNudge
      || (!this._viewportBaseActive && !this._viewportBaseSuspendedForTextEditing)
    ) {
      return;
    }

    this._viewportBaseSuspendedForKeyboardNudge = true;
    this._syncViewportBaseSuspensionReasons();
  }

  _endViewportBaseKeyboardManipulation() {
    const hadKeyboardOverlay = this._isViewportBaseLiveOverlayActive('keyboard-nudge');
    if (hadKeyboardOverlay) {
      this._restoreViewportBaseLiveOverlay({ render: false });
    }

    if (!this._viewportBaseSuspendedForKeyboardNudge) {
      if (hadKeyboardOverlay) {
        this._syncViewportBaseSuspensionReasons();
      }
      return;
    }

    this._viewportBaseSuspendedForKeyboardNudge = false;
    this._syncViewportBaseSuspensionReasons();
  }

  _beginViewportBaseTextEditing() {
    if (this._viewportBaseSuspendedForTextEditing) return;
    this._viewportBaseSuspendedForTextEditing = true;
    this._syncViewportBaseSuspensionReasons();
  }

  _endViewportBaseTextEditing() {
    if (!this._viewportBaseSuspendedForTextEditing) return;
    this._viewportBaseSuspendedForTextEditing = false;
    this._syncViewportBaseSuspensionReasons();
    this._scheduleViewportBaseSync();
  }

  /* ── Event Wiring ─────────────────────────────────────────── */
  _setupEventListeners() {
    const c = this.canvas;

    // Save state after any modification
    c.on('object:added',     (e) => this._afterChange(e));
    c.on('object:modified',  (e) => this._afterChange(e));
    c.on('object:removed',   (e) => this._afterChange(e));
    c.on('object:moving',    (e) => this._markObservedPointerTransform(e, 'translate'));
    c.on('object:scaling',   (e) => this._markObservedPointerTransform(e, 'scale'));
    c.on('object:rotating',  (e) => this._markObservedPointerTransform(e, 'rotate'));
    c.on('object:skewing',   (e) => this._markObservedPointerTransform(e, 'skew'));
    c.on('object:resizing',  (e) => this._markObservedPointerTransform(e, 'resize'));

    // Merge brush/eraser strokes onto the selected layer instead of creating new path objects
    c.on('path:created', (e) => this._onPathCreated(e));

    // Selection
    c.on('selection:created',  (e) => this._onSelection(e.selected[0]));
    c.on('selection:updated',  (e) => this._onSelection(e.selected[0]));
    c.on('selection:cleared',  ()  => this._onSelection(null));
    c.on('text:editing:entered', () => this._beginViewportBaseTextEditing());
    c.on('text:editing:exited', () => this._endViewportBaseTextEditing());

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

    if (this._tryCommitObservedPointerTransform(event)) {
      if (this.onLayersChanged) this.onLayersChanged();
      return;
    }

    this._saveState();
    if (this.onLayersChanged) this.onLayersChanged();
  }

  _capturePointerTransformStart(target) {
    const targetId = this._getPointerTransformHistoryTargetId(target);
    if (!targetId) {
      this._pendingPointerTransform = null;
      return;
    }

    this._pendingPointerTransform = {
      targetId,
      beforeSnapshot: this._serializeCanvasState(),
      beforeSelectedObjectId: this.canvas.getActiveObject()?._id || null,
      beforeActiveLayerId: this.getActiveLayerId(),
      beforeTransform: this._getObservedPointerTransformState(target),
      didTransform: false,
      observedKinds: [],
      clearHandle: 0,
    };
  }

  _getPointerTransformHistoryTargetId(target) {
    if (!this._isSelectableUserObject(target)) return null;
    if (target?.type === 'activeSelection' || target?.type === 'group') return null;
    return this._ensureObjectId(target);
  }

  _getObservedPointerTransformState(target) {
    const matrix = typeof target?.calcTransformMatrix === 'function'
      ? target.calcTransformMatrix()
      : null;

    return {
      left: Number(target?.left) || 0,
      top: Number(target?.top) || 0,
      scaleX: Number(target?.scaleX) || 1,
      scaleY: Number(target?.scaleY) || 1,
      angle: Number(target?.angle) || 0,
      skewX: Number(target?.skewX) || 0,
      skewY: Number(target?.skewY) || 0,
      flipX: Boolean(target?.flipX),
      flipY: Boolean(target?.flipY),
      linearTransform: Array.isArray(matrix) && matrix.length >= 6
        ? matrix.slice(0, 4).map((value) => Number(value) || 0)
        : null,
    };
  }

  _hasObservedNumericTransformChange(beforeValue, afterValue, epsilon = 0.0001) {
    return Math.abs((Number(afterValue) || 0) - (Number(beforeValue) || 0)) > epsilon;
  }

  _describeObservedPointerTransform(before, after) {
    const changed = {
      translate: this._hasObservedNumericTransformChange(before.left, after.left)
        || this._hasObservedNumericTransformChange(before.top, after.top),
      scaleX: this._hasObservedNumericTransformChange(before.scaleX, after.scaleX),
      scaleY: this._hasObservedNumericTransformChange(before.scaleY, after.scaleY),
      angle: this._hasObservedNumericTransformChange(before.angle, after.angle),
      skewX: this._hasObservedNumericTransformChange(before.skewX, after.skewX),
      skewY: this._hasObservedNumericTransformChange(before.skewY, after.skewY),
      flipX: Boolean(before.flipX) !== Boolean(after.flipX)
        || (Number(before.scaleX) < 0) !== (Number(after.scaleX) < 0),
      flipY: Boolean(before.flipY) !== Boolean(after.flipY)
        || (Number(before.scaleY) < 0) !== (Number(after.scaleY) < 0),
    };

    const nonTranslateKinds = [];
    if (changed.scaleX || changed.scaleY) {
      nonTranslateKinds.push(changed.scaleX && changed.scaleY ? 'scale' : 'resize');
    }
    if (changed.angle) {
      nonTranslateKinds.push('rotate');
    }
    if (changed.skewX || changed.skewY) {
      nonTranslateKinds.push('skew');
    }
    if (changed.flipX || changed.flipY) {
      nonTranslateKinds.push('flip');
    }

    if (!changed.translate && nonTranslateKinds.length === 0) {
      return null;
    }

    const transformKinds = changed.translate && nonTranslateKinds.length > 0
      ? ['translate', ...nonTranslateKinds]
      : (nonTranslateKinds.length > 0 ? nonTranslateKinds.slice() : ['translate']);
    const primaryKind = nonTranslateKinds.length > 1
      ? 'mixed'
      : (nonTranslateKinds[0] || 'translate');

    return {
      mode: primaryKind === 'translate' ? 'pointer-move' : 'pointer-transform',
      primaryKind,
      transformKinds: [...new Set(transformKinds)],
      changed,
    };
  }

  _getPointerTransformLabel(primaryKind) {
    if (primaryKind === 'translate') return 'Move selection';
    if (primaryKind === 'rotate') return 'Rotate selection';
    if (primaryKind === 'scale') return 'Scale selection';
    if (primaryKind === 'resize') return 'Resize selection';
    if (primaryKind === 'skew') return 'Skew selection';
    if (primaryKind === 'flip') return 'Flip selection';
    return 'Transform selection';
  }

  _schedulePendingPointerTransformClear(targetId = null) {
    if (!this._pendingPointerTransform) return;

    const expectedTargetId = targetId || this._pendingPointerTransform.targetId;
    if (this._pendingPointerTransform.clearHandle) {
      window.clearTimeout(this._pendingPointerTransform.clearHandle);
    }

    this._pendingPointerTransform.clearHandle = window.setTimeout(() => {
      if (!this._pendingPointerTransform) return;
      if (this._pendingPointerTransform.targetId !== expectedTargetId) return;
      if (this._pendingPointerTransform.didTransform) return;
      this._pendingPointerTransform = null;
    }, 0);
  }

  _clearPendingPointerTransformCapture(targetId = null) {
    if (!this._pendingPointerTransform) return false;
    if (targetId && this._pendingPointerTransform.targetId !== targetId) return false;

    if (this._pendingPointerTransform.clearHandle) {
      window.clearTimeout(this._pendingPointerTransform.clearHandle);
    }

    this._pendingPointerTransform = null;
    return true;
  }

  _markObservedPointerTransform(event, kind) {
    const targetId = event?.target?._id || null;
    if (!targetId || this._pendingPointerTransform?.targetId !== targetId) return;

    this._pendingPointerTransform.didTransform = true;
    if (this._pendingPointerTransform.clearHandle) {
      window.clearTimeout(this._pendingPointerTransform.clearHandle);
      this._pendingPointerTransform.clearHandle = 0;
    }

    if (kind && !this._pendingPointerTransform.observedKinds.includes(kind)) {
      this._pendingPointerTransform.observedKinds.push(kind);
    }
  }

  _tryCommitObservedPointerTransform(event) {
    if (event?.target == null || event.target.type == null) return false;
    if (event?.target?._id == null || this._pendingPointerTransform?.targetId !== event.target._id) return false;

    const pending = this._pendingPointerTransform;
    this._pendingPointerTransform = null;

    if (pending.clearHandle) {
      window.clearTimeout(pending.clearHandle);
    }

    if (!this._getPointerTransformHistoryTargetId(event.target)) {
      this._restoreViewportBaseLiveOverlay({ render: false });
      return false;
    }

    const before = pending.beforeTransform;
    const after = this._getObservedPointerTransformState(event.target);
    const transform = this._describeObservedPointerTransform(before, after);
    if (!transform) {
      this._restoreViewportBaseLiveOverlay({ render: false });
      return false;
    }

    if (!this._historySession) {
      this._restoreViewportBaseLiveOverlay({ render: false });
      return false;
    }

    if (this._isExclusiveAsyncPaintMutationActive()) {
      this._restoreViewportBaseLiveOverlay({ render: false });
      return false;
    }

    const historyApi = window.LiveryLabHistory;
    const operationName = historyApi?.OPERATION_TYPES?.OBJECT_TRANSFORM_SET || 'document.object.transform.set';
    const checkpointBoundary = historyApi?.CHECKPOINT_BOUNDARIES?.PER_OPERATION || 'per-operation';
    const reversibility = historyApi?.REVERSIBILITY?.REVERSIBLE || 'reversible';

    this._flushPendingHistoryTransaction('boundary');
    this._historySession.openTransaction({
      name: operationName,
      label: this._getPointerTransformLabel(transform.primaryKind),
      coalesceKey: `${transform.mode}:${event.target._id}`,
      reversibility,
      checkpointBoundary,
      beforeSnapshot: pending.beforeSnapshot,
      beforeSelectedObjectId: pending.beforeSelectedObjectId,
      beforeActiveLayerId: pending.beforeActiveLayerId,
      renderInvalidation: {
        scope: 'viewport-and-export',
        kind: 'object-transform',
        layerIds: [event.target._id].filter(Boolean),
      },
    });

    this._historySession.recordOperation({
      name: operationName,
      targetId: event.target._id || null,
      mode: transform.mode,
      kind: transform.primaryKind,
      transformKinds: transform.transformKinds,
      observedKinds: pending.observedKinds || [],
      before: {
        left: before.left,
        top: before.top,
        scaleX: before.scaleX,
        scaleY: before.scaleY,
        angle: before.angle,
        skewX: before.skewX,
        skewY: before.skewY,
        flipX: before.flipX,
        flipY: before.flipY,
      },
      after: {
        left: after.left,
        top: after.top,
        scaleX: after.scaleX,
        scaleY: after.scaleY,
        angle: after.angle,
        skewX: after.skewX,
        skewY: after.skewY,
        flipX: after.flipX,
        flipY: after.flipY,
      },
      delta: {
        dx: after.left - before.left,
        dy: after.top - before.top,
        dScaleX: after.scaleX - before.scaleX,
        dScaleY: after.scaleY - before.scaleY,
        dAngle: after.angle - before.angle,
        dSkewX: after.skewX - before.skewX,
        dSkewY: after.skewY - before.skewY,
        flipXChanged: before.flipX !== after.flipX,
        flipYChanged: before.flipY !== after.flipY,
      },
    });

    this._restoreViewportBaseLiveOverlay({ render: false });

    const entry = this._historySession.commitActiveTransaction({
      afterSnapshot: this._serializeCanvasState(),
      afterSelectedObjectId: this.canvas.getActiveObject()?._id || null,
      afterActiveLayerId: this.getActiveLayerId(),
      commitReason: 'explicit',
    });

    if (!entry) return false;

    this._pushHistorySnapshot(entry.afterSnapshot, { clearRedo: true });
    this._scheduleViewportBaseSync();
    return true;
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
    if ((this.currentTool === 'brush' || this.currentTool === 'eraser') && this._activeToolController?.pathCreated) {
      this._activeToolController.pathCreated(path);
      return;
    }

    const isErase = this.currentTool === 'eraser';
    this._commitFreeDrawPath(this.currentTool, path, isErase);
  }

  _commitFreeDrawPath(toolName, path, isErase = toolName === 'eraser') {
    if (!path) return false;

    this.canvas.remove(path);
    void this._commitStrokeToPaintTarget(path, isErase);
    return true;
  }

  async _commitStrokeToPaintTarget(path, isErase = false) {
    if (!path) return false;

    const historyApi = window.LiveryLabHistory;
    const operationName = historyApi?.OPERATION_TYPES?.STROKE_COMMIT || 'document.stroke.commit';
    const checkpointBoundary = historyApi?.CHECKPOINT_BOUNDARIES?.PER_OPERATION || 'per-operation';
    const reversibility = historyApi?.REVERSIBILITY?.REVERSIBLE || 'reversible';
    const toolName = isErase ? 'eraser' : 'brush';

    const { result } = await this._runTargetedDocumentTransaction({
      name: operationName,
      label: isErase ? 'Commit eraser stroke' : 'Commit brush stroke',
      coalesceKey: (context) => `stroke:${toolName}:${context.targetLayerId}`,
      reversibility,
      checkpointBoundary,
      exclusiveMutationBarrier: 'async-paint',
      resolveTarget: () => {
        let target = this._activeLayer;
        if (target && this.canvas.getObjects().indexOf(target) < 0) {
          target = null;
        }

        let createdTargetLayer = false;
        if (!this._isValidPaintLayer(target)) {
          target = this._createBlankLayer(false);
          createdTargetLayer = true;
        }

        if (!this._isValidPaintLayer(target)) {
          return false;
        }

        const targetLayerId = this._ensureObjectId(target);
        const dirtyRect = this._getObjectArtboardCommitRect(path, this._getStrokeCommitPadding(path));

        return {
          target,
          targetLayerId,
          createdTargetLayer,
          dirtyRect,
          abort: createdTargetLayer
            ? () => this._removeCanvasObjectWithoutHistory(target)
            : null,
        };
      },
      renderInvalidation: (context) => this._buildLayerContentInvalidation(
        context.targetLayerId,
        context.dirtyRect,
        { targetType: 'paint-layer' },
      ),
      operation: (transactionResult, context) => ({
        name: operationName,
        targetLayerId: context.targetLayerId,
        targetKind: 'paint-layer',
        tool: toolName,
        compositeMode: isErase ? 'destination-out' : 'source-over',
        commitPath: transactionResult.commitPath,
        commitSurfaceScope: transactionResult.commitSurfaceScope || null,
        dirtyRect: transactionResult.dirtyRect || context.dirtyRect || null,
        createdTargetLayer: context.createdTargetLayer,
        invalidation: this._buildLayerContentInvalidation(
          context.targetLayerId,
          transactionResult.dirtyRect || context.dirtyRect,
          { targetType: 'paint-layer' },
        ),
      }),
      apply: async (context) => {
        const commitOptions = { recordHistory: false, emitEvents: false };
        const sharedRasterSupport = this._resolveSharedRasterLayerSupport(context.target);
        const fallbackMerge = () => this._mergeObjectOntoLayerLegacy(context.target, path, isErase, commitOptions);
        const sharedCommit = this._tryCommitCroppedStrokeToSharedRasterLayer(
          context.target,
          path,
          isErase,
          sharedRasterSupport,
          fallbackMerge,
          commitOptions,
        );

        if (sharedCommit) {
          return await sharedCommit;
        }

        const fullSourceCommit = this._tryCommitFullSourceStrokeToSharedRasterLayer(
          context.target,
          path,
          isErase,
          sharedRasterSupport,
          fallbackMerge,
          commitOptions,
        );
        if (fullSourceCommit) {
          return await fullSourceCommit;
        }

        return await fallbackMerge();
      },
      afterCommit: (transactionResult, context) => {
        this._emitLayerCommitEvents(transactionResult?.committedTarget || context.target);
      },
    });

    return !!result;
  }


  _onSelection(obj) {
    if (obj && !this._isSelectableUserObject(obj)) {
      this.canvas.discardActiveObject();
      this.canvas.renderAll();
      this._refreshLiveDocumentMirrorSession();
      if (this.onSelectionChanged) this.onSelectionChanged(null);
      return;
    }

    if (this._isViewportBaseLiveOverlayActive('keyboard-nudge')) {
      const liveOverlayTargetId = this._viewportBaseLiveOverlay?.liveObjectId || null;
    this._refreshLiveDocumentMirrorSession();
      if (liveOverlayTargetId !== (obj?._id || null)) {
        this._endViewportBaseKeyboardManipulation();
      }
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

    this._syncViewportBaseSuspensionReasons();

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

  _isWorkspaceLayerOpacityEditableObject(obj) {
    return this._isSelectableUserObject(obj);
  }

  _canDeleteLayerObject(obj) {
    return !!obj &&
      obj.name !== '__template__' &&
      obj.name !== '__background__' &&
      !obj._isGuide &&
      !obj._isSpecMap &&
      !obj.locked;
  }

  _isInteractiveInCurrentMode(obj) {
    if (!this._isSelectableUserObject(obj)) return false;
    return this.currentTool === 'select';
  }

  _syncObjectInteractivity(target = null) {
    const isSelectMode = this.currentTool === 'select';

    this.canvas.getObjects().forEach(obj => {
      let interactive;
      if (isSelectMode) {
        // In select mode ALL user-editable objects stay interactive so that
        // Fabric's built-in z-order hit-testing works — clicking a layer
        // visually above another will correctly select the upper one.
        // Protected/hidden/locked layers still get locked out.
        interactive = this._isSelectableUserObject(obj);
      } else {
        // In paint/shape/other modes: only the explicit target (if any) is
        // interactive; everything else is locked to prevent accidental moves.
        interactive = target
          ? (obj === target && this._isSelectableUserObject(obj))
          : this._isInteractiveInCurrentMode(obj);
      }
      obj.set({
        selectable:  interactive,
        evented:     interactive,
        hasControls: interactive,
        hasBorders:  interactive,
      });
      // Recalculate control hit-areas so handles appear at the correct
      // positions after interactivity is restored.
      if (interactive && typeof obj.setCoords === 'function') obj.setCoords();
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

  _resolveWorkspaceEditableObjectById(projectedLayerId) {
    const obj = this._getObjectById(projectedLayerId);
    return this._isSelectableUserObject(obj) ? obj : null;
  }

  _canToggleWorkspaceLayerVisibilityObject(obj) {
    return !!obj && !obj._isSpecMap;
  }

  _getWorkspaceSelectionActionTarget(activeObject = this.canvas.getActiveObject() || null) {
    return this._isSelectableUserObject(activeObject) ? activeObject : null;
  }

  _getWorkspaceSelectionActionState(activeObject = this.canvas.getActiveObject() || null) {
    const target = this._getWorkspaceSelectionActionTarget(activeObject);
    const selectionTargetId = target?._id || null;
    const selectionScopedWritesAllowed = !this._isExclusiveAsyncPaintMutationActive();

    return {
      selectionTargetId,
      canDuplicateSelection: !!target && selectionScopedWritesAllowed,
      canDeleteSelection: !!target && selectionScopedWritesAllowed && this._canDeleteLayerObject(target),
      canReorderSelection: !!target && selectionScopedWritesAllowed,
      canChangeLayerOpacity: !!target && selectionScopedWritesAllowed && this._isWorkspaceLayerOpacityEditableObject(target),
    };
  }

  _getWorkspaceLayerRowActionState(obj) {
    const rowScopedWritesAllowed = !this._isExclusiveAsyncPaintMutationActive();

    return {
      canSelect: this._isSelectableUserObject(obj),
      canToggleVisibility: rowScopedWritesAllowed && this._canToggleWorkspaceLayerVisibilityObject(obj),
      canDelete: rowScopedWritesAllowed && this._canDeleteLayerObject(obj),
    };
  }

  _runWorkspaceInspectorObjectActionById(projectedObjectId, apply) {
    if (this._isExclusiveAsyncPaintMutationActive()) return false;

    const target = this._resolveWorkspaceEditableObjectById(projectedObjectId);
    if (!target || typeof apply !== 'function') return false;

    const previousActiveObject = this.canvas.getActiveObject() || null;
    const switchedTarget = previousActiveObject !== target;

    if (switchedTarget) {
      this.canvas.setActiveObject(target);
    }

    let result = false;
    try {
      result = apply(target);
    } finally {
      if (switchedTarget) {
        if (previousActiveObject && this.canvas.getObjects().includes(previousActiveObject)) {
          this.canvas.setActiveObject(previousActiveObject);
        } else {
          this.canvas.discardActiveObject();
        }
        this.canvas.renderAll();
      }
    }

    if (result && this.onSelectionChanged) {
      this.onSelectionChanged(this.canvas.getActiveObject() || null);
    }

    return !!result;
  }

  _canApplyWorkspaceInspectorPrimaryColor(target) {
    return !!target && (
      target.type === 'path' ||
      target.type === 'i-text' ||
      target.type === 'text' ||
      target.type === 'rect' ||
      target.type === 'ellipse' ||
      target.type === 'circle' ||
      target.type === 'line' ||
      this._isGradientObject(target)
    );
  }

  _canApplyWorkspaceInspectorSecondaryColor(target) {
    return !!target && (
      target.type === 'line' ||
      target.type === 'rect' ||
      target.type === 'ellipse' ||
      target.type === 'circle' ||
      this._isGradientObject(target)
    );
  }

  _canApplyWorkspaceInspectorTextStyle(target) {
    return !!target && (target.type === 'i-text' || target.type === 'text');
  }

  _canApplyWorkspaceInspectorStrokeWidth(target) {
    return !!target && target.strokeWidth !== undefined;
  }

  _normalizeWorkspaceInspectorColor(value) {
    if (typeof value !== 'string') return null;
    const normalized = value.trim().toLowerCase();
    return normalized || null;
  }

  _normalizeWorkspaceInspectorPropertyValue(propertyKey, value) {
    switch (propertyKey) {
      case 'primaryColor':
      case 'secondaryColor':
        return this._normalizeWorkspaceInspectorColor(value);
      case 'opacity': {
        const normalized = Math.max(0, Math.min(1, Number(value)));
        return Number.isFinite(normalized) ? normalized : null;
      }
      case 'strokeWidth': {
        const normalized = Math.max(0, Number(value));
        return Number.isFinite(normalized) ? normalized : null;
      }
      case 'fontFamily': {
        if (typeof value !== 'string') return null;
        const normalized = value.trim();
        return normalized || null;
      }
      case 'fontSize': {
        const normalized = Number(value);
        return Number.isFinite(normalized) ? normalized : null;
      }
      default:
        return value;
    }
  }

  _getWorkspaceInspectorPropertyCurrentValue(target, propertyKey) {
    if (!target) return null;

    switch (propertyKey) {
      case 'primaryColor':
        return this._normalizeWorkspaceInspectorColor(
          typeof target._primaryColor === 'string'
            ? target._primaryColor
            : (typeof target.fill === 'string' && target.fill.startsWith('#')
                ? target.fill
                : (typeof target.stroke === 'string' && target.stroke.startsWith('#') ? target.stroke : null))
        );
      case 'secondaryColor':
        return this._normalizeWorkspaceInspectorColor(
          typeof target._secondaryColor === 'string'
            ? target._secondaryColor
            : (typeof target.stroke === 'string' && target.stroke.startsWith('#') ? target.stroke : null)
        );
      case 'opacity':
        return Number.isFinite(Number(target.opacity)) ? Number(target.opacity) : 1;
      case 'strokeWidth':
        return Number.isFinite(Number(target.strokeWidth)) ? Number(target.strokeWidth) : null;
      case 'fontFamily':
        return typeof target.fontFamily === 'string' && target.fontFamily ? target.fontFamily.trim() : null;
      case 'fontSize':
        return Number.isFinite(Number(target.fontSize)) ? Number(target.fontSize) : null;
      default:
        return null;
    }
  }

  _workspaceInspectorPropertyValuesEqual(propertyKey, currentValue, nextValue) {
    if (propertyKey === 'opacity') {
      return Math.abs(Number(currentValue) - Number(nextValue)) < 0.0001;
    }

    return currentValue === nextValue;
  }

  _applyWorkspaceInspectorPropertyChangeById(projectedObjectId, options = {}) {
    if (this._isExclusiveAsyncPaintMutationActive()) return false;

    const apply = typeof options.apply === 'function' ? options.apply : null;
    const propertyKey = typeof options.propertyKey === 'string' ? options.propertyKey : null;
    const target = this._resolveWorkspaceEditableObjectById(projectedObjectId);
    if (!target || !propertyKey || !apply) return false;

    const nextValue = this._normalizeWorkspaceInspectorPropertyValue(propertyKey, options.value);
    if (nextValue == null) return false;

    if (typeof options.canApply === 'function' && !options.canApply(target, nextValue)) {
      return false;
    }

    const currentValue = this._getWorkspaceInspectorPropertyCurrentValue(target, propertyKey);
    if (this._workspaceInspectorPropertyValuesEqual(propertyKey, currentValue, nextValue)) {
      return false;
    }

    const historyApi = window.LiveryLabHistory;
    const operationName = historyApi?.OPERATION_TYPES?.OBJECT_PROPERTIES_SET || 'document.object.properties.set';
    const checkpointBoundary = options.coalesce
      ? (historyApi?.CHECKPOINT_BOUNDARIES?.TRANSACTION_IDLE || 'transaction-idle')
      : (historyApi?.CHECKPOINT_BOUNDARIES?.PER_OPERATION || 'per-operation');
    const reversibility = historyApi?.REVERSIBILITY?.REVERSIBLE || 'reversible';
    const activeObject = this.canvas.getActiveObject() || null;
    const targetId = target._id || null;
    const transactionMeta = {
      name: operationName,
      label: options.label || 'Edit object properties',
      coalesceKey: options.coalesceKey || `object-properties:${propertyKey}:${targetId || 'active-object'}`,
      reversibility,
      checkpointBoundary,
      coalesceWindowMs: options.coalesce ? -1 : undefined,
      beforeSnapshot: this._serializeCanvasState(),
      beforeSelectedObjectId: activeObject?._id || null,
      beforeActiveLayerId: this.getActiveLayerId(),
      renderInvalidation: {
        scope: 'viewport-and-export',
        kind: 'object-properties',
        layerIds: [targetId].filter(Boolean),
        propertyKeys: [propertyKey],
      },
    };

    let openedTransaction = false;
    if (this._historySession) {
      if (!this._historySession.canExtendActiveTransaction(transactionMeta)) {
        this._flushPendingHistoryTransaction('boundary');
        if (this._isExclusiveAsyncPaintMutationActive()) return false;
        this._historySession.openTransaction(transactionMeta);
        openedTransaction = true;
      }
    }

    const result = this._runWorkspaceInspectorObjectActionById(projectedObjectId, (resolvedTarget) => apply(nextValue, resolvedTarget));
    if (!result) {
      if (openedTransaction) {
        this._discardPendingHistoryTransaction('no-op');
      }
      return false;
    }

    if (this._historySession) {
      this._historySession.recordOperation({
        name: operationName,
        targetId,
        propertyKey,
        value: nextValue,
        mode: options.mode || (options.coalesce ? 'coalesced-input' : 'discrete-change'),
      });

      if (options.coalesce) {
        this._pendingWorkspaceInspectorCommit = true;
      } else {
        this._flushPendingHistoryTransaction('explicit');
      }
    } else if (options.coalesce) {
      this._pendingWorkspaceInspectorCommit = true;
    } else {
      this._saveState();
    }

    return true;
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

  _replaceLayerWithImage(target, mergedDataUrl, options = {}) {
    const idx = this.canvas.getObjects().indexOf(target);
    if (idx < 0) return Promise.resolve(false);

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
      left:                     target.left,
      top:                      target.top,
      scaleX:                   target.scaleX,
      scaleY:                   target.scaleY,
      angle:                    target.angle,
      skewX:                    target.skewX,
      skewY:                    target.skewY,
      flipX:                    !!target.flipX,
      flipY:                    !!target.flipY,
      originX:                  target.originX,
      originY:                  target.originY,
    };

    return new Promise((resolve) => {
      fabric.Image.fromURL(mergedDataUrl, (newImg) => {
        newImg.set(oldProps);

        const previousSuspendHistory = this._suspendHistory;
        this._suspendHistory = true;
        this.canvas.remove(target);
        this.canvas.insertAt(newImg, idx);
        this._suspendHistory = previousSuspendHistory;

        this._activeLayer = newImg;
        this.canvas.setActiveObject(newImg);
        this.canvas.renderAll();
        this._syncViewportBaseSuspensionReasons();
        if (options.recordHistory !== false) {
          this._saveState();
        }
        if (options.emitEvents !== false) {
          this._emitLayerCommitEvents(newImg);
        }
        resolve(newImg);
      }, { crossOrigin: 'anonymous' });
    });
  }

  _resolveSharedRasterLayerSupport(target) {
    if (!this._isValidPaintLayer(target)) {
      return { supported: false, reason: 'invalid-target', layer: null, surface: null };
    }

    if (!window.LiveryLabRender?.resolveSurfaceLayerSupport || !window.LiveryLabDocument?.createDocumentSnapshot) {
      return { supported: false, reason: 'missing-render-contract', layer: null, surface: null };
    }

    const layerId = this._ensureObjectId(target);
    const documentPayload = window.LiveryLabDocument.createDocumentSnapshot(this);
    const surfaceRegistry = window.LiveryLabRender.createFabricSurfaceRegistry({
      fabricCanvas: this.canvas,
      document: documentPayload,
    });

    return window.LiveryLabRender.resolveSurfaceLayerSupport({
      document: documentPayload,
      surfaceRegistry,
      layerId,
    });
  }

  _resolveSharedRasterLayerCommitSupport(target, sharedRasterSupport = null) {
    if (!this._isValidPaintLayer(target)) {
      return { supported: false, reason: 'invalid-target', layer: null, surface: null, targetElement: null };
    }

    const layerSupport = sharedRasterSupport || this._resolveSharedRasterLayerSupport(target);
    if (!layerSupport?.supported) {
      return {
        ...(layerSupport || {}),
        supported: false,
        targetElement: null,
      };
    }

    const layerType = layerSupport.layer?.layerType || null;
    if (layerType !== 'raster-layer' && layerType !== 'overlay-image') {
      return {
        ...layerSupport,
        supported: false,
        reason: 'unsupported-commit-layer-type',
        targetElement: null,
      };
    }

    const targetElement = target.getElement ? target.getElement() : target._element;
    if (!targetElement) {
      return {
        ...layerSupport,
        supported: false,
        reason: 'missing-target-element',
        targetElement: null,
      };
    }

    const surface = layerSupport.surface || {};
    const sourceWidth = Math.max(1, Math.round(Number(surface.sourceWidth ?? target.width ?? targetElement.naturalWidth ?? targetElement.width ?? 1) || 1));
    const sourceHeight = Math.max(1, Math.round(Number(surface.sourceHeight ?? target.height ?? targetElement.naturalHeight ?? targetElement.height ?? 1) || 1));
    const targetScaleX = Number(surface.scaleX ?? target.scaleX ?? 1);
    const targetScaleY = Number(surface.scaleY ?? target.scaleY ?? 1);
    const targetAngle = Number(surface.angle ?? target.angle ?? 0);
    const targetArtboardLeft = Number(surface.left ?? target.left ?? 0);
    const targetArtboardTop = Number(surface.top ?? target.top ?? 0);
    const targetDisplayWidth = Math.abs(sourceWidth * targetScaleX);
    const targetDisplayHeight = Math.abs(sourceHeight * targetScaleY);
    const normalizeBlendMode = window.LiveryLabRender?.normalizeBlendMode;
    const isSupportedBlendModeForLayerType = window.LiveryLabRender?.isSupportedBlendModeForLayerType;
    const targetBlendMode = typeof normalizeBlendMode === 'function'
      ? normalizeBlendMode(surface.blendMode || layerSupport.layer?.blendMode || 'source-over')
      : ((typeof surface.blendMode === 'string' && surface.blendMode)
          || (typeof layerSupport.layer?.blendMode === 'string' && layerSupport.layer.blendMode)
          || 'source-over');
    const blendModeSupported = typeof isSupportedBlendModeForLayerType === 'function'
      ? isSupportedBlendModeForLayerType(layerType, targetBlendMode)
      : ['source-over', 'destination-out', 'multiply', 'screen'].includes(targetBlendMode);

    if (!blendModeSupported) {
      return {
        ...layerSupport,
        supported: false,
        reason: 'unsupported-commit-blend-mode',
        targetElement,
        blendMode: targetBlendMode,
      };
    }

    if (
      !Number.isFinite(targetScaleX)
      || !Number.isFinite(targetScaleY)
      || Math.abs(targetScaleX) < 0.001
      || Math.abs(targetScaleY) < 0.001
      || !Number.isFinite(targetArtboardLeft)
      || !Number.isFinite(targetArtboardTop)
      || targetDisplayWidth <= 0
      || targetDisplayHeight <= 0
    ) {
      return {
        ...layerSupport,
        supported: false,
        reason: 'degenerate-target-bounds',
        targetElement,
        blendMode: targetBlendMode,
      };
    }

    const targetMatrix = typeof target?.calcTransformMatrix === 'function'
      ? target.calcTransformMatrix()
      : null;
    const inverseMatrix = Array.isArray(targetMatrix) && targetMatrix.length >= 6 && fabric?.util?.invertTransform
      ? fabric.util.invertTransform(targetMatrix)
      : null;

    return {
      ...layerSupport,
      supported: true,
      reason: null,
      targetElement,
      sourceWidth,
      sourceHeight,
      targetScaleX,
      targetScaleY,
      targetAngle,
      targetArtboardLeft,
      targetArtboardTop,
      targetDisplayWidth,
      targetDisplayHeight,
      targetMatrix,
      inverseMatrix,
      blendMode: targetBlendMode,
    };
  }

  _resolveSharedViewportLayerSupport(target) {
    if (!this._isSelectableUserObject(target)) {
      return { supported: false, reason: 'invalid-target', layer: null, surface: null };
    }

    if (!window.LiveryLabRender?.resolveSurfaceLayerSupport || !window.LiveryLabDocument?.createDocumentSnapshot) {
      return { supported: false, reason: 'missing-render-contract', layer: null, surface: null };
    }

    const layerId = this._ensureObjectId(target);
    const documentPayload = window.LiveryLabDocument.createDocumentSnapshot(this);
    const surfaceRegistry = window.LiveryLabRender.createFabricSurfaceRegistry({
      fabricCanvas: this.canvas,
      document: documentPayload,
    });

    return window.LiveryLabRender.resolveSurfaceLayerSupport({
      document: documentPayload,
      surfaceRegistry,
      layerId,
    });
  }

  _resolveSharedViewportLiveOverlaySupport(target) {
    const layerSupport = this._resolveSharedViewportLayerSupport(target);
    if (!layerSupport?.supported) return layerSupport;

    const normalizeBlendMode = window.LiveryLabRender?.normalizeBlendMode;
    const targetBlendMode = typeof normalizeBlendMode === 'function'
      ? normalizeBlendMode(layerSupport?.surface?.blendMode || layerSupport?.layer?.blendMode || 'source-over')
      : ((typeof layerSupport?.surface?.blendMode === 'string' && layerSupport.surface.blendMode)
          || (typeof layerSupport?.layer?.blendMode === 'string' && layerSupport.layer.blendMode)
          || 'source-over');

    if (targetBlendMode !== 'source-over') {
      return {
        ...layerSupport,
        supported: false,
        reason: 'unsupported-live-overlay-blend-mode',
        blendMode: targetBlendMode,
      };
    }

    return {
      ...layerSupport,
      blendMode: targetBlendMode,
    };
  }

  _createSharedSurfaceContext() {
    if (!window.LiveryLabRender || !window.LiveryLabDocument?.createDocumentSnapshot) {
      return null;
    }

    const documentPayload = window.LiveryLabDocument.createDocumentSnapshot(this);
    const surfaceRegistry = window.LiveryLabRender.createFabricSurfaceRegistry({
      fabricCanvas: this.canvas,
      document: documentPayload,
    });

    return {
      documentPayload,
      surfaceRegistry,
    };
  }

  _resolveSharedCroppedRasterLayerSupport(target, sharedRasterSupport = null) {
    const commitSupport = this._resolveSharedRasterLayerCommitSupport(target, sharedRasterSupport);
    if (!commitSupport?.supported) {
      return {
        ...(commitSupport || {}),
        supported: false,
        targetElement: commitSupport?.targetElement || null,
      };
    }

    const targetElement = commitSupport.targetElement;
    const sourceWidth = commitSupport.sourceWidth;
    const sourceHeight = commitSupport.sourceHeight;
    const targetScaleX = commitSupport.targetScaleX;
    const targetScaleY = commitSupport.targetScaleY;
    const targetAngle = commitSupport.targetAngle;
    const targetSkewX = Number(target?.skewX ?? 0);
    const targetSkewY = Number(target?.skewY ?? 0);
    const targetArtboardLeft = commitSupport.targetArtboardLeft;
    const targetArtboardTop = commitSupport.targetArtboardTop;
    const targetDisplayWidth = sourceWidth * targetScaleX;
    const targetDisplayHeight = sourceHeight * targetScaleY;

    if (commitSupport.blendMode !== 'source-over' && commitSupport.blendMode !== 'destination-out') {
      return {
        ...commitSupport,
        supported: false,
        reason: 'unsupported-cropped-commit-blend-mode',
        targetElement,
      };
    }

    if (Math.abs(targetAngle) > 0.001) {
      return {
        ...commitSupport,
        supported: false,
        reason: 'rotated-target',
        targetElement,
      };
    }

    if (Math.abs(targetSkewX) > 0.001 || Math.abs(targetSkewY) > 0.001) {
      return {
        ...commitSupport,
        supported: false,
        reason: 'skewed-target',
        targetElement,
      };
    }

    if (targetScaleX < 0 || targetScaleY < 0 || target?.flipX || target?.flipY) {
      return {
        ...commitSupport,
        supported: false,
        reason: 'flipped-target',
        targetElement,
      };
    }

    if (targetDisplayWidth <= 0 || targetDisplayHeight <= 0) {
      return {
        ...commitSupport,
        supported: false,
        reason: 'degenerate-target-bounds',
        targetElement,
      };
    }

    return {
      ...commitSupport,
      supported: true,
      reason: null,
      targetElement,
      sourceWidth,
      sourceHeight,
      targetArtboardLeft,
      targetArtboardTop,
      targetDisplayWidth,
      targetDisplayHeight,
      targetScaleX,
      targetScaleY,
      targetAngle,
    };
  }

  _mapArtboardPointToTargetSourcePixel(x, y, commitSupport) {
    if (!commitSupport?.supported) return null;

    const px = Number(x);
    const py = Number(y);
    if (!Number.isFinite(px) || !Number.isFinite(py)) return null;

    let localPoint = null;
    if (commitSupport.inverseMatrix && fabric?.util?.transformPoint && fabric?.Point) {
      localPoint = fabric.util.transformPoint(new fabric.Point(px, py), commitSupport.inverseMatrix);
    } else if (Number.isFinite(commitSupport.targetScaleX) && Number.isFinite(commitSupport.targetScaleY) && Math.abs(commitSupport.targetScaleX) > 0.001 && Math.abs(commitSupport.targetScaleY) > 0.001) {
      localPoint = {
        x: (px - (Number(commitSupport.targetArtboardLeft) || 0)) / commitSupport.targetScaleX,
        y: (py - (Number(commitSupport.targetArtboardTop) || 0)) / commitSupport.targetScaleY,
      };
    }

    if (!localPoint || !Number.isFinite(localPoint.x) || !Number.isFinite(localPoint.y)) {
      return null;
    }

    const sourceWidth = Math.max(1, Math.round(Number(commitSupport.sourceWidth) || 1));
    const sourceHeight = Math.max(1, Math.round(Number(commitSupport.sourceHeight) || 1));
    const localX = Math.floor(localPoint.x);
    const localY = Math.floor(localPoint.y);

    if (localX < 0 || localX >= sourceWidth || localY < 0 || localY >= sourceHeight) {
      return null;
    }

    return {
      localX,
      localY,
      point: localPoint,
    };
  }

  _mapArtboardRectToTargetSourcePatchRect(rect, croppedSupport) {
    if (!croppedSupport?.supported) return null;

    const normalizedRect = rect && Number(rect.width) > 0 && Number(rect.height) > 0
      ? {
          left: Number(rect.left) || 0,
          top: Number(rect.top) || 0,
          width: Number(rect.width) || 0,
          height: Number(rect.height) || 0,
        }
      : null;
    if (!normalizedRect) return null;

    const sourceWidth = Math.max(1, Math.round(Number(croppedSupport.sourceWidth) || 1));
    const sourceHeight = Math.max(1, Math.round(Number(croppedSupport.sourceHeight) || 1));
    const scaleX = Number(croppedSupport.targetScaleX) || 0;
    const scaleY = Number(croppedSupport.targetScaleY) || 0;
    if (scaleX <= 0 || scaleY <= 0) return null;

    const rawLeft = (normalizedRect.left - croppedSupport.targetArtboardLeft) / scaleX;
    const rawTop = (normalizedRect.top - croppedSupport.targetArtboardTop) / scaleY;
    const rawRight = (normalizedRect.left + normalizedRect.width - croppedSupport.targetArtboardLeft) / scaleX;
    const rawBottom = (normalizedRect.top + normalizedRect.height - croppedSupport.targetArtboardTop) / scaleY;

    const clampedLeft = Math.max(0, Math.min(sourceWidth, rawLeft));
    const clampedTop = Math.max(0, Math.min(sourceHeight, rawTop));
    const clampedRight = Math.max(0, Math.min(sourceWidth, rawRight));
    const clampedBottom = Math.max(0, Math.min(sourceHeight, rawBottom));
    if (clampedRight <= clampedLeft || clampedBottom <= clampedTop) return null;

    const sourceRect = {
      left: Math.max(0, Math.floor(clampedLeft)),
      top: Math.max(0, Math.floor(clampedTop)),
      width: Math.max(1, Math.min(sourceWidth, Math.ceil(clampedRight)) - Math.max(0, Math.floor(clampedLeft))),
      height: Math.max(1, Math.min(sourceHeight, Math.ceil(clampedBottom)) - Math.max(0, Math.floor(clampedTop))),
    };

    return {
      sourceRect,
      destinationRect: {
        left: clampedLeft - sourceRect.left,
        top: clampedTop - sourceRect.top,
        width: clampedRight - clampedLeft,
        height: clampedBottom - clampedTop,
      },
    };
  }

  _resolveMountedViewportBaseFreeDrawSupport(target) {
    if (!this._isValidPaintLayer(target)) {
      return { supported: false, reason: 'invalid-target', documentSupport: null, layer: null, surface: null };
    }

    const sharedContext = this._createSharedSurfaceContext();
    if (!sharedContext || !window.LiveryLabRender?.analyzeDocumentSupport) {
      return { supported: false, reason: 'missing-render-contract', documentSupport: null, layer: null, surface: null };
    }

    const documentSupport = window.LiveryLabRender.analyzeDocumentSupport({
      document: sharedContext.documentPayload,
      surfaceRegistry: sharedContext.surfaceRegistry,
      mode: 'viewport',
    });
    if (!documentSupport?.supported) {
      return {
        supported: false,
        reason: documentSupport?.fallbackReason || documentSupport?.reason || 'unsupported-document',
        documentSupport,
        layer: null,
        surface: null,
      };
    }

    const layerId = this._ensureObjectId(target);
    const layerSupport = window.LiveryLabRender.resolveSurfaceLayerSupport({
      document: sharedContext.documentPayload,
      surfaceRegistry: sharedContext.surfaceRegistry,
      layerId,
    });
    const croppedSupport = this._resolveSharedCroppedRasterLayerSupport(target, layerSupport);

    const normalizeBlendMode = window.LiveryLabRender?.normalizeBlendMode;
    const targetBlendMode = typeof normalizeBlendMode === 'function'
      ? normalizeBlendMode(croppedSupport?.surface?.blendMode || croppedSupport?.layer?.blendMode || 'source-over')
      : ((typeof croppedSupport?.surface?.blendMode === 'string' && croppedSupport.surface.blendMode)
          || (typeof croppedSupport?.layer?.blendMode === 'string' && croppedSupport.layer.blendMode)
          || 'source-over');

    if (croppedSupport?.supported && targetBlendMode !== 'source-over' && targetBlendMode !== 'destination-out') {
      return {
        ...croppedSupport,
        supported: false,
        reason: 'unsupported-live-free-draw-blend-mode',
        blendMode: targetBlendMode,
        documentSupport,
      };
    }

    return {
      ...croppedSupport,
      blendMode: targetBlendMode,
      documentSupport,
    };
  }

  _shouldSuspendViewportBaseForCurrentFreeDraw() {
    if (this.currentTool !== 'brush' && this.currentTool !== 'eraser') {
      return false;
    }

    return !this._resolveMountedViewportBaseFreeDrawSupport(this._activeLayer).supported;
  }

  _canKeepViewportBaseMountedForSelectInteraction(/* target */) {
    // Disabled: the viewport-base live overlay rendered all layers
    // (including the target at its pre-transform position) beneath the
    // Fabric canvas.  Because the Fabric canvas background is cleared to
    // transparent during the overlay, the stale target image bled
    // through, causing the object to appear doubled / jump during
    // drag and snap to a different spot on release.
    // Suspending the viewport base during select-transforms avoids the
    // duplicate render entirely — Fabric renders all objects normally.
    return false;
  }

  _canKeepViewportBaseMountedForKeyboardInteraction(target) {
    if (this.currentTool !== 'select') return false;
    return this._canKeepViewportBaseMountedForSelectInteraction(target);
  }

  _canKeepViewportBaseMountedForPreview(toolName) {
    if (!this._viewportBaseActive || this._viewportBaseSuspended) return false;
    return ['rect', 'circle', 'line', 'gradient'].includes(toolName);
  }

  _normalizeRect(rect) {
    if (!rect) return null;

    const left = Math.max(0, Math.floor(Number(rect.left) || 0));
    const top = Math.max(0, Math.floor(Number(rect.top) || 0));
    const width = Math.max(0, Math.ceil(Number(rect.width) || 0));
    const height = Math.max(0, Math.ceil(Number(rect.height) || 0));
    if (width <= 0 || height <= 0) return null;

    return { left, top, width, height };
  }

  _intersectRects(a, b) {
    const rectA = this._normalizeRect(a);
    const rectB = this._normalizeRect(b);
    if (!rectA || !rectB) return null;

    const left = Math.max(rectA.left, rectB.left);
    const top = Math.max(rectA.top, rectB.top);
    const right = Math.min(rectA.left + rectA.width, rectB.left + rectB.width);
    const bottom = Math.min(rectA.top + rectA.height, rectB.top + rectB.height);
    if (right <= left || bottom <= top) return null;

    return {
      left,
      top,
      width: right - left,
      height: bottom - top,
    };
  }

  _getStrokeCommitPadding(obj) {
    const strokeWidth = Math.abs(Number(obj?.strokeWidth) || 0) || (this.currentTool === 'eraser' ? this.brushSize * 2 : this.brushSize);
    return Math.max(2, Math.ceil(strokeWidth / 2) + 2);
  }

  _getObjectArtboardCommitRect(obj, padding = 0) {
    if (!obj) return null;

    const bounds = typeof obj.getBoundingRect === 'function'
      ? obj.getBoundingRect(true, true)
      : {
          left: Number(obj.left) || 0,
          top: Number(obj.top) || 0,
          width: Number(obj.width) || 0,
          height: Number(obj.height) || 0,
        };

    const left = Math.max(0, Math.floor((Number(bounds.left) || 0) - padding));
    const top = Math.max(0, Math.floor((Number(bounds.top) || 0) - padding));
    const right = Math.min(this.ART_W, Math.ceil((Number(bounds.left) || 0) + (Number(bounds.width) || 0) + padding));
    const bottom = Math.min(this.ART_H, Math.ceil((Number(bounds.top) || 0) + (Number(bounds.height) || 0) + padding));
    if (right <= left || bottom <= top) return null;

    return {
      left,
      top,
      width: right - left,
      height: bottom - top,
    };
  }

  _deferCommittedStrokeMerge(callback) {
    if (typeof window.queueMicrotask === 'function') {
      window.queueMicrotask(callback);
      return;
    }

    Promise.resolve().then(callback);
  }

  _finalizeLayerSurfaceCommit(target, options = {}) {
    if (!this._isValidPaintLayer(target)) return false;
    if (this.canvas.getObjects().indexOf(target) < 0) return false;

    target.dirty = true;

    if (typeof target.setCoords === 'function') {
      target.setCoords();
    }

    this._activeLayer = target;
    this.canvas.setActiveObject(target);
    this.canvas.renderAll();
    this._syncViewportBaseSuspensionReasons();
    if (options.recordHistory !== false) {
      this._saveState();
    }
    if (options.emitEvents !== false) {
      this._emitLayerCommitEvents(target);
    }
    return true;
  }

  _prepareLayerSurfaceCommitCanvas(target, surfaceCanvas, dirtyRect = null, options = {}) {
    if (!surfaceCanvas) return null;
    if (!dirtyRect) return surfaceCanvas;

    const targetWidth = Math.max(1, Math.round(Number(options.commitWidth) || (target.width * target.scaleX)));
    const targetHeight = Math.max(1, Math.round(Number(options.commitHeight) || (target.height * target.scaleY)));
    const commitRect = this._intersectRects(dirtyRect, {
      left: 0,
      top: 0,
      width: targetWidth,
      height: targetHeight,
    });
    if (!commitRect) return null;

    const targetEl = target.getElement ? target.getElement() : target._element;
    const canReuseCanvas = targetEl && typeof HTMLCanvasElement !== 'undefined' && targetEl instanceof HTMLCanvasElement &&
      targetEl.width === targetWidth && targetEl.height === targetHeight;
    const commitCanvas = canReuseCanvas ? targetEl : document.createElement('canvas');

    if (!canReuseCanvas) {
      commitCanvas.width = targetWidth;
      commitCanvas.height = targetHeight;
    }

    const ctx = commitCanvas.getContext('2d');
    if (!ctx) return null;

    if (!canReuseCanvas) {
      ctx.clearRect(0, 0, targetWidth, targetHeight);
      if (targetEl) {
        ctx.drawImage(targetEl, 0, 0, targetWidth, targetHeight);
      }
    }

    ctx.clearRect(commitRect.left, commitRect.top, commitRect.width, commitRect.height);
    ctx.drawImage(surfaceCanvas, commitRect.left, commitRect.top);

    return commitCanvas;
  }

  _commitLayerSurfaceInPlace(target, surfaceCanvas, dirtyRect = null, options = {}) {
    if (!this._isValidPaintLayer(target) || !surfaceCanvas) return false;
    if (this.canvas.getObjects().indexOf(target) < 0) return false;

    const commitCanvas = this._prepareLayerSurfaceCommitCanvas(target, surfaceCanvas, dirtyRect, options);
    if (!commitCanvas) return false;

    if (typeof target.setElement === 'function') {
      target.setElement(commitCanvas);
    } else {
      target._element = commitCanvas;
      target._originalElement = commitCanvas;
    }

    target.set({
      width: Math.max(1, Number(options.objectWidth) || commitCanvas.width || target.width || 1),
      height: Math.max(1, Number(options.objectHeight) || commitCanvas.height || target.height || 1),
      scaleX: Number.isFinite(Number(options.scaleX)) ? Number(options.scaleX) : 1,
      scaleY: Number.isFinite(Number(options.scaleY)) ? Number(options.scaleY) : 1,
    });

    return this._finalizeLayerSurfaceCommit(target, options);
  }

  _buildSharedSurfaceMergedStrokeCanvas(target, obj, isErase = false, commitSupport = null) {
    if (!this._isValidPaintLayer(target) || !obj) return null;

    const resolvedCommitSupport = commitSupport || this._resolveSharedRasterLayerCommitSupport(target);
    if (!resolvedCommitSupport?.supported || !resolvedCommitSupport.targetElement) return null;

    const offscreen = document.createElement('canvas');
    offscreen.width = resolvedCommitSupport.sourceWidth;
    offscreen.height = resolvedCommitSupport.sourceHeight;
    const ctx = offscreen.getContext('2d');
    if (!ctx) return null;

    ctx.drawImage(
      resolvedCommitSupport.targetElement,
      0,
      0,
      resolvedCommitSupport.sourceWidth,
      resolvedCommitSupport.sourceHeight
    );

    const objectCanvas = this._rasterizeFabricObjectRegion(obj, {
      left: 0,
      top: 0,
      width: this.ART_W,
      height: this.ART_H,
    });
    if (!objectCanvas) return null;

    ctx.save();
    ctx.globalCompositeOperation = isErase ? 'destination-out' : 'source-over';
    if (resolvedCommitSupport.inverseMatrix) {
      ctx.setTransform(
        resolvedCommitSupport.inverseMatrix[0],
        resolvedCommitSupport.inverseMatrix[1],
        resolvedCommitSupport.inverseMatrix[2],
        resolvedCommitSupport.inverseMatrix[3],
        resolvedCommitSupport.inverseMatrix[4],
        resolvedCommitSupport.inverseMatrix[5]
      );
      ctx.drawImage(objectCanvas, 0, 0);
    } else {
      ctx.drawImage(
        objectCanvas,
        -(Number(target.left) || 0),
        -(Number(target.top) || 0)
      );
    }
    ctx.restore();

    return offscreen;
  }

  _rasterizeFabricObjectRegion(obj, region) {
    const normalizedRegion = this._normalizeRect(region);
    if (!normalizedRegion || !obj) return null;

    const tmpCanvas = document.createElement('canvas');
    tmpCanvas.width = normalizedRegion.width;
    tmpCanvas.height = normalizedRegion.height;
    const tmpCtx = tmpCanvas.getContext('2d');
    if (!tmpCtx) return null;

    const bounds = typeof obj.getBoundingRect === 'function'
      ? obj.getBoundingRect(true, true)
      : {
          left: Number(obj.left) || 0,
          top: Number(obj.top) || 0,
          width: Number(obj.width) || 0,
          height: Number(obj.height) || 0,
        };
    const objectCanvas = typeof obj.toCanvasElement === 'function'
      ? obj.toCanvasElement({ enableRetinaScaling: false })
      : null;

    if (!objectCanvas) return null;

    tmpCtx.drawImage(
      objectCanvas,
      Math.round((Number(bounds.left) || 0) - normalizedRegion.left),
      Math.round((Number(bounds.top) || 0) - normalizedRegion.top)
    );
    return tmpCanvas;
  }

  _rasterizeFabricObject(obj, width, height) {
    const regionCanvas = this._rasterizeFabricObjectRegion(obj, {
      left: 0,
      top: 0,
      width,
      height,
    });
    if (!regionCanvas) return null;

    return regionCanvas.toDataURL('image/png');
  }

  _mergeObjectOntoLayerLegacy(target, obj, isErase = false, options = {}) {
    const commitSupport = this._resolveSharedRasterLayerCommitSupport(target);
    const offscreen = this._buildSharedSurfaceMergedStrokeCanvas(target, obj, isErase, commitSupport);
    if (!offscreen) return Promise.resolve(false);

    return this._replaceLayerWithImage(target, offscreen.toDataURL('image/png'), options).then((committedTarget) => {
      if (!committedTarget) return false;

      return {
        committedTarget,
        commitPath: 'legacy-fallback',
      };
    });
  }

  _tryCommitCroppedStrokeToSharedRasterLayer(target, obj, isErase, sharedRasterSupport, fallbackCommit = null, options = {}) {
    const croppedSupport = this._resolveSharedCroppedRasterLayerSupport(target, sharedRasterSupport);
    if (!croppedSupport.supported || obj?.type !== 'path') return false;

    const targetEl = croppedSupport.targetElement;

    const runFallback = typeof fallbackCommit === 'function'
      ? fallbackCommit
      : () => this._mergeObjectOntoLayerLegacy(target, obj, isErase, options);

    const targetArtboardLeft = croppedSupport.targetArtboardLeft;
    const targetArtboardTop = croppedSupport.targetArtboardTop;

    const commitRect = this._getObjectArtboardCommitRect(obj, this._getStrokeCommitPadding(obj));
    if (!commitRect) return false;

    const strokeCanvas = this._rasterizeFabricObjectRegion(obj, commitRect);

    if (!strokeCanvas) return false;

    return new Promise((resolve) => {
      this._deferCommittedStrokeMerge(async () => {
        if (this.canvas.getObjects().indexOf(target) < 0) {
          resolve(false);
          return;
        }

        const dirtyArtboardLeft = Math.max(commitRect.left, targetArtboardLeft);
        const dirtyArtboardTop = Math.max(commitRect.top, targetArtboardTop);
        const dirtyArtboardRight = Math.min(commitRect.left + commitRect.width, targetArtboardLeft + croppedSupport.targetDisplayWidth);
        const dirtyArtboardBottom = Math.min(commitRect.top + commitRect.height, targetArtboardTop + croppedSupport.targetDisplayHeight);

        if (dirtyArtboardRight <= dirtyArtboardLeft || dirtyArtboardBottom <= dirtyArtboardTop) {
          resolve(await runFallback());
          return;
        }

        const dirtyArtboardRect = {
          left: dirtyArtboardLeft,
          top: dirtyArtboardTop,
          width: dirtyArtboardRight - dirtyArtboardLeft,
          height: dirtyArtboardBottom - dirtyArtboardTop,
        };
        const mappedPatch = this._mapArtboardRectToTargetSourcePatchRect(dirtyArtboardRect, croppedSupport);
        if (!mappedPatch) {
          resolve(await runFallback());
          return;
        }

        const dirtyLocalRect = mappedPatch.sourceRect;
        const destinationRect = mappedPatch.destinationRect;
        const patchCanvas = document.createElement('canvas');
        patchCanvas.width = dirtyLocalRect.width;
        patchCanvas.height = dirtyLocalRect.height;
        const patchCtx = patchCanvas.getContext('2d');

        if (!patchCtx) {
          resolve(await runFallback());
          return;
        }

        patchCtx.drawImage(
          targetEl,
          dirtyLocalRect.left,
          dirtyLocalRect.top,
          dirtyLocalRect.width,
          dirtyLocalRect.height,
          0,
          0,
          dirtyLocalRect.width,
          dirtyLocalRect.height
        );
        patchCtx.save();
        patchCtx.globalCompositeOperation = isErase ? 'destination-out' : 'source-over';
        patchCtx.drawImage(
          strokeCanvas,
          dirtyArtboardRect.left - commitRect.left,
          dirtyArtboardRect.top - commitRect.top,
          dirtyArtboardRect.width,
          dirtyArtboardRect.height,
          destinationRect.left,
          destinationRect.top,
          destinationRect.width,
          destinationRect.height
        );
        patchCtx.restore();

        if (!this._commitLayerSurfaceInPlace(target, patchCanvas, dirtyLocalRect, {
          commitWidth: croppedSupport.sourceWidth,
          commitHeight: croppedSupport.sourceHeight,
          objectWidth: target.width,
          objectHeight: target.height,
          scaleX: target.scaleX,
          scaleY: target.scaleY,
          recordHistory: options.recordHistory,
          emitEvents: options.emitEvents,
        })) {
          resolve(await runFallback());
          return;
        }

        resolve({
          committedTarget: target,
          commitPath: 'shared-surface',
          dirtyRect: dirtyArtboardRect,
          targetSourceRect: dirtyLocalRect,
        });
      });
    });
  }

  _tryCommitFullSourceStrokeToSharedRasterLayer(target, obj, isErase, sharedRasterSupport, fallbackCommit = null, options = {}) {
    const commitSupport = this._resolveSharedRasterLayerCommitSupport(target, sharedRasterSupport);
    if (!commitSupport?.supported || obj?.type !== 'path') return false;

    const runFallback = typeof fallbackCommit === 'function'
      ? fallbackCommit
      : () => this._mergeObjectOntoLayerLegacy(target, obj, isErase, options);
    const mergedSurface = this._buildSharedSurfaceMergedStrokeCanvas(target, obj, isErase, commitSupport);
    if (!mergedSurface) return false;

    const commitRect = this._getObjectArtboardCommitRect(obj, this._getStrokeCommitPadding(obj));
    const targetRect = this._getObjectArtboardCommitRect(target, 0);
    const dirtyRect = this._intersectRects(commitRect, targetRect) || commitRect || targetRect || null;

    if (!this._commitLayerSurfaceInPlace(target, mergedSurface, null, {
      commitWidth: commitSupport.sourceWidth,
      commitHeight: commitSupport.sourceHeight,
      objectWidth: target.width,
      objectHeight: target.height,
      scaleX: target.scaleX,
      scaleY: target.scaleY,
      recordHistory: options.recordHistory,
      emitEvents: options.emitEvents,
    })) {
      return runFallback();
    }

    return Promise.resolve({
      committedTarget: target,
      commitPath: 'shared-surface-commit-only',
      commitSurfaceScope: 'full-source',
      dirtyRect,
    });
  }

  _mergeObjectOntoLayer(target, obj, isErase = false, options = {}) {
    if (!this._isValidPaintLayer(target)) return Promise.resolve(false);

    const sharedRasterSupport = this._resolveSharedRasterLayerSupport(target);
    const fallbackMerge = () => this._mergeObjectOntoLayerLegacy(target, obj, isErase, options);
    const croppedCommit = this._tryCommitCroppedStrokeToSharedRasterLayer(
      target,
      obj,
      isErase,
      sharedRasterSupport,
      fallbackMerge,
      options,
    );
    if (croppedCommit) {
      return croppedCommit;
    }

    const fullSourceCommit = this._tryCommitFullSourceStrokeToSharedRasterLayer(
      target,
      obj,
      isErase,
      sharedRasterSupport,
      fallbackMerge,
      options,
    );
    if (fullSourceCommit) {
      return fullSourceCommit;
    }

    return fallbackMerge();
  }

  /* ── Undo / Redo ──────────────────────────────────────────── */
  _serializeCanvasForDocument() {
    return this.canvas.toJSON(this._historyStateProperties);
  }

  _serializeCanvasState() {
    return JSON.stringify(this._serializeCanvasForDocument());
  }

  _captureCanvasImageData(outputWidth = this.ART_W, outputHeight = this.ART_H) {
    const scale = outputWidth / this.ART_W;
    const tmpEl = document.createElement('canvas');
    tmpEl.width = outputWidth;
    tmpEl.height = outputHeight;
    const tmpCtx = tmpEl.getContext('2d');
    const dataUrl = this.canvas.toDataURL({ format: 'png', multiplier: scale });

    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        tmpCtx.drawImage(img, 0, 0, outputWidth, outputHeight);
        resolve(tmpCtx.getImageData(0, 0, outputWidth, outputHeight));
      };
      img.src = dataUrl;
    });
  }

  _composeSharedRasterImageData(outputWidth, outputHeight, mode = 'export', targetCanvas = null) {
    if (!window.LiveryLabRender || !window.LiveryLabDocument?.createDocumentSnapshot) {
      return { supported: false, reason: 'missing-render-contract' };
    }

    const documentPayload = window.LiveryLabDocument.createDocumentSnapshot(this);
    const surfaceRegistry = window.LiveryLabRender.createFabricSurfaceRegistry({
      fabricCanvas: this.canvas,
      document: documentPayload,
    });

    return window.LiveryLabRender.renderDocumentComposition({
      document: documentPayload,
      surfaceRegistry,
      mode,
      targetWidth: outputWidth,
      targetHeight: outputHeight,
      targetCanvas,
    });
  }

  _resolveViewportBaseTargetDimensions(options = {}) {
    const defaultWidth = Math.max(1, Math.round(this.ART_W * this.currentZoom));
    const defaultHeight = Math.max(1, Math.round(this.ART_H * this.currentZoom));
    const outputWidth = Math.max(1, Math.round(Number(options.outputWidth) || defaultWidth));
    const outputHeight = Math.max(1, Math.round(Number(options.outputHeight) || defaultHeight));

    return {
      outputWidth,
      outputHeight,
    };
  }

  async _getLegacyExportImageData(outputSize = 2048) {
    const savedOpacity = this._templateObject ? this._templateObject.opacity : null;
    const hiddenForExport = [];

    try {
      if (this._templateObject) this._templateObject.set('opacity', 0);
      this.canvas.getObjects().forEach(obj => {
        if (obj._isGuide || obj._isSpecMap) {
          hiddenForExport.push({ obj, opacity: obj.opacity, visible: obj.visible });
          obj.set({ opacity: 0, visible: false });
        }
      });
      this.canvas.renderAll();
      return await this._captureCanvasImageData(outputSize, outputSize);
    } finally {
      if (this._templateObject && savedOpacity !== null) this._templateObject.set('opacity', savedOpacity);
      hiddenForExport.forEach(({ obj, opacity, visible }) => obj.set({ opacity, visible }));
      this.canvas.renderAll();
    }
  }

  _pushHistorySnapshot(json, options = {}) {
    if (options.syncDocumentMirror !== false) {
      this._resyncLiveDocumentMirrorFromSnapshotJson(json);
    }

    if (this._undoStack[this._undoStack.length - 1] === json) return false;

    this._undoStack.push(json);
    if (this._undoStack.length > 50) this._undoStack.shift();

    if (options.clearRedo !== false) {
      this._redoStack = [];
    }

    return true;
  }

  _isExclusiveAsyncPaintMutationActive() {
    return !!this._exclusiveAsyncPaintMutation || !!this._asyncHistoryReplayMutation;
  }

  _beginExclusiveAsyncPaintMutation(meta = {}) {
    if (this._exclusiveAsyncPaintMutation || this._asyncHistoryReplayMutation) return null;

    const barrier = {
      id: this._nextExclusiveAsyncPaintMutationId++,
      name: typeof meta.name === 'string' ? meta.name : null,
      label: typeof meta.label === 'string' ? meta.label : null,
      coalesceKey: typeof meta.coalesceKey === 'string' ? meta.coalesceKey : null,
      targetId: meta.targetId || null,
      startedAt: Date.now(),
    };

    this._exclusiveAsyncPaintMutation = barrier;
    this._notifyWorkspaceProjectionChanged();
    return barrier;
  }

  _endExclusiveAsyncPaintMutation(token = null) {
    if (!this._exclusiveAsyncPaintMutation) return false;
    if (token && this._exclusiveAsyncPaintMutation.id !== token.id) return false;

    this._exclusiveAsyncPaintMutation = null;
    this._notifyWorkspaceProjectionChanged();
    return true;
  }

  _beginAsyncHistoryReplayMutation(meta = {}) {
    if (this._exclusiveAsyncPaintMutation || this._asyncHistoryReplayMutation) return null;

    const barrier = {
      id: this._nextAsyncHistoryReplayMutationId++,
      name: typeof meta.name === 'string' ? meta.name : null,
      label: typeof meta.label === 'string' ? meta.label : null,
      targetId: meta.targetId || null,
      startedAt: Date.now(),
    };

    this._asyncHistoryReplayMutation = barrier;
    this._notifyWorkspaceProjectionChanged();
    return barrier;
  }

  _endAsyncHistoryReplayMutation(token = null) {
    if (!this._asyncHistoryReplayMutation) return false;
    if (token && this._asyncHistoryReplayMutation.id !== token.id) return false;

    this._asyncHistoryReplayMutation = null;
    this._notifyWorkspaceProjectionChanged();
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

    if (this._isExclusiveAsyncPaintMutationActive()) {
      return null;
    }

    if (!this._historySession || !this._historySession.hasActiveTransaction()) {
      this._endViewportBaseKeyboardManipulation();
      return null;
    }

    if (this._isViewportBaseLiveOverlayActive('keyboard-nudge')) {
      this._restoreViewportBaseLiveOverlay({ render: false });
    }

    const entry = this._historySession.commitActiveTransaction({
      afterSnapshot: this._serializeCanvasState(),
      afterSelectedObjectId: this.canvas.getActiveObject()?._id || null,
      afterActiveLayerId: this.getActiveLayerId(),
      commitReason: reason,
    });

    if (!entry) return null;

    this._pushHistorySnapshot(entry.afterSnapshot, { clearRedo: true });
    this._endViewportBaseKeyboardManipulation();
    this._scheduleViewportBaseSync();
    return entry;
  }

  _runDocumentTransaction(options = {}) {
    const apply = typeof options.apply === 'function' ? options.apply : null;
    if (!apply) {
      throw new Error('Document transactions require an apply callback.');
    }

    if (this._isExclusiveAsyncPaintMutationActive()) {
      return { entry: null, result: false };
    }

    if (!this._historySession) {
      const result = apply();
      if (result !== false) {
        this._saveState();
      }
      return { entry: null, result };
    }

    this._flushPendingHistoryTransaction('boundary');

    this._historySession.openTransaction({
      name: options.name,
      label: options.label,
      coalesceKey: options.coalesceKey,
      reversibility: options.reversibility,
      checkpointBoundary: options.checkpointBoundary,
      beforeSnapshot: this._serializeCanvasState(),
      beforeSelectedObjectId: this.canvas.getActiveObject()?._id || null,
      beforeActiveLayerId: this.getActiveLayerId(),
      renderInvalidation: options.renderInvalidation,
    });

    // Suspend legacy _afterChange history capture while the transaction's
    // apply callback runs.  Fabric fires object:removed / selection:cleared
    // synchronously during canvas.remove / discardActiveObject and those
    // events would otherwise re-enter _afterChange → _saveState →
    // _flushPendingHistoryTransaction, committing and clearing the active
    // transaction before recordOperation can run.
    const previousSuspendHistory = this._suspendHistory;
    this._suspendHistory = true;

    let result;
    try {
      result = apply();
    } catch (error) {
      this._suspendHistory = previousSuspendHistory;
      this._discardPendingHistoryTransaction('error');
      throw error;
    }

    this._suspendHistory = previousSuspendHistory;

    if (result === false) {
      this._discardPendingHistoryTransaction('no-op');
      return { entry: null, result };
    }

    if (options.operation) {
      const operation = typeof options.operation === 'function'
        ? options.operation(result)
        : options.operation;

      if (operation) {
        this._historySession.recordOperation(operation);
      }
    }

    const entry = this._historySession.commitActiveTransaction({
      afterSnapshot: this._serializeCanvasState(),
      afterSelectedObjectId: this.canvas.getActiveObject()?._id || null,
      afterActiveLayerId: this.getActiveLayerId(),
      commitReason: options.commitReason || 'explicit',
    });

    if (entry) {
      this._pushHistorySnapshot(entry.afterSnapshot, { clearRedo: true });
      this._scheduleViewportBaseSync();
    }

    return { entry, result };
  }

  async _runTargetedDocumentTransaction(options = {}) {
    const resolveTarget = typeof options.resolveTarget === 'function'
      ? options.resolveTarget
      : () => ({});
    const apply = typeof options.apply === 'function' ? options.apply : null;
    const afterCommit = typeof options.afterCommit === 'function' ? options.afterCommit : null;
    const usesExclusiveAsyncPaintMutation = options.exclusiveMutationBarrier === 'async-paint';
    if (!apply) {
      throw new Error('Targeted document transactions require an apply callback.');
    }

    if (this._isExclusiveAsyncPaintMutationActive()) {
      return { entry: null, result: false, context: null };
    }

    const beforeSnapshot = this._serializeCanvasState();
    const beforeSelectedObjectId = this.canvas.getActiveObject()?._id || null;
    const beforeActiveLayerId = this.getActiveLayerId();

    this._flushPendingHistoryTransaction('boundary');

    const context = await resolveTarget({
      beforeSnapshot,
      beforeSelectedObjectId,
      beforeActiveLayerId,
    });

    if (context === false) {
      return { entry: null, result: false, context: null };
    }

    const abort = async (reason) => {
      if (typeof context?.abort === 'function') {
        await context.abort(reason);
      }
    };

    const label = typeof options.label === 'function' ? options.label(context) : options.label;
    const coalesceKey = typeof options.coalesceKey === 'function' ? options.coalesceKey(context) : options.coalesceKey;
    const renderInvalidation = typeof options.renderInvalidation === 'function'
      ? options.renderInvalidation(context)
      : options.renderInvalidation;
    const barrierToken = usesExclusiveAsyncPaintMutation
      ? this._beginExclusiveAsyncPaintMutation({
          name: options.name,
          label,
          coalesceKey,
          targetId: context?.targetLayerId || context?.targetId || null,
        })
      : null;

    if (usesExclusiveAsyncPaintMutation && !barrierToken) {
      await abort('barrier-active');
      return { entry: null, result: false, context };
    }

    if (!this._historySession) {
      let result;
      try {
        result = await apply(context);
      } catch (error) {
        await abort('error');
        this._endExclusiveAsyncPaintMutation(barrierToken);
        throw error;
      }

      if (result === false) {
        await abort('no-op');
        this._endExclusiveAsyncPaintMutation(barrierToken);
        return { entry: null, result, context };
      }

      this._saveState();
      this._endExclusiveAsyncPaintMutation(barrierToken);
      if (afterCommit) afterCommit(result, context, null);
      return { entry: null, result, context };
    }

    this._historySession.openTransaction({
      name: options.name,
      label,
      coalesceKey,
      reversibility: options.reversibility,
      checkpointBoundary: options.checkpointBoundary,
      beforeSnapshot,
      beforeSelectedObjectId,
      beforeActiveLayerId,
      renderInvalidation,
    });

    let result;
    try {
      result = await apply(context);
    } catch (error) {
      await abort('error');
      this._discardPendingHistoryTransaction('error');
      this._endExclusiveAsyncPaintMutation(barrierToken);
      throw error;
    }

    if (result === false) {
      await abort('no-op');
      this._discardPendingHistoryTransaction('no-op');
      this._endExclusiveAsyncPaintMutation(barrierToken);
      return { entry: null, result, context };
    }

    let entry = null;
    try {
      if (options.operation) {
        const operation = typeof options.operation === 'function'
          ? options.operation(result, context)
          : options.operation;

        if (operation) {
          this._historySession.recordOperation(operation);
        }
      }

      entry = this._historySession.commitActiveTransaction({
        afterSnapshot: this._serializeCanvasState(),
        afterSelectedObjectId: this.canvas.getActiveObject()?._id || null,
        afterActiveLayerId: this.getActiveLayerId(),
        commitReason: options.commitReason || 'explicit',
      });

      if (entry) {
        this._pushHistorySnapshot(entry.afterSnapshot, { clearRedo: true });
        this._scheduleViewportBaseSync();
      }
    } catch (error) {
      await abort('error');
      this._discardPendingHistoryTransaction('error');
      this._endExclusiveAsyncPaintMutation(barrierToken);
      throw error;
    }

    this._endExclusiveAsyncPaintMutation(barrierToken);
    if (afterCommit) afterCommit(result, context, entry);
    return { entry, result, context };
  }

  _buildLayerContentInvalidation(layerId, dirtyRect = null, extra = {}) {
    return {
      scope: 'viewport-and-export',
      kind: 'layer.content.changed',
      layerIds: [layerId].filter(Boolean),
      dirtyRect: dirtyRect ? this._normalizeRect(dirtyRect) : null,
      ...extra,
    };
  }

  _emitLayerCommitEvents(target = this.canvas.getActiveObject() || null) {
    if (this.onLayersChanged) this.onLayersChanged();
    if (this.onSelectionChanged) this.onSelectionChanged(target || null);
  }

  _notifyWorkspaceProjectionChanged() {
    if (this.onSelectionChanged) {
      this.onSelectionChanged(this.canvas.getActiveObject() || null);
      return;
    }

    if (this.onLayersChanged) {
      this.onLayersChanged();
    }
  }

  _removeCanvasObjectWithoutHistory(target) {
    if (!target || this.canvas.getObjects().indexOf(target) < 0) return false;

    const previousSuspendHistory = this._suspendHistory;
    this._suspendHistory = true;
    try {
      this.canvas.remove(target);
    } finally {
      this._suspendHistory = previousSuspendHistory;
    }

    if (this.canvas.getActiveObject() === target) {
      this.canvas.discardActiveObject();
    }

    if (this._activeLayer === target) {
      this._activeLayer = this._getDefaultPaintLayer();
    }

    if (this.currentTool === 'select') {
      this._syncObjectInteractivity(this.canvas.getActiveObject() || null);
    }

    this.canvas.renderAll();
    return true;
  }

  _restoreAutoCreatedFillAbortState(previousToolTargetId = null, previousActiveLayerId = null) {
    const previousToolTarget = this._getObjectById(previousToolTargetId);
    this._toolTargetObject = this._isSelectableUserObject(previousToolTarget)
      ? previousToolTarget
      : null;

    if (previousActiveLayerId == null) {
      this._activeLayer = null;
    } else {
      const previousActiveLayer = this._getObjectById(previousActiveLayerId);
      this._activeLayer = this._isValidPaintLayer(previousActiveLayer)
        ? previousActiveLayer
        : this._getDefaultPaintLayer();
    }

    if (this.canvas.getActiveObject()) {
      this.canvas.discardActiveObject();
    }

    this.canvas.renderAll();
    this._syncViewportBaseSuspensionReasons();
    if (this.onSelectionChanged) this.onSelectionChanged(this.canvas.getActiveObject() || null);
  }

  _insertStandaloneLayerWithTransaction(obj, options = {}) {
    if (!obj) {
      return { entry: null, result: false };
    }

    const historyApi = window.LiveryLabHistory;
    const operationName = historyApi?.OPERATION_TYPES?.LAYER_ADD || 'document.layer.add';
    const checkpointBoundary = historyApi?.CHECKPOINT_BOUNDARIES?.PER_OPERATION || 'per-operation';
    const reversibility = historyApi?.REVERSIBILITY?.REVERSIBLE || 'reversible';
    const source = typeof options.source === 'string' && options.source
      ? options.source
      : 'standalone-insert';
    const onInserted = typeof options.onInserted === 'function' ? options.onInserted : null;
    const layerId = this._ensureObjectId(obj);
    const insertIndex = this._getPreferredInsertIndex(options.preferredAnchor || null);

    return this._runDocumentTransaction({
      name: operationName,
      label: options.label || 'Insert layer',
      coalesceKey: `layer-add:${source}:${layerId}`,
      reversibility,
      checkpointBoundary,
      renderInvalidation: {
        scope: 'viewport-and-export',
        kind: 'stack.changed',
        startIndex: insertIndex,
        layerIds: [layerId],
      },
      operation: (result) => {
        if (!result) return null;

        return {
          name: operationName,
          layerId: result.layerId,
          insertIndex: result.insertIndex,
          source: result.source,
        };
      },
      apply: () => {
        const previousSuspendHistory = this._suspendHistory;
        this._suspendHistory = true;
        try {
          this.canvas.insertAt(obj, insertIndex);
        } finally {
          this._suspendHistory = previousSuspendHistory;
        }

        if (onInserted) {
          onInserted(obj);
        }

        const insertedIndex = this.canvas.getObjects().indexOf(obj);
        if (insertedIndex < 0) {
          return false;
        }

        if (this.onLayersChanged) this.onLayersChanged();
        if (this.onSelectionChanged) this.onSelectionChanged(this.canvas.getActiveObject() || null);

        return {
          layerId,
          insertIndex: insertedIndex,
          source,
        };
      },
    });
  }

  async _runDocumentBoundaryCheckpoint(options = {}) {
    const apply = typeof options.apply === 'function' ? options.apply : null;
    if (!apply) {
      throw new Error('Document-boundary checkpoints require an apply callback.');
    }

    if (this._isExclusiveAsyncPaintMutationActive()) {
      return { entry: null, result: false };
    }

    const historyApi = window.LiveryLabHistory;
    const beforeSnapshot = this._serializeCanvasState();
    const beforeSelectedObjectId = this.canvas.getActiveObject()?._id || null;
    const beforeActiveLayerId = this.getActiveLayerId();

    this._flushPendingHistoryTransaction('document-boundary');
    this._resetHistoryState();

    let result;
    try {
      result = await apply();
    } catch (error) {
      this._pushHistorySnapshot(this._serializeCanvasState(), { clearRedo: true });
      throw error;
    }

    if (result === false) {
      this._pushHistorySnapshot(beforeSnapshot, { clearRedo: true });
      return { entry: null, result };
    }

    const afterSnapshot = this._serializeCanvasState();
    const afterSelectedObjectId = this.canvas.getActiveObject()?._id || null;
    const afterActiveLayerId = this.getActiveLayerId();
    const checkpointMetadata = typeof options.checkpointMetadata === 'function'
      ? options.checkpointMetadata(result)
      : options.checkpointMetadata;

    this._pushHistorySnapshot(afterSnapshot, { clearRedo: true });
    this._scheduleViewportBaseSync();

    const entry = this._historySession?.recordCheckpoint
      ? this._historySession.recordCheckpoint({
          name: options.name,
          label: options.label,
          coalesceKey: options.coalesceKey,
          reversibility: options.reversibility || historyApi?.REVERSIBILITY?.CHECKPOINT_ONLY || 'checkpoint-only',
          checkpointBoundary: options.checkpointBoundary,
          beforeSnapshot,
          beforeSelectedObjectId,
          beforeActiveLayerId,
          renderInvalidation: options.renderInvalidation,
          checkpointMetadata,
        }, {
          afterSnapshot,
          afterSelectedObjectId,
          afterActiveLayerId,
          commitReason: options.commitReason || 'document-boundary',
        })
      : null;

    return { entry, result };
  }

  _discardPendingHistoryTransaction(reason = 'reset') {
    this._clearPendingPointerTransformCapture();
    this._clearPendingHistoryFlush();
    this._endViewportBaseKeyboardManipulation();
    if (!this._historySession || !this._historySession.hasActiveTransaction()) return null;
    return this._historySession.cancelActiveTransaction(reason);
  }

  _resetHistoryState() {
    this._clearPendingPointerTransformCapture();
    this._discardPendingHistoryTransaction('reset');
    this._undoStack = [];
    this._redoStack = [];
    if (this._historySession) this._historySession.reset();
  }

  _saveState() {
    this._restoreViewportBaseLiveOverlay({ render: false });
    this._flushPendingHistoryTransaction('boundary');
    const json = this._serializeCanvasState();
    this._pushHistorySnapshot(json, { clearRedo: true });
    this._scheduleViewportBaseSync();
  }

  _restoreToolStateAfterHistoryLoad(selectedObjectId = null, activeLayerId = null) {
    const restoredSelectedObject = this._getObjectById(selectedObjectId);
    const restoredActiveLayer = this._getObjectById(activeLayerId);
    const activeObject = this._isSelectableUserObject(restoredSelectedObject)
      ? restoredSelectedObject
      : null;

    // Keep the replayed committed selection anchor authoritative for both
    // visible selection and retained non-select-mode target state.
    this._toolTargetObject = activeObject;
    if (!activeObject && this.canvas.getActiveObject()) {
      this.canvas.discardActiveObject();
    }

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
      this._syncViewportBaseSuspensionReasons();
      return;
    }

    if (this.currentTool === 'brush') {
      if (this._activeLayer) this.canvas.setActiveObject(this._activeLayer);
      this._configureBrush();
      this._syncViewportBaseSuspensionReasons();
      return;
    }

    if (this.currentTool === 'eraser') {
      if (this._activeLayer) this.canvas.setActiveObject(this._activeLayer);
      this._configureEraser();
      this._syncViewportBaseSuspensionReasons();
      return;
    }

    if (['fill', 'rect', 'circle', 'line', 'gradient', 'text'].includes(this.currentTool)) {
      this._lockObjectsForPainting();
      this._syncViewportBaseSuspensionReasons();
    }
  }

  _loadState(json, onLoaded = null, onError = null, restoreState = null) {
    this._clearPendingPointerTransformCapture();
    this._viewportBaseSuspendedForFreeDraw = false;
    this._viewportBaseSuspendedForKeyboardNudge = false;
    this._viewportBaseSuspendedForTextEditing = false;
    this._setViewportBaseSuspended(false);
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
    const selectedObjectId = Object.prototype.hasOwnProperty.call(restoreState || {}, 'selectedObjectId')
      ? restoreState.selectedObjectId
      : (this.canvas.getActiveObject()?._id || null);
    const activeLayerId = Object.prototype.hasOwnProperty.call(restoreState || {}, 'activeLayerId')
      ? restoreState.activeLayerId
      : (this._activeLayer?._id || null);

    this.canvas.loadFromJSON(data, () => {
      try {
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
        this._resyncLiveDocumentMirrorFromSnapshotJson(json);
        if (restoreState?.transactionMetadata) {
          this._applyTransactionMetadataToDocumentMirror(restoreState.transactionMetadata);
        }
        this.canvas.renderAll();
        this._suspendHistory = false;
        this._scheduleViewportBaseSync();
        if (this.onLayersChanged) this.onLayersChanged();
        if (this.onSelectionChanged) this.onSelectionChanged(this.canvas.getActiveObject() || null);
        if (onLoaded) onLoaded();
      } catch (error) {
        this._suspendHistory = false;
        if (typeof onError === 'function') {
          onError(error);
          return;
        }
        throw error;
      }
    });
  }

  _getCommittedHistoryEntries() {
    return this._historySession?.getDebugState?.().committedTransactions || [];
  }

  _getCommittedHistoryEntryForUndo(currentSnapshot, targetSnapshot) {
    const entries = this._getCommittedHistoryEntries();
    for (let i = entries.length - 1; i >= 0; i -= 1) {
      const candidate = entries[i];
      if (candidate?.afterSnapshot === currentSnapshot && candidate?.beforeSnapshot === targetSnapshot) {
        return candidate;
      }
    }

    return null;
  }

  _getCommittedHistoryEntryForRedo(currentSnapshot, targetSnapshot) {
    const entries = this._getCommittedHistoryEntries();
    for (let i = entries.length - 1; i >= 0; i -= 1) {
      const candidate = entries[i];
      if (candidate?.beforeSnapshot === currentSnapshot && candidate?.afterSnapshot === targetSnapshot) {
        return candidate;
      }
    }

    return null;
  }

  _parseHistorySnapshot(json) {
    if (typeof json !== 'string' || !json) return null;

    try {
      const parsed = JSON.parse(json);
      return parsed && typeof parsed === 'object' ? parsed : null;
    } catch (error) {
      return null;
    }
  }

  _getHistorySnapshotObjectIdentity(snapshotObject) {
    if (!snapshotObject || typeof snapshotObject !== 'object') return null;
    if (snapshotObject.name === '__background__' || snapshotObject.name === '__template__') {
      return snapshotObject.name;
    }

    return typeof snapshotObject._id === 'string' && snapshotObject._id
      ? snapshotObject._id
      : null;
  }

  _getRuntimeHistoryObjectIdentity(obj) {
    if (!obj) return null;
    if (obj.name === '__background__' || obj.name === '__template__') {
      return obj.name;
    }

    return this._ensureObjectId(obj);
  }

  _getHistorySnapshotObjectMap(snapshotData) {
    const map = new Map();
    const objects = Array.isArray(snapshotData?.objects) ? snapshotData.objects : [];

    objects.forEach((snapshotObject, index) => {
      const identity = this._getHistorySnapshotObjectIdentity(snapshotObject);
      if (!identity || map.has(identity)) return;
      map.set(identity, { snapshotObject, index });
    });

    return map;
  }

  _getHistoryReplayRestoreState(entry, direction) {
    if (!entry) return null;

    if (direction === 'undo') {
      return {
        selectedObjectId: entry.beforeSelectedObjectId || null,
        activeLayerId: entry.beforeActiveLayerId || null,
      };
    }

    return {
      selectedObjectId: entry.afterSelectedObjectId || null,
      activeLayerId: entry.afterActiveLayerId || null,
    };
  }

  _getTargetedHistoryReplaySingleTargetId(entry, fieldNames = []) {
    const operations = Array.isArray(entry?.operations) ? entry.operations : [];
    const targetIds = new Set();

    operations.forEach((operation) => {
      fieldNames.forEach((fieldName) => {
        const value = typeof operation?.[fieldName] === 'string' && operation[fieldName]
          ? operation[fieldName]
          : null;
        if (value) targetIds.add(value);
      });
    });

    if (targetIds.size !== 1) return null;
    return Array.from(targetIds)[0];
  }

  _getTargetedHistoryReplayPaintOperation(entry) {
    const operations = Array.isArray(entry?.operations) ? entry.operations : [];
    if (operations.length !== 1) return null;

    const operation = operations[0] || null;

    if (entry?.name === 'document.stroke.commit') {
      const commitPath = typeof operation?.commitPath === 'string' && operation.commitPath
        ? operation.commitPath
        : null;
      if (commitPath !== 'shared-surface' && commitPath !== 'shared-surface-commit-only') {
        return null;
      }

      const layerId = typeof operation?.targetLayerId === 'string' && operation.targetLayerId
        ? operation.targetLayerId
        : null;
      const tool = typeof operation?.tool === 'string' && operation.tool
        ? operation.tool
        : null;
      const compositeMode = typeof operation?.compositeMode === 'string' && operation.compositeMode
        ? operation.compositeMode
        : null;

      if (
        operation?.targetKind !== 'paint-layer'
        || !layerId
        || operation?.createdTargetLayer === true
        || (tool !== 'brush' && tool !== 'eraser')
      ) {
        return null;
      }

      if ((tool === 'brush' && compositeMode !== 'source-over') || (tool === 'eraser' && compositeMode !== 'destination-out')) {
        return null;
      }

      return {
        family: 'stroke',
        replayBoundary: commitPath,
        layerId,
        createdTargetLayer: false,
        insertIndex: null,
      };
    }

    if (entry?.name === 'document.fill.apply') {
      const commitPath = typeof operation?.commitPath === 'string' && operation.commitPath
        ? operation.commitPath
        : null;
      const layerId = typeof operation?.targetLayerId === 'string' && operation.targetLayerId
        ? operation.targetLayerId
        : null;
      const targetId = typeof operation?.targetId === 'string' && operation.targetId
        ? operation.targetId
        : null;
      const targetKind = typeof operation?.targetKind === 'string' && operation.targetKind
        ? operation.targetKind
        : null;
      if (targetKind !== 'paint-layer' && targetKind !== 'retained-object') {
        return null;
      }

      const createdTargetLayer = operation?.createdTargetLayer === true;
      const createdTargetLayerId = typeof operation?.createdTargetLayerId === 'string' && operation.createdTargetLayerId
        ? operation.createdTargetLayerId
        : null;
      const createdTargetLayerInsertIndex = Number.isInteger(operation?.createdTargetLayerInsertIndex)
        ? operation.createdTargetLayerInsertIndex
        : null;
      const targetOwnership = typeof operation?.targetOwnership === 'string' && operation.targetOwnership
        ? operation.targetOwnership
        : null;

      if (createdTargetLayer) {
        if (
          createdTargetLayerId !== layerId
          || createdTargetLayerInsertIndex == null
          || createdTargetLayerInsertIndex < 0
        ) {
          return null;
        }
      }

      if (targetKind === 'retained-object') {
        if (createdTargetLayer) {
          return null;
        }

        if (targetOwnership === 'layer-id') {
          if (!layerId || (commitPath !== 'shared-surface' && commitPath !== 'shared-surface-commit-only')) {
            return null;
          }

          return {
            family: 'fill',
            replayKind: 'retained-raster',
            replayBoundary: commitPath,
            layerId,
            targetId,
            targetKind,
            createdTargetLayer: false,
            insertIndex: null,
          };
        }

        if (targetOwnership || layerId || !targetId) {
          return null;
        }

        return {
          family: 'fill',
          replayKind: 'retained-non-raster',
          layerId: null,
          targetId,
          targetKind,
          createdTargetLayer: false,
          insertIndex: null,
        };
      }

      if (!layerId || (commitPath !== 'shared-surface' && commitPath !== 'shared-surface-commit-only')) {
        return null;
      }

      if (commitPath === 'shared-surface-commit-only' && createdTargetLayer) {
        return null;
      }

      return {
        family: 'fill',
        replayKind: 'paint-layer',
        replayBoundary: commitPath,
        layerId,
        targetId: null,
        targetKind,
        createdTargetLayer,
        insertIndex: createdTargetLayer ? createdTargetLayerInsertIndex : null,
      };
    }

    return null;
  }

  _getTargetedHistoryPaintReplaySupportResolver(paintOperation) {
    if (!paintOperation) return null;

    if (paintOperation.family === 'fill') {
      if (paintOperation.replayBoundary === 'shared-surface-commit-only') {
        return (target) => this._resolveCommittedSharedRasterFillBoundary(target);
      }

      return (target) => this._resolveSupportedSharedRasterFillBoundary(target);
    }

    if (paintOperation.family === 'stroke') {
      if (paintOperation.replayBoundary === 'shared-surface-commit-only') {
        return (target) => this._resolveSharedRasterLayerCommitSupport(target);
      }

      return (target) => this._resolveSharedCroppedRasterLayerSupport(target);
    }

    return null;
  }

  _getSupportedTargetedHistoryLayerAddSources() {
    return new Set([
      'upload-image',
      'duplicate-selected',
      'text-insert',
      'rect-preview-finalize',
      'circle-preview-finalize',
      'line-preview-finalize',
      'gradient-preview-finalize',
    ]);
  }

  _getTargetedHistoryReplayStructuralLayerOperation(entry) {
    const operations = Array.isArray(entry?.operations) ? entry.operations : [];
    if (operations.length !== 1) return null;

    const operation = operations[0] || null;
    const layerId = typeof operation?.layerId === 'string' && operation.layerId
      ? operation.layerId
      : null;
    if (!layerId) return null;

    if (entry?.name === 'document.layer.add') {
      const insertIndex = Number.isInteger(operation?.insertIndex)
        ? operation.insertIndex
        : null;
      const source = typeof operation?.source === 'string' && operation.source
        ? operation.source
        : null;
      if (insertIndex == null || insertIndex < 0 || !this._getSupportedTargetedHistoryLayerAddSources().has(source)) {
        return null;
      }

      return {
        type: 'layer-add',
        layerId,
        source,
        index: insertIndex,
      };
    }

    if (entry?.name === 'document.layer.remove') {
      const beforeIndex = Number.isInteger(operation?.beforeIndex)
        ? operation.beforeIndex
        : null;
      if (beforeIndex == null || beforeIndex < 0) {
        return null;
      }

      return {
        type: 'layer-remove',
        layerId,
        index: beforeIndex,
      };
    }

    const paintOperation = this._getTargetedHistoryReplayPaintOperation(entry);
    if (paintOperation?.family === 'fill' && paintOperation.createdTargetLayer) {
      return {
        type: 'layer-add',
        layerId: paintOperation.layerId,
        source: 'fill-auto-create',
        index: paintOperation.insertIndex,
      };
    }

    return null;
  }

  _isTargetedHistoryReplaySingleLayerStructureCompatible(currentInfo, targetInfo, layerId, index) {
    if (!currentInfo || !targetInfo || !layerId || !Number.isInteger(index) || index < 0) {
      return false;
    }

    const currentHasLayer = currentInfo.map.has(layerId);
    const targetHasLayer = targetInfo.map.has(layerId);
    if (currentHasLayer === targetHasLayer) {
      return false;
    }

    const snapshotWithLayer = targetHasLayer ? targetInfo : currentInfo;
    const expectedLayerIndex = snapshotWithLayer.ids.indexOf(layerId);
    if (expectedLayerIndex !== index) {
      return false;
    }

    const currentOtherIds = currentInfo.ids.filter((id) => id !== layerId);
    const targetOtherIds = targetInfo.ids.filter((id) => id !== layerId);
    if (currentOtherIds.length !== targetOtherIds.length) {
      return false;
    }

    return currentOtherIds.every((id, currentIndex) => id === targetOtherIds[currentIndex]);
  }

  _isHistorySnapshotPaintLayer(snapshotObject) {
    return !!snapshotObject
      && snapshotObject.type === 'image'
      && !snapshotObject._isGuide
      && !snapshotObject._isSpecMap
      && snapshotObject.name !== '__template__'
      && snapshotObject.name !== '__background__';
  }

  _getHistorySnapshotIdentityInfo(snapshotData) {
    const objects = Array.isArray(snapshotData?.objects) ? snapshotData.objects : null;
    if (!objects) return null;

    const ids = [];
    const map = new Map();

    for (let index = 0; index < objects.length; index += 1) {
      const snapshotObject = objects[index];
      const identity = this._getHistorySnapshotObjectIdentity(snapshotObject);
      if (!identity || map.has(identity)) {
        return null;
      }

      ids.push(identity);
      map.set(identity, { snapshotObject, index });
    }

    return { ids, map, objects };
  }

  _insertCanvasObjectWithoutHistory(obj, index) {
    if (!obj) return false;

    const previousSuspendHistory = this._suspendHistory;
    this._suspendHistory = true;
    try {
      this.canvas.insertAt(obj, index);
    } finally {
      this._suspendHistory = previousSuspendHistory;
    }

    return this.canvas.getObjects().indexOf(obj) === index;
  }

  _applyHistoryReplaySnapshotMetadata(obj, snapshotObject) {
    if (!obj || !snapshotObject || typeof snapshotObject !== 'object') return false;

    obj.set({
      name: typeof snapshotObject.name === 'string' ? snapshotObject.name : obj.name,
      selectable: snapshotObject.selectable !== false,
      evented: snapshotObject.evented !== false,
      visible: snapshotObject.visible !== false,
      opacity: Number.isFinite(Number(snapshotObject.opacity))
        ? Math.max(0, Math.min(1, Number(snapshotObject.opacity)))
        : obj.opacity,
    });

    obj.locked = !!snapshotObject.locked;
    obj._isGuide = !!snapshotObject._isGuide;
    obj._isSpecMap = !!snapshotObject._isSpecMap;
    obj._groupName = typeof snapshotObject._groupName === 'string' ? snapshotObject._groupName : (obj._groupName || '');
    obj.globalCompositeOperation = typeof snapshotObject.globalCompositeOperation === 'string' && snapshotObject.globalCompositeOperation
      ? snapshotObject.globalCompositeOperation
      : (obj.globalCompositeOperation || 'source-over');
    obj.perPixelTargetFind = !!snapshotObject.perPixelTargetFind;
    if (typeof snapshotObject._primaryColor === 'string') {
      obj._primaryColor = snapshotObject._primaryColor;
    }
    if (typeof snapshotObject._secondaryColor === 'string') {
      obj._secondaryColor = snapshotObject._secondaryColor;
    }

    if (typeof snapshotObject._id === 'string' && snapshotObject._id) {
      obj._id = snapshotObject._id;
    }
    this._ensureObjectId(obj);
    if (typeof obj.setCoords === 'function') {
      obj.setCoords();
    }
    return true;
  }

  _enlivenHistorySnapshotObject(snapshotObject) {
    return new Promise((resolve) => {
      if (!snapshotObject || !fabric?.util?.enlivenObjects) {
        resolve(null);
        return;
      }

      let settled = false;
      const finish = (objects) => {
        if (settled) return;
        settled = true;
        resolve(Array.isArray(objects) && objects[0] ? objects[0] : null);
      };

      try {
        const maybePromise = fabric.util.enlivenObjects([snapshotObject], finish);
        if (maybePromise && typeof maybePromise.then === 'function') {
          maybePromise.then(finish).catch(() => finish(null));
        }
      } catch (error) {
        finish(null);
      }
    });
  }

  _createHistorySnapshotPaintReplaySurface(snapshotObject) {
    if (!this._isHistorySnapshotPaintLayer(snapshotObject)) {
      return Promise.resolve(null);
    }

    return this._enlivenHistorySnapshotObject(snapshotObject).then((snapshotLayer) => {
      if (!this._isValidPaintLayer(snapshotLayer)) {
        return null;
      }

      const snapshotElement = snapshotLayer.getElement ? snapshotLayer.getElement() : snapshotLayer._element;
      if (!snapshotElement) {
        return null;
      }

      const sourceWidth = Math.max(
        1,
        Math.round(Number(snapshotLayer.width || snapshotElement.naturalWidth || snapshotElement.width || snapshotObject.width || 1) || 1)
      );
      const sourceHeight = Math.max(
        1,
        Math.round(Number(snapshotLayer.height || snapshotElement.naturalHeight || snapshotElement.height || snapshotObject.height || 1) || 1)
      );

      const surfaceCanvas = document.createElement('canvas');
      surfaceCanvas.width = sourceWidth;
      surfaceCanvas.height = sourceHeight;
      const surfaceCtx = surfaceCanvas.getContext('2d');
      if (!surfaceCtx) {
        return null;
      }

      surfaceCtx.clearRect(0, 0, sourceWidth, sourceHeight);
      surfaceCtx.drawImage(snapshotElement, 0, 0, sourceWidth, sourceHeight);

      return {
        surfaceCanvas,
      };
    });
  }

  _isTargetedHistoryReplayEntrySupported(entry) {
    switch (entry?.name) {
      case 'document.stroke.commit':
      case 'document.fill.apply':
      case 'document.object.properties.set':
      case 'document.object.transform.set':
      case 'document.layer.add':
      case 'document.layer.remove':
      case 'document.layer.visibility.set':
      case 'document.layer.opacity.set':
      case 'document.layer.order.set':
      case 'document.template.opacity.set':
        return true;
      default:
        return false;
    }
  }

  _isTargetedHistoryReplaySnapshotCompatible(entry, currentSnapshotData, targetSnapshotData) {
    const currentInfo = this._getHistorySnapshotIdentityInfo(currentSnapshotData);
    const targetInfo = this._getHistorySnapshotIdentityInfo(targetSnapshotData);
    if (!currentInfo || !targetInfo) {
      return false;
    }

    if (
      Number.isFinite(Number(currentSnapshotData?.width))
      && Number(currentSnapshotData.width) !== this.ART_W
    ) {
      return false;
    }

    if (
      Number.isFinite(Number(currentSnapshotData?.height))
      && Number(currentSnapshotData.height) !== this.ART_H
    ) {
      return false;
    }

    if (
      Number.isFinite(Number(targetSnapshotData?.width))
      && Number(targetSnapshotData.width) !== this.ART_W
    ) {
      return false;
    }

    if (
      Number.isFinite(Number(targetSnapshotData?.height))
      && Number(targetSnapshotData.height) !== this.ART_H
    ) {
      return false;
    }

    const structuralLayerOperation = this._getTargetedHistoryReplayStructuralLayerOperation(entry);
    if (structuralLayerOperation) {
      return this._isTargetedHistoryReplaySingleLayerStructureCompatible(
        currentInfo,
        targetInfo,
        structuralLayerOperation.layerId,
        structuralLayerOperation.index,
      );
    }

    const paintOperation = this._getTargetedHistoryReplayPaintOperation(entry);
    if (paintOperation?.createdTargetLayer) {
      return this._isTargetedHistoryReplaySingleLayerStructureCompatible(
        currentInfo,
        targetInfo,
        paintOperation.layerId,
        paintOperation.insertIndex,
      );
    }

    if (currentInfo.ids.length !== targetInfo.ids.length) {
      return false;
    }

    const currentIdSet = new Set(currentInfo.ids);
    const targetIdSet = new Set(targetInfo.ids);
    return currentInfo.ids.every((id) => targetIdSet.has(id))
      && targetInfo.ids.every((id) => currentIdSet.has(id));
  }

  _getHistorySnapshotPrimaryColor(snapshotObject) {
    return this._normalizeWorkspaceInspectorColor(
      typeof snapshotObject?._primaryColor === 'string'
        ? snapshotObject._primaryColor
        : (typeof snapshotObject?.fill === 'string' && snapshotObject.fill.startsWith('#')
            ? snapshotObject.fill
            : (typeof snapshotObject?.stroke === 'string' && snapshotObject.stroke.startsWith('#')
                ? snapshotObject.stroke
                : null))
    );
  }

  _getHistorySnapshotSecondaryColor(snapshotObject) {
    return this._normalizeWorkspaceInspectorColor(
      typeof snapshotObject?._secondaryColor === 'string'
        ? snapshotObject._secondaryColor
        : (typeof snapshotObject?.stroke === 'string' && snapshotObject.stroke.startsWith('#')
            ? snapshotObject.stroke
            : null)
    );
  }

  _applyTargetedHistoryObjectPropertiesReplay(entry, targetSnapshotData) {
    const targetId = this._getTargetedHistoryReplaySingleTargetId(entry, ['targetId']);
    if (!targetId) return false;

    const target = this._getObjectById(targetId);
    const snapshotObject = this._getHistorySnapshotObjectMap(targetSnapshotData).get(targetId)?.snapshotObject || null;
    if (!target || !snapshotObject) return false;

    const propertyKeys = new Set();
    (entry.operations || []).forEach((operation) => {
      if (typeof operation?.propertyKey === 'string' && operation.propertyKey) {
        propertyKeys.add(operation.propertyKey);
      }
    });

    if (!propertyKeys.size) return false;

    if (propertyKeys.has('primaryColor')) {
      const nextPrimaryColor = this._getHistorySnapshotPrimaryColor(snapshotObject);
      if (!nextPrimaryColor || !this._applyObjectPrimaryColor(target, nextPrimaryColor)) {
        return false;
      }
    }

    if (propertyKeys.has('secondaryColor')) {
      const nextSecondaryColor = this._getHistorySnapshotSecondaryColor(snapshotObject);
      if (!nextSecondaryColor || !this._applyObjectSecondaryColor(target, nextSecondaryColor)) {
        return false;
      }
    }

    if (propertyKeys.has('opacity')) {
      const nextOpacity = Math.max(0, Math.min(1, Number(snapshotObject.opacity)));
      if (!Number.isFinite(nextOpacity) || !this._applyObjectOpacity(target, nextOpacity)) {
        return false;
      }
    }

    if (propertyKeys.has('strokeWidth')) {
      const nextStrokeWidth = Math.max(0, Number(snapshotObject.strokeWidth));
      if (!Number.isFinite(nextStrokeWidth) || !this._applyObjectStrokeWidth(target, nextStrokeWidth)) {
        return false;
      }
    }

    const textChanges = {};
    if (propertyKeys.has('fontFamily')) {
      if (typeof snapshotObject.fontFamily !== 'string' || !snapshotObject.fontFamily.trim()) {
        return false;
      }
      textChanges.fontFamily = snapshotObject.fontFamily;
    }

    if (propertyKeys.has('fontSize')) {
      const nextFontSize = Number(snapshotObject.fontSize);
      if (!Number.isFinite(nextFontSize)) {
        return false;
      }
      textChanges.fontSize = nextFontSize;
    }

    if (Object.keys(textChanges).length > 0 && !this._applyObjectTextStyle(target, textChanges)) {
      return false;
    }

    return true;
  }

  _applyTargetedHistoryObjectTransformReplay(entry, targetSnapshotData) {
    const targetId = this._getTargetedHistoryReplaySingleTargetId(entry, ['targetId']);
    if (!targetId) return false;

    const target = this._getObjectById(targetId);
    const snapshotObject = this._getHistorySnapshotObjectMap(targetSnapshotData).get(targetId)?.snapshotObject || null;
    if (!target || !snapshotObject) return false;

    target.set({
      left: Number(snapshotObject.left) || 0,
      top: Number(snapshotObject.top) || 0,
      scaleX: Number.isFinite(Number(snapshotObject.scaleX)) ? Number(snapshotObject.scaleX) : 1,
      scaleY: Number.isFinite(Number(snapshotObject.scaleY)) ? Number(snapshotObject.scaleY) : 1,
      angle: Number(snapshotObject.angle) || 0,
      skewX: Number(snapshotObject.skewX) || 0,
      skewY: Number(snapshotObject.skewY) || 0,
      flipX: !!snapshotObject.flipX,
      flipY: !!snapshotObject.flipY,
    });
    target.dirty = true;
    if (typeof target.setCoords === 'function') {
      target.setCoords();
    }
    this.canvas.renderAll();
    this._scheduleViewportBaseSync();
    return true;
  }

  _applyTargetedHistoryLayerStructuralReplay(entry, targetSnapshotData) {
    const structuralLayerOperation = this._getTargetedHistoryReplayStructuralLayerOperation(entry);
    if (!structuralLayerOperation) return false;

    const targetInfo = this._getHistorySnapshotIdentityInfo(targetSnapshotData);
    if (!targetInfo) return false;

    const runtimeTarget = this._getObjectById(structuralLayerOperation.layerId);
    const targetSnapshotMatch = targetInfo.map.get(structuralLayerOperation.layerId) || null;

    if (!targetSnapshotMatch) {
      if (!runtimeTarget) return false;
      return this._removeCanvasObjectWithoutHistory(runtimeTarget);
    }

    if (runtimeTarget) return false;

    return this._enlivenHistorySnapshotObject(targetSnapshotMatch.snapshotObject).then((obj) => {
      if (!obj || !this._applyHistoryReplaySnapshotMetadata(obj, targetSnapshotMatch.snapshotObject)) {
        return false;
      }

      return this._insertCanvasObjectWithoutHistory(obj, targetSnapshotMatch.index);
    });
  }

  _applyTargetedHistoryPaintLayerReplay(layerId, targetSnapshotData, options = {}) {
    if (!layerId) return false;

    const target = this._getObjectById(layerId);
    const snapshotObject = this._getHistorySnapshotObjectMap(targetSnapshotData).get(layerId)?.snapshotObject || null;
    if (!target || !snapshotObject || !this._isValidPaintLayer(target) || !this._isHistorySnapshotPaintLayer(snapshotObject)) {
      return false;
    }

    const resolveReplaySupport = typeof options.resolveReplaySupport === 'function'
      ? options.resolveReplaySupport
      : (replayTarget) => this._resolveSharedCroppedRasterLayerSupport(replayTarget);
    const croppedSupport = resolveReplaySupport(target);
    if (!croppedSupport?.supported) {
      return false;
    }

    return this._createHistorySnapshotPaintReplaySurface(snapshotObject).then((surfaceResult) => {
      if (!surfaceResult?.surfaceCanvas) {
        return false;
      }

      const objectWidth = Number.isFinite(Number(snapshotObject.width))
        ? Number(snapshotObject.width)
        : target.width;
      const objectHeight = Number.isFinite(Number(snapshotObject.height))
        ? Number(snapshotObject.height)
        : target.height;
      const scaleX = Number.isFinite(Number(snapshotObject.scaleX))
        ? Number(snapshotObject.scaleX)
        : target.scaleX;
      const scaleY = Number.isFinite(Number(snapshotObject.scaleY))
        ? Number(snapshotObject.scaleY)
        : target.scaleY;

      if (!this._commitLayerSurfaceInPlace(target, surfaceResult.surfaceCanvas, null, {
        objectWidth,
        objectHeight,
        scaleX,
        scaleY,
        recordHistory: false,
        emitEvents: false,
      })) {
        return false;
      }

      return this._applyHistoryReplaySnapshotMetadata(target, snapshotObject);
    });
  }

  _createTargetedHistoryRetainedFillValue(target, snapshotObject) {
    if (
      !target
      || !snapshotObject
      || target.type !== snapshotObject.type
      || !this._isFillableObject(target)
      || this._isValidPaintLayer(target)
    ) {
      return null;
    }

    if (typeof snapshotObject.fill === 'string' && snapshotObject.fill) {
      return snapshotObject.fill;
    }

    const hasGradientFill = !!snapshotObject.fill
      && typeof snapshotObject.fill === 'object'
      && Array.isArray(snapshotObject.fill.colorStops);
    if (!hasGradientFill || !['rect', 'ellipse', 'circle'].includes(target.type)) {
      return null;
    }

    const primaryColor = this._getHistorySnapshotPrimaryColor(snapshotObject);
    const secondaryColor = this._getHistorySnapshotSecondaryColor(snapshotObject);
    if (!primaryColor || !secondaryColor) {
      return null;
    }

    return this._createGradientFillForColors(target.width || 1, target.height || 1, primaryColor, secondaryColor);
  }

  _applyTargetedHistoryRetainedObjectFillReplay(targetId, targetSnapshotData) {
    if (!targetId) return false;

    const target = this._getObjectById(targetId);
    const snapshotObject = this._getHistorySnapshotObjectMap(targetSnapshotData).get(targetId)?.snapshotObject || null;
    if (!target || !snapshotObject) {
      return false;
    }

    const fillValue = this._createTargetedHistoryRetainedFillValue(target, snapshotObject);
    if (!fillValue) {
      return false;
    }

    target.set('fill', fillValue);
    if (!this._applyHistoryReplaySnapshotMetadata(target, snapshotObject)) {
      return false;
    }

    if (typeof target.setCoords === 'function') {
      target.setCoords();
    }

    this.canvas.renderAll();
    this._scheduleViewportBaseSync();
    return true;
  }

  _applyTargetedHistoryPaintReplay(entry, targetSnapshotData) {
    const paintOperation = this._getTargetedHistoryReplayPaintOperation(entry);
    if (!paintOperation) return false;

    if (paintOperation.replayKind === 'retained-non-raster') {
      return this._applyTargetedHistoryRetainedObjectFillReplay(
        paintOperation.targetId,
        targetSnapshotData,
      );
    }

    if (paintOperation.createdTargetLayer) {
      return this._applyTargetedHistoryLayerStructuralReplay(entry, targetSnapshotData);
    }

    const replaySupportResolver = this._getTargetedHistoryPaintReplaySupportResolver(paintOperation);

    return this._applyTargetedHistoryPaintLayerReplay(paintOperation.layerId, targetSnapshotData, {
      resolveReplaySupport: replaySupportResolver,
    });
  }

  _applyTargetedHistoryLayerVisibilityReplay(entry, targetSnapshotData) {
    const layerId = this._getTargetedHistoryReplaySingleTargetId(entry, ['layerId', 'targetId']);
    if (!layerId) return false;

    const target = this._getObjectById(layerId);
    const snapshotObject = this._getHistorySnapshotObjectMap(targetSnapshotData).get(layerId)?.snapshotObject || null;
    if (!target || !snapshotObject) return false;

    const nextVisible = snapshotObject.visible !== false;
    target.set({
      visible: nextVisible,
      selectable: nextVisible && this._isInteractiveInCurrentMode(target),
      evented: nextVisible && this._isInteractiveInCurrentMode(target),
    });

    if (!nextVisible && this.canvas.getActiveObject() === target) {
      this.canvas.discardActiveObject();
    }

    this.canvas.renderAll();
    this._scheduleViewportBaseSync();
    return true;
  }

  _applyTargetedHistoryLayerOpacityReplay(entry, targetSnapshotData) {
    const layerId = this._getTargetedHistoryReplaySingleTargetId(entry, ['layerId', 'targetId']);
    if (!layerId) return false;

    const target = this._getObjectById(layerId);
    const snapshotObject = this._getHistorySnapshotObjectMap(targetSnapshotData).get(layerId)?.snapshotObject || null;
    if (!target || !snapshotObject) return false;

    const nextOpacity = Math.max(0, Math.min(1, Number(snapshotObject.opacity)));
    if (!Number.isFinite(nextOpacity)) return false;

    target.set('opacity', nextOpacity);
    this.canvas.renderAll();
    this._scheduleViewportBaseSync();
    return true;
  }

  _applyTargetedHistoryLayerOrderReplay(targetSnapshotData) {
    const targetObjects = Array.isArray(targetSnapshotData?.objects) ? targetSnapshotData.objects : null;
    if (!targetObjects) return false;

    const runtimeObjects = this.canvas.getObjects().slice();
    const runtimeObjectMap = new Map();
    runtimeObjects.forEach((obj) => {
      const identity = this._getRuntimeHistoryObjectIdentity(obj);
      if (!identity || runtimeObjectMap.has(identity)) return;
      runtimeObjectMap.set(identity, obj);
    });

    if (runtimeObjectMap.size !== runtimeObjects.length) return false;

    const targetOrder = targetObjects.map((snapshotObject) => this._getHistorySnapshotObjectIdentity(snapshotObject));
    if (targetOrder.some((identity) => !identity || !runtimeObjectMap.has(identity))) {
      return false;
    }

    const previousSuspendHistory = this._suspendHistory;
    this._suspendHistory = true;
    try {
      targetOrder.forEach((identity, index) => {
        const obj = runtimeObjectMap.get(identity);
        const currentIndex = this.canvas.getObjects().indexOf(obj);
        if (!obj || currentIndex === index) return;
        this.canvas.remove(obj);
        this.canvas.insertAt(obj, index);
      });
    } finally {
      this._suspendHistory = previousSuspendHistory;
    }

    this.canvas.renderAll();
    this._scheduleViewportBaseSync();
    return true;
  }

  _applyTargetedHistoryTemplateOpacityReplay(entry, targetSnapshotData) {
    const targetObjects = Array.isArray(targetSnapshotData?.objects) ? targetSnapshotData.objects : [];
    const templateSnapshot = targetObjects.find((snapshotObject) => snapshotObject?.name === '__template__') || null;
    let nextOpacity = Number(templateSnapshot?.opacity);

    if (!Number.isFinite(nextOpacity)) {
      const lastOpacityOperation = Array.isArray(entry?.operations)
        ? entry.operations.slice().reverse().find((operation) => Number.isFinite(Number(operation?.opacity)))
        : null;
      nextOpacity = Number(lastOpacityOperation?.opacity);
    }

    if (!Number.isFinite(nextOpacity)) return false;

    nextOpacity = Math.max(0, Math.min(1, nextOpacity));
    this._templateOpacity = nextOpacity;
    if (this._templateObject) {
      this._templateObject.set('opacity', nextOpacity);
    }
    this.canvas.getObjects().forEach((obj) => {
      if (obj._isGuide) obj.set('opacity', nextOpacity);
    });
    this.canvas.renderAll();
    this._scheduleViewportBaseSync();
    return true;
  }

  _applyTargetedHistoryReplayEntry(entry, targetSnapshotData) {
    switch (entry?.name) {
      case 'document.stroke.commit':
      case 'document.fill.apply':
        return this._applyTargetedHistoryPaintReplay(entry, targetSnapshotData);
      case 'document.object.properties.set':
        return this._applyTargetedHistoryObjectPropertiesReplay(entry, targetSnapshotData);
      case 'document.object.transform.set':
        return this._applyTargetedHistoryObjectTransformReplay(entry, targetSnapshotData);
      case 'document.layer.add':
      case 'document.layer.remove':
        return this._applyTargetedHistoryLayerStructuralReplay(entry, targetSnapshotData);
      case 'document.layer.visibility.set':
        return this._applyTargetedHistoryLayerVisibilityReplay(entry, targetSnapshotData);
      case 'document.layer.opacity.set':
        return this._applyTargetedHistoryLayerOpacityReplay(entry, targetSnapshotData);
      case 'document.layer.order.set':
        return this._applyTargetedHistoryLayerOrderReplay(targetSnapshotData);
      case 'document.template.opacity.set':
        return this._applyTargetedHistoryTemplateOpacityReplay(entry, targetSnapshotData);
      default:
        return false;
    }
  }

  _tryReplayCommittedHistoryTransition(direction, currentSnapshot, targetSnapshot, onFallback = null) {
    const entry = direction === 'undo'
      ? this._getCommittedHistoryEntryForUndo(currentSnapshot, targetSnapshot)
      : this._getCommittedHistoryEntryForRedo(currentSnapshot, targetSnapshot);
    if (!entry || !this._isTargetedHistoryReplayEntrySupported(entry)) {
      return false;
    }

    const currentSnapshotData = this._parseHistorySnapshot(currentSnapshot);
    const targetSnapshotData = this._parseHistorySnapshot(targetSnapshot);
    if (
      !currentSnapshotData
      || !targetSnapshotData
      || !this._isTargetedHistoryReplaySnapshotCompatible(entry, currentSnapshotData, targetSnapshotData)
    ) {
      return false;
    }

    if (this._serializeCanvasState() !== currentSnapshot) {
      return false;
    }

    const restoreState = this._getHistoryReplayRestoreState(entry, direction);
    const previousSuspendHistory = this._suspendHistory;

    this._clearPendingPointerTransformCapture();
    this._restoreViewportBaseLiveOverlay({ render: false });
    this._viewportBaseSuspendedForFreeDraw = false;
    this._viewportBaseSuspendedForKeyboardNudge = false;
    this._viewportBaseSuspendedForTextEditing = false;
    this._setViewportBaseSuspended(false);
    this._discardPendingHistoryTransaction('history-replay');
    this._suspendHistory = true;
    let asyncReplayBarrier = null;

    const finalizeReplay = (replayApplied) => {
      let replaySucceeded = !!replayApplied;

      try {
        if (replaySucceeded) {
          this._restoreToolStateAfterHistoryLoad(
            restoreState?.selectedObjectId || null,
            restoreState?.activeLayerId || null
          );
          this._resyncLiveDocumentMirrorFromSnapshotJson(targetSnapshot);
          const entryMetadata = this._extractRestorableDocumentMetadataFromCommittedEntry(entry, direction);
          if (entryMetadata) {
            this._applyTransactionMetadataToDocumentMirror(entryMetadata);
          }
          this.canvas.renderAll();
          replaySucceeded = this._serializeCanvasState() === targetSnapshot;
        }
      } catch (error) {
        replaySucceeded = false;
      } finally {
        this._suspendHistory = previousSuspendHistory;
        if (asyncReplayBarrier) {
          this._endAsyncHistoryReplayMutation(asyncReplayBarrier);
          asyncReplayBarrier = null;
        }
      }

      if (!replaySucceeded) {
        if (typeof onFallback === 'function') {
          onFallback();
        }
        return false;
      }

      this._scheduleViewportBaseSync();
      if (this.onLayersChanged) this.onLayersChanged();
      if (this.onSelectionChanged) this.onSelectionChanged(this.canvas.getActiveObject() || null);
      return true;
    };

    try {
      const replayResult = this._applyTargetedHistoryReplayEntry(entry, targetSnapshotData);
      if (replayResult && typeof replayResult.then === 'function') {
        asyncReplayBarrier = this._beginAsyncHistoryReplayMutation({
          name: typeof entry?.name === 'string' ? entry.name : 'history-replay',
          label: 'Async history replay',
          targetId: restoreState?.selectedObjectId || restoreState?.activeLayerId || null,
        });
        replayResult
          .then((replayApplied) => finalizeReplay(replayApplied))
          .catch(() => finalizeReplay(false));
        return true;
      }

      finalizeReplay(replayResult);
      return true;
    } catch (error) {
      finalizeReplay(false);
      return true;
    }
  }

  _extractRestorableDocumentMetadataFromCommittedEntry(entry, direction) {
    if (!entry) return null;

    const isUndo = direction === 'undo';
    const meta = entry.checkpointMetadata;
    const result = {
      selectedObjectId: isUndo
        ? (entry.beforeSelectedObjectId || null)
        : (entry.afterSelectedObjectId || null),
      activeLayerId: isUndo
        ? (entry.beforeActiveLayerId || null)
        : (entry.afterActiveLayerId || null),
      operationName: entry.name || null,
    };

    if (meta && typeof meta === 'object') {
      if (meta.artboard && typeof meta.artboard === 'object') {
        result.artboard = {
          width: Number.isFinite(meta.artboard.width) ? meta.artboard.width : null,
          height: Number.isFinite(meta.artboard.height) ? meta.artboard.height : null,
        };
      }
      if (meta.template && typeof meta.template === 'object') {
        result.template = {};
        if (typeof meta.template.opacity === 'number') {
          result.template.opacity = meta.template.opacity;
        }
        if (typeof meta.template.hasTemplateLayer === 'boolean') {
          result.template.hasTemplateLayer = meta.template.hasTemplateLayer;
        }
      }
      if (meta.car && typeof meta.car === 'object') {
        result.car = meta.car;
      }
    }

    return result;
  }

  _applyTransactionMetadataToDocumentMirror(metadata) {
    if (!this._liveDocumentMirror || !metadata || typeof metadata !== 'object') return;

    if (this._liveDocumentMirror.session) {
      if (typeof metadata.selectedObjectId === 'string' || metadata.selectedObjectId === null) {
        this._liveDocumentMirror.session.selection.selectedObjectId = metadata.selectedObjectId;
      }
      if (typeof metadata.activeLayerId === 'string' || metadata.activeLayerId === null) {
        this._liveDocumentMirror.session.selection.activeLayerId = metadata.activeLayerId;
      }
    }

    if (metadata.artboard && this._liveDocumentMirror.artboard) {
      if (Number.isFinite(metadata.artboard.width)) {
        this._liveDocumentMirror.artboard.width = metadata.artboard.width;
      }
      if (Number.isFinite(metadata.artboard.height)) {
        this._liveDocumentMirror.artboard.height = metadata.artboard.height;
      }
    }

    if (metadata.template && this._liveDocumentMirror.template) {
      if (typeof metadata.template.opacity === 'number') {
        this._liveDocumentMirror.template.opacity = metadata.template.opacity;
      }
      if (typeof metadata.template.hasTemplateLayer === 'boolean') {
        this._liveDocumentMirror.template.hasTemplateLayer = metadata.template.hasTemplateLayer;
      }
    }

    if (metadata.car && this._liveDocumentMirror) {
      this._liveDocumentMirror.car = typeof metadata.car === 'object'
        ? JSON.parse(JSON.stringify(metadata.car))
        : null;
    }
  }

  _getUndoRestoreState(currentSnapshot, targetSnapshot) {
    const entry = this._getCommittedHistoryEntryForUndo(currentSnapshot, targetSnapshot);

    if (!entry) return null;

    return {
      selectedObjectId: entry.beforeSelectedObjectId || null,
      activeLayerId: entry.beforeActiveLayerId || null,
      transactionMetadata: this._extractRestorableDocumentMetadataFromCommittedEntry(entry, 'undo'),
    };
  }

  _getRedoRestoreState(currentSnapshot, targetSnapshot) {
    const entry = this._getCommittedHistoryEntryForRedo(currentSnapshot, targetSnapshot);

    if (!entry) return null;

    return {
      selectedObjectId: entry.afterSelectedObjectId || null,
      activeLayerId: entry.afterActiveLayerId || null,
      transactionMetadata: this._extractRestorableDocumentMetadataFromCommittedEntry(entry, 'redo'),
    };
  }

  undo() {
    if (this._isExclusiveAsyncPaintMutationActive()) return false;

    // If a coalesced transaction is still pending (e.g. mid-opacity-slider or
    // rapid nudge), discard it and roll the canvas back to the pre-transaction
    // state instead of committing the pending work first.  This makes a single
    // Ctrl+Z fully undo the uncommitted change.
    if (this._historySession && this._historySession.hasActiveTransaction()) {
      const afterSnapshot = this._serializeCanvasState();
      this._discardPendingHistoryTransaction('undo-rollback');
      this._redoStack.push(afterSnapshot);
      const beforeState = this._undoStack[this._undoStack.length - 1];
      if (beforeState) {
        this._loadState(beforeState);
      }
      return true;
    }

    this._flushPendingHistoryTransaction('undo');
    if (this._undoStack.length <= 1) return false;
    const cur = this._undoStack.pop();
    this._redoStack.push(cur);
    const state = this._undoStack[this._undoStack.length - 1];
    if (this._tryReplayCommittedHistoryTransition('undo', cur, state, () => {
      this._loadState(state, null, null, this._getUndoRestoreState(cur, state));
    })) {
      return true;
    }
    this._loadState(state, null, null, this._getUndoRestoreState(cur, state));
    return true;
  }

  redo() {
    if (this._isExclusiveAsyncPaintMutationActive()) return false;

    this._flushPendingHistoryTransaction('redo');
    if (this._redoStack.length === 0) return false;
    const state = this._redoStack.pop();
    const currentSnapshot = this._undoStack[this._undoStack.length - 1] || null;
    this._undoStack.push(state);
    if (this._tryReplayCommittedHistoryTransition('redo', currentSnapshot, state, () => {
      this._loadState(state, null, null, this._getRedoRestoreState(currentSnapshot, state));
    })) {
      return true;
    }
    this._loadState(state, null, null, this._getRedoRestoreState(currentSnapshot, state));
    return true;
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
    if (this._liveDocumentMirror) {
      this._liveDocumentMirror.car = this.getDocumentCar();
      this._refreshLiveDocumentMirrorSession();
    }
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

  _cloneDocumentMirrorValue(value) {
    return value == null ? value : JSON.parse(JSON.stringify(value));
  }

  _setLiveDocumentMirror(documentPayload, options = {}) {
    if (!documentPayload || typeof documentPayload !== 'object') {
      this._liveDocumentMirror = null;
      return null;
    }

    this._liveDocumentMirror = this._cloneDocumentMirrorValue(documentPayload);
    if (options.refreshSession !== false) {
      this._refreshLiveDocumentMirrorSession();
    }
    return this._liveDocumentMirror;
  }

  _refreshLiveDocumentMirrorSession() {
    if (!this._liveDocumentMirror || typeof this._liveDocumentMirror !== 'object') {
      return null;
    }

    this._liveDocumentMirror.session = this._cloneDocumentMirrorValue(this.getDocumentSessionState());
    return this._liveDocumentMirror.session;
  }

  _resyncLiveDocumentMirror(options = {}) {
    if (!window.LiveryLabDocument?.createDocumentSnapshot) return null;

    const includeSession = options.includeSession !== false;
    this._liveDocumentMirror = window.LiveryLabDocument.createDocumentSnapshot(this, {
      includeSession,
      preferLiveMirror: false,
    });
    if (includeSession) {
      this._refreshLiveDocumentMirrorSession();
    }
    return this._liveDocumentMirror;
  }

  _resyncLiveDocumentMirrorFromSnapshotJson(json) {
    if (!window.LiveryLabDocument) return null;

    let canvasState = json;
    if (typeof json === 'string') {
      try {
        canvasState = JSON.parse(json);
      } catch (error) {
        return this._resyncLiveDocumentMirror({ includeSession: true });
      }
    }

    if (!canvasState || typeof canvasState !== 'object') {
      return this._resyncLiveDocumentMirror({ includeSession: true });
    }

    if (typeof window.LiveryLabDocument.createDocumentSnapshotFromCanvasState === 'function') {
      this._liveDocumentMirror = window.LiveryLabDocument.createDocumentSnapshotFromCanvasState(this, canvasState, {
        includeSession: true,
      });
      this._refreshLiveDocumentMirrorSession();
      return this._liveDocumentMirror;
    }

    return this._resyncLiveDocumentMirror({ includeSession: true });
  }

  getLiveDocumentMirror(options = {}) {
    const includeSession = options.includeSession !== false;
    const clone = options.clone !== false;
    const fallbackToRuntime = options.fallbackToRuntime !== false;

    if (!this._liveDocumentMirror && fallbackToRuntime) {
      this._resyncLiveDocumentMirror({ includeSession: true });
    }

    if (!this._liveDocumentMirror) {
      return null;
    }

    if (!this._isLiveDocumentMirrorAlignedWithCanvas(this._liveDocumentMirror)) {
      if (!fallbackToRuntime) {
        return null;
      }

      this._resyncLiveDocumentMirror({ includeSession: true });
    }

    if (!this._liveDocumentMirror) {
      return null;
    }

    this._refreshLiveDocumentMirrorSession();

    const mirror = clone || !includeSession
      ? this._cloneDocumentMirrorValue(this._liveDocumentMirror)
      : this._liveDocumentMirror;

    if (!includeSession && mirror && Object.prototype.hasOwnProperty.call(mirror, 'session')) {
      delete mirror.session;
    }

    return mirror;
  }

  _isLiveDocumentMirrorAlignedWithCanvas(documentMirror = this._liveDocumentMirror) {
    const durableLayers = Array.isArray(documentMirror?.layers) ? documentMirror.layers : null;
    const objects = this.canvas.getObjects();
    if (!durableLayers || durableLayers.length !== objects.length) {
      return false;
    }

    for (let index = 0; index < durableLayers.length; index += 1) {
      const layerId = typeof durableLayers[index]?.id === 'string' && durableLayers[index].id
        ? durableLayers[index].id
        : null;
      const objectId = objects[index] ? this._ensureObjectId(objects[index]) : null;
      if (!layerId || layerId !== objectId) {
        return false;
      }
    }

    return true;
  }

  _getWorkspaceSelectionToolContext(obj) {
    if (!obj) return null;
    if (obj.type === 'i-text' || obj.type === 'text') return 'text';
    if (obj.type === 'line') return 'line';
    if (this._isGradientObject(obj)) return 'gradient';
    if (obj.type === 'rect') return 'rect';
    if (obj.type === 'ellipse' || obj.type === 'circle') return 'circle';
    return null;
  }

  _getWorkspaceSelectedObjectProjection(obj) {
    if (!obj) return null;

    const primaryColor = typeof obj._primaryColor === 'string'
      ? obj._primaryColor
      : (typeof obj.fill === 'string' && obj.fill.startsWith('#')
          ? obj.fill
          : (typeof obj.stroke === 'string' && obj.stroke.startsWith('#') ? obj.stroke : null));
    const secondaryColor = typeof obj._secondaryColor === 'string'
      ? obj._secondaryColor
      : (typeof obj.stroke === 'string' && obj.stroke.startsWith('#') ? obj.stroke : null);
    const opacity = Number.isFinite(Number(obj.opacity)) ? Number(obj.opacity) : 1;
    const strokeWidth = Number.isFinite(Number(obj.strokeWidth)) ? Number(obj.strokeWidth) : null;
    const fontFamily = typeof obj.fontFamily === 'string' && obj.fontFamily ? obj.fontFamily : null;
    const fontSize = Number.isFinite(Number(obj.fontSize)) ? Number(obj.fontSize) : null;
    const isTemplate = obj.name === '__template__';
    const isOpacityEditable = this._isWorkspaceLayerOpacityEditableObject(obj);

    return {
      id: obj._id || null,
      type: obj.type || null,
      toolContext: this._getWorkspaceSelectionToolContext(obj),
      primaryColor,
      secondaryColor,
      opacity,
      strokeWidth,
      fontFamily,
      fontSize,
      isGuide: !!obj._isGuide,
      isSpecMap: !!obj._isSpecMap,
      isTemplate,
      isOpacityEditable,
    };
  }

  _getWorkspaceInspectorState(activeObject = this.canvas.getActiveObject() || null) {
    const selectedObject = this.currentTool === 'select'
      ? this._getWorkspaceSelectedObjectProjection(activeObject)
      : null;
    const layerOpacityTarget = this._getWorkspaceSelectedObjectProjection(activeObject);
    const selectionActions = this._getWorkspaceSelectionActionState(activeObject);
    const effectiveTool = this.currentTool === 'select'
      ? (selectedObject?.toolContext || this.currentTool)
      : this.currentTool;

    return {
      effectiveTool,
      selectedObject,
      controls: {
        primaryColor: selectedObject?.primaryColor || this.primaryColor,
        secondaryColor: selectedObject?.secondaryColor || this.secondaryColor,
        opacity: Number.isFinite(Number(selectedObject?.opacity))
          ? Number(selectedObject.opacity)
          : this.opacity,
        strokeWidth: Number.isFinite(Number(selectedObject?.strokeWidth))
          ? Number(selectedObject.strokeWidth)
          : this.strokeWidth,
        fontFamily: selectedObject?.fontFamily || this.currentFont,
        fontSize: Number.isFinite(Number(selectedObject?.fontSize))
          ? Number(selectedObject.fontSize)
          : this.currentFontSize,
      },
      layerOpacity: {
        value: layerOpacityTarget?.isOpacityEditable ? layerOpacityTarget.opacity : 1,
        editable: !!layerOpacityTarget?.isOpacityEditable && !!selectionActions.canChangeLayerOpacity,
      },
    };
  }

  getWorkspaceState() {
    const activeObject = this.canvas.getActiveObject() || null;
    const activeLayer = this._activeLayer || null;

    return {
      tool: {
        active: this.currentTool,
      },
      selection: {
        selectedObjectId: activeObject?._id || null,
        selectedObjectType: activeObject?.type || null,
        activeLayerId: activeLayer?._id || null,
        activeLayerType: activeLayer?.type || null,
      },
      inspector: this._getWorkspaceInspectorState(activeObject),
      actions: this._getWorkspaceSelectionActionState(activeObject),
      layers: this.getLayers(),
    };
  }

  _createToolControllerContext() {
    return {
      freeDraw: {
        activate: (toolName) => this._activateFreeDrawTool(toolName),
        deactivate: () => this._endViewportBaseFreeDraw(),
        begin: () => this._beginViewportBaseFreeDraw(),
        end: () => this._endViewportBaseFreeDraw(),
        commitPath: (toolName, path) => this._commitFreeDrawPath(toolName, path),
      },
      fill: {
        commitAt: (point) => {
          if (!point) return;
          this._doFill(point.x, point.y);
        },
      },
      text: {
        insertAt: (point) => {
          if (!point) return;
          this._addTextAt(point.x, point.y);
        },
      },
      shape: {
        startPreview: (shapeType, point) => this._startShapePreview(shapeType, point),
        updatePreview: (shapeType, startPoint, point) => this._updateShapePreview(shapeType, startPoint, point),
        cancelPreview: (shapeType) => this._cancelShapePreview(shapeType),
        commitPreview: (shapeType) => this._commitShapePreview(shapeType),
      },
      gradient: {
        startPreview: (point) => this._startGradientPreview(point),
        updatePreview: (startPoint, point) => this._updateGradientPreview(startPoint, point),
        cancelPreview: () => this._cancelGradientPreview(),
        commitPreview: () => this._commitGradientPreview(),
      },
      select: {
        activateMode: () => this._makeOnlyActiveInteractive(),
      },
    };
  }

  /* ── Zoom ─────────────────────────────────────────────────── */
  setZoom(zoom) {
    zoom = Math.min(Math.max(zoom, 0.05), 3.0);
    this.currentZoom = zoom;
    this.canvas.setZoom(zoom);
    this.canvas.setWidth(Math.round(this.ART_W * zoom));
    this.canvas.setHeight(Math.round(this.ART_H * zoom));
    this._refreshLiveDocumentMirrorSession();
    this._scheduleViewportBaseSync();
  }

  zoomIn()  { this.setZoom(this.currentZoom + 0.05); }
  zoomOut() { this.setZoom(this.currentZoom - 0.05); }

  /**
   * Resize the art canvas to new dimensions (e.g. read from a PSD).
   * Clears all canvas content and resets the background.
   */
  async resizeArtboard(w, h) {
    if (this._isExclusiveAsyncPaintMutationActive()) return false;

    const nextWidth = Math.max(1, Math.round(Number(w) || this.ART_W));
    const nextHeight = Math.max(1, Math.round(Number(h) || this.ART_H));
    if (nextWidth === this.ART_W && nextHeight === this.ART_H) return false;

    const historyApi = window.LiveryLabHistory;
    const operationName = historyApi?.OPERATION_TYPES?.ARTBOARD_RESIZE || 'document.artboard.resize';
    const checkpointBoundary = historyApi?.CHECKPOINT_BOUNDARIES?.DOCUMENT_LOAD || 'document-load';
    const reversibility = historyApi?.REVERSIBILITY?.CHECKPOINT_ONLY || 'checkpoint-only';

    const { result } = await this._runDocumentBoundaryCheckpoint({
      name: operationName,
      label: 'Resize artboard',
      coalesceKey: `artboard-resize:${nextWidth}x${nextHeight}`,
      reversibility,
      checkpointBoundary,
      renderInvalidation: {
        scope: 'viewport-and-export',
        kind: 'document-replaced',
      },
      checkpointMetadata: {
        reason: 'Standalone artboard resize replaced the current working document dimensions and seeded a new undo baseline.',
        source: 'standalone-artboard-resize',
        artboard: {
          width: nextWidth,
          height: nextHeight,
        },
        template: {
          reset: true,
          hasTemplateLayer: false,
          opacity: this._templateOpacity,
        },
        documentReplacement: true,
      },
      apply: () => {
        this._resetArtboardCanvas(nextWidth, nextHeight);
        this._emitLayerCommitEvents(null);
        return {
          artboard: {
            width: this.ART_W,
            height: this.ART_H,
          },
        };
      },
    });

    return !!result;
  }

  _resetArtboardCanvas(w, h) {
    const nextWidth = Math.max(1, Math.round(Number(w) || this.ART_W));
    const nextHeight = Math.max(1, Math.round(Number(h) || this.ART_H));
    const previousSuspendHistory = this._suspendHistory;
    const preservedZoom = this.currentZoom;

    this._suspendHistory = true;
    try {
      this.ART_W = nextWidth;
      this.ART_H = nextHeight;
      this.canvas.setZoom(1);
      this.canvas.clear();
      this.canvas.setWidth(nextWidth);
      this.canvas.setHeight(nextHeight);
      this.canvas.setBackgroundColor(this.backgroundColor, () => {});
      this.createBackgroundLayer(this.backgroundColor);
      this._templateObject = null;
      this._activeLayer = null;
      this._toolTargetObject = null;
      this.setZoom(preservedZoom);
    } finally {
      this._suspendHistory = previousSuspendHistory;
    }

    return { width: nextWidth, height: nextHeight };
  }

  zoomFit() {
    const wrapW = document.getElementById('canvas-wrap').clientWidth  - 40;
    const wrapH = document.getElementById('canvas-wrap').clientHeight - 40;
    const z = Math.min(wrapW / this.ART_W, wrapH / this.ART_H);
    this.setZoom(z);
  }

  /* ── Tool Selection ───────────────────────────────────────── */
  setTool(toolName) {
    // Skip redundant same-tool switch to avoid clearing the Properties panel
    // while an object is still visually selected (e.g. pressing V twice).
    if (toolName === this.currentTool) return;

    this._clearPendingPointerTransformCapture();
    this._restoreViewportBaseLiveOverlay({ render: false });

    // Deactivate any existing tool controller before switching tools.
    this._deactivateCurrentTool();

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
        break;

      case 'brush':
        c.isDrawingMode = true;
        c.selection     = false;
        break;

      case 'eraser':
        c.isDrawingMode = true;
        c.selection     = false;
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

    this._activateCurrentTool();
    this._syncViewportBaseSuspensionReasons();

    // Refresh the Properties panel so it shows drawing defaults instead of
    // stale selected-object values after switching away from 'select'.
    if (this.onSelectionChanged) this.onSelectionChanged(null);
  }

  _deactivateCurrentTool() {
    if (this._activeToolController) {
      this._activeToolController.deactivate();
      this._activeToolController = null;
    }
  }

  _activateCurrentTool() {
    const controller = this._toolControllers[this.currentTool];
    if (controller) {
      this._activeToolController = controller;
      controller.activate();
    }
  }

  _activateFreeDrawTool(toolName) {
    if (!['brush', 'eraser'].includes(toolName)) return false;

    if (!this._activeLayer) {
      this._activeLayer = this.canvas.getObjects().find(o =>
        o.type === 'image' && !o._isGuide && !o._isSpecMap && o.name !== '__template__');
      if (this._activeLayer) this.canvas.setActiveObject(this._activeLayer);
    }

    if (toolName === 'brush') {
      this._configureBrush();
      return true;
    }

    this._configureEraser();
    return true;
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
        this._lockedForPaint.push({
          obj,
          selectable: obj.selectable,
          evented: obj.evented,
          hasControls: obj.hasControls,
          hasBorders: obj.hasBorders,
        });
        obj.set({ selectable: false, evented: false, hasControls: false, hasBorders: false });
      }
    });
    this.canvas.discardActiveObject();
    this.canvas.renderAll();
  }

  _unlockObjectsForPainting() {
    if (!this._lockedForPaint || this._lockedForPaint.length === 0) return;
    this._lockedForPaint.forEach(({ obj, selectable, evented, hasControls, hasBorders }) => {
      const allowed = this._isSelectableUserObject(obj);
      obj.set({
        selectable:  selectable && allowed,
        evented:     evented && allowed,
        hasControls: hasControls !== false && allowed,
        hasBorders:  hasBorders !== false && allowed,
      });
      if (allowed && typeof obj.setCoords === 'function') obj.setCoords();
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

  _startGradientPreview(point) {
    if (!point) return null;

    const shape = new fabric.Rect({
      left: point.x,
      top: point.y,
      width: 0,
      height: 0,
      fill: this._createGradientFill(1, 1),
      selectable: false,
      evented: false,
      stroke: null,
      strokeWidth: 0,
      _primaryColor: this.primaryColor,
      _secondaryColor: this.secondaryColor,
    });

    this._isDrawing = true;
    this._shapeStart = point;
    this._activeShape = shape;
    this._suspendHistory = true;
    this.canvas.add(shape);
    if (this._canKeepViewportBaseMountedForPreview('gradient')) {
      this._beginViewportBaseLiveOverlay('preview', shape);
    }
    this.canvas.renderAll();
    return shape;
  }

  _updateGradientPreview(startPoint, point) {
    const shape = this._activeShape;
    if (!shape || !this._isDrawing || !startPoint || !point) return false;

    const width = Math.max(1, Math.abs(point.x - startPoint.x));
    const height = Math.max(1, Math.abs(point.y - startPoint.y));
    const left = Math.min(point.x, startPoint.x);
    const top = Math.min(point.y, startPoint.y);

    shape.set({
      left,
      top,
      width,
      height,
      fill: this._createGradientFill(width, height),
    });
    this._applyObjectColorMetadata(shape);
    this.canvas.renderAll();
    return true;
  }

  _cancelGradientPreview() {
    const shape = this._activeShape;
    if (!shape) return false;

    this.canvas.remove(shape);
    this._activeShape = null;
    this._isDrawing = false;
    this._suspendHistory = false;
    this._shapeStart = null;
    this._restoreViewportBaseLiveOverlay({ render: false });
    this.canvas.renderAll();
    this._syncViewportBaseSuspensionReasons();
    return true;
  }

  _createGradientFill(width, height) {
    return this._createGradientFillForColors(width, height, this.primaryColor, this.secondaryColor);
  }

  _createGradientFillForColors(width, height, primaryColor, secondaryColor) {
    return new fabric.Gradient({
      type: 'linear',
      coords: {
        x1: 0,
        y1: 0,
        x2: Math.max(1, width),
        y2: Math.max(1, height),
      },
      colorStops: [
        { offset: 0, color: primaryColor },
        { offset: 1, color: secondaryColor },
      ],
    });
  }

  _createLineStroke(line) {
    return this._createLineStrokeForColors(line, this.primaryColor, this.secondaryColor, this.opacity);
  }

  _createLineStrokeForColors(line, primaryColor, secondaryColor, opacity = this.opacity) {
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
        { offset: 0, color: this._colorWithOpacity(primaryColor, opacity) },
        { offset: 1, color: this._colorWithOpacity(secondaryColor, opacity) },
      ],
    });
  }

  _createShapePreview(shapeType, point) {
    if (!point) return null;

    const common = {
      left: point.x,
      top: point.y,
      fill: this._colorWithOpacity(this.primaryColor, this.opacity),
      stroke: this.strokeWidth > 0 ? this.secondaryColor : null,
      strokeWidth: this.strokeWidth,
      strokeUniform: true,
      selectable: false,
      evented: false,
      _primaryColor: this.primaryColor,
      _secondaryColor: this.secondaryColor,
    };

    if (shapeType === 'rect') {
      return new fabric.Rect({ ...common, width: 0, height: 0 });
    }

    if (shapeType === 'circle') {
      return new fabric.Ellipse({ ...common, rx: 0, ry: 0 });
    }

    if (shapeType === 'line') {
      const line = new fabric.Line([point.x, point.y, point.x, point.y], {
        stroke: this._colorWithOpacity(this.primaryColor, this.opacity),
        strokeWidth: this.brushSize,
        selectable: false,
        evented: false,
      });
      line.set('stroke', this._createLineStroke(line));
      this._applyObjectColorMetadata(line);
      return line;
    }

    return null;
  }

  _startShapePreview(shapeType, point) {
    const shape = this._createShapePreview(shapeType, point);
    if (!shape) return null;

    this._isDrawing = true;
    this._shapeStart = point;
    this._activeShape = shape;
    this._suspendHistory = true;
    this.canvas.add(shape);
    if (this._canKeepViewportBaseMountedForPreview(shapeType)) {
      this._beginViewportBaseLiveOverlay('preview', shape);
    }
    this.canvas.renderAll();
    return shape;
  }

  _updateShapePreview(shapeType, startPoint, point) {
    const shape = this._activeShape;
    if (!shape || !this._isDrawing || !startPoint || !point) return false;

    if (shapeType === 'rect') {
      shape.set({
        left: Math.min(point.x, startPoint.x),
        top: Math.min(point.y, startPoint.y),
        width: Math.abs(point.x - startPoint.x),
        height: Math.abs(point.y - startPoint.y),
      });
    } else if (shapeType === 'circle') {
      shape.set({
        left: Math.min(point.x, startPoint.x),
        top: Math.min(point.y, startPoint.y),
        rx: Math.abs(point.x - startPoint.x) / 2,
        ry: Math.abs(point.y - startPoint.y) / 2,
      });
    } else if (shapeType === 'line') {
      shape.set({ x2: point.x, y2: point.y });
      shape.set('stroke', this._createLineStroke(shape));
    } else {
      return false;
    }

    this.canvas.renderAll();
    return true;
  }

  _cancelShapePreview(shapeType = null) {
    if (shapeType && !['rect', 'circle', 'line'].includes(shapeType)) return false;

    const shape = this._activeShape;
    if (!shape) return false;

    this.canvas.remove(shape);
    this._activeShape = null;
    this._isDrawing = false;
    this._suspendHistory = false;
    this._shapeStart = null;
    this._restoreViewportBaseLiveOverlay({ render: false });
    this.canvas.renderAll();
    this._syncViewportBaseSuspensionReasons();
    return true;
  }

  _commitShapePreview(shapeType) {
    const shapeNames = {
      rect: 'Rectangle',
      circle: 'Ellipse',
      line: 'Line',
    };

    if (!Object.prototype.hasOwnProperty.call(shapeNames, shapeType)) {
      return false;
    }

    return this._commitPreviewLayer(shapeType, {
      label: `Insert ${shapeNames[shapeType]} layer`,
      name: shapeNames[shapeType],
      source: `${shapeType}-preview-finalize`,
    });
  }

  _commitGradientPreview() {
    return this._commitPreviewLayer('gradient', {
      label: 'Insert gradient layer',
      name: 'Gradient',
      source: 'gradient-preview-finalize',
    });
  }

  _commitPreviewLayer(toolName, options = {}) {
    const shape = this._activeShape;
    if (!shape || !this._isDrawing || this.currentTool !== toolName) return false;

    this._isDrawing = false;
    this._activeShape = null;
    this._suspendHistory = false;
    this._shapeStart = null;

    const groupName = (this._activeLayer && this._activeLayer._groupName) || '';
    shape.set({
      selectable: true,
      evented: true,
      name: options.name || 'Shape',
      _groupName: groupName,
    });

    this.canvas.remove(shape);
    this._restoreViewportBaseLiveOverlay({ render: false });

    const { result } = this._insertStandaloneLayerWithTransaction(shape, {
      label: options.label || 'Insert layer',
      source: options.source || 'preview-finalize',
      preferredAnchor: this._activeLayer,
      onInserted: (insertedShape) => {
        this._makeOnlyActiveInteractive(insertedShape);
        this.canvas.renderAll();
        this.setTool('select');
        this._syncViewportBaseSuspensionReasons();
      },
    });

    if (!result) {
      this.canvas.renderAll();
      this.setTool('select');
      this._syncViewportBaseSuspensionReasons();
    }

    return !!result;
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

  _resolveSupportedSharedRasterFillBoundary(target) {
    if (!this._isValidPaintLayer(target)) {
      return { supported: false, reason: 'invalid-target' };
    }

    const croppedSupport = this._resolveSharedCroppedRasterLayerSupport(target);
    if (!croppedSupport?.supported) {
      return croppedSupport || { supported: false, reason: 'unsupported-target' };
    }

    const normalizeBlendMode = window.LiveryLabRender?.normalizeBlendMode;
    const targetBlendMode = typeof normalizeBlendMode === 'function'
      ? normalizeBlendMode(croppedSupport?.surface?.blendMode || croppedSupport?.layer?.blendMode || 'source-over')
      : ((typeof croppedSupport?.surface?.blendMode === 'string' && croppedSupport.surface.blendMode)
          || (typeof croppedSupport?.layer?.blendMode === 'string' && croppedSupport.layer.blendMode)
          || 'source-over');

    if (targetBlendMode !== 'source-over') {
      return {
        ...croppedSupport,
        supported: false,
        reason: 'unsupported-fill-blend-mode',
        blendMode: targetBlendMode,
      };
    }

    return {
      ...croppedSupport,
      supported: true,
      reason: null,
      blendMode: targetBlendMode,
    };
  }

  _resolveCommittedSharedRasterFillBoundary(target) {
    const replaySafeBoundary = this._resolveSupportedSharedRasterFillBoundary(target);
    if (replaySafeBoundary?.supported) {
      return {
        ...replaySafeBoundary,
        commitPath: 'shared-surface',
        commitSurfaceScope: 'cropped',
        replaySafe: true,
      };
    }

    const commitSupport = this._resolveSharedRasterLayerCommitSupport(target);
    if (!commitSupport?.supported) {
      return commitSupport || { supported: false, reason: 'unsupported-target' };
    }

    return {
      ...commitSupport,
      supported: true,
      reason: null,
      commitPath: 'shared-surface-commit-only',
      commitSurfaceScope: 'full-source',
      replaySafe: false,
    };
  }

  _buildSupportedSharedRasterFillContext(target, x, y) {
    if (!this._isValidPaintLayer(target)) return null;

    const commitSupport = this._resolveCommittedSharedRasterFillBoundary(target);
    if (!commitSupport?.supported) return null;

    const mappedPoint = this._mapArtboardPointToTargetSourcePixel(x, y, commitSupport);
    if (!mappedPoint) return null;

    const sourceWidth = Math.max(1, Math.round(Number(commitSupport.sourceWidth) || 1));
    const sourceHeight = Math.max(1, Math.round(Number(commitSupport.sourceHeight) || 1));
    const invalidationRect = this._getObjectArtboardCommitRect(target, 0);
    if (!invalidationRect) return null;

    return {
      targetEl: commitSupport.targetElement,
      targetWidth: sourceWidth,
      targetHeight: sourceHeight,
      localX: mappedPoint.localX,
      localY: mappedPoint.localY,
      sharedRasterSupport: commitSupport,
      invalidationRect,
      commitPath: commitSupport.commitPath || 'shared-surface',
      commitSurfaceScope: commitSupport.commitSurfaceScope || null,
      replaySafe: commitSupport.replaySafe === true,
    };
  }

  async _applyRasterLayerFillCommit(target, fillContext, options = {}) {
    if (!this._isValidPaintLayer(target) || !fillContext?.targetEl) return false;

    const offscreen = document.createElement('canvas');
    offscreen.width = fillContext.targetWidth;
    offscreen.height = fillContext.targetHeight;
    const ctx = offscreen.getContext('2d');
    if (!ctx) return false;

    ctx.drawImage(fillContext.targetEl, 0, 0, fillContext.targetWidth, fillContext.targetHeight);

    const id = ctx.getImageData(0, 0, fillContext.targetWidth, fillContext.targetHeight);
    const fillRGBA = this._hexToRGBA(this.primaryColor, this.opacity);
    const targetRGBA = this._getPixel(
      id.data,
      fillContext.localX,
      fillContext.localY,
      fillContext.targetWidth,
    );
    if (this._colorsMatch(targetRGBA, fillRGBA)) return false;

    this._scanlineFill(
      id.data,
      fillContext.localX,
      fillContext.localY,
      fillContext.targetWidth,
      fillContext.targetHeight,
      targetRGBA,
      fillRGBA,
    );
    ctx.putImageData(id, 0, 0);

    if (
      fillContext.sharedRasterSupport?.supported
      && this._commitLayerSurfaceInPlace(target, offscreen, null, {
        commitWidth: fillContext.targetWidth,
        commitHeight: fillContext.targetHeight,
        objectWidth: target.width,
        objectHeight: target.height,
        scaleX: target.scaleX,
        scaleY: target.scaleY,
        recordHistory: options.recordHistory,
        emitEvents: options.emitEvents,
      })
    ) {
      return {
        committedTarget: target,
        commitPath: fillContext.commitPath || 'shared-surface',
        commitSurfaceScope: fillContext.commitSurfaceScope || null,
      };
    }

    if (options.allowLegacyFallback === false) {
      return false;
    }

    const filledUrl = offscreen.toDataURL('image/png');
    const committedTarget = await this._replaceLayerWithImage(target, filledUrl, {
      recordHistory: options.recordHistory,
      emitEvents: options.emitEvents,
    });
    if (!committedTarget) return false;

    return {
      committedTarget,
      commitPath: 'legacy-fallback',
    };
  }

  async _fillRetainedRasterObject(target, fillContext) {
    if (!fillContext) return false;

    const historyApi = window.LiveryLabHistory;
    const operationName = historyApi?.OPERATION_TYPES?.FILL_APPLY || 'document.fill.apply';
    const checkpointBoundary = historyApi?.CHECKPOINT_BOUNDARIES?.PER_OPERATION || 'per-operation';
    const reversibility = historyApi?.REVERSIBILITY?.REVERSIBLE || 'reversible';
    const targetId = this._ensureObjectId(target);
    const targetLayerId = targetId;
    const invalidationRect = fillContext.invalidationRect;

    const { result } = await this._runTargetedDocumentTransaction({
      name: operationName,
      label: 'Apply retained raster fill',
      coalesceKey: `fill:retained-raster:${targetLayerId}`,
      reversibility,
      checkpointBoundary,
      exclusiveMutationBarrier: 'async-paint',
      resolveTarget: () => ({
        target,
        targetId,
        targetLayerId,
        fillContext,
        invalidationRect,
      }),
      renderInvalidation: (context) => this._buildLayerContentInvalidation(
        context.targetLayerId,
        context.invalidationRect,
        { targetType: 'retained-raster-layer' },
      ),
      operation: (transactionResult, context) => ({
        name: operationName,
        targetId: context.targetId,
        targetLayerId: context.targetLayerId,
        targetKind: 'retained-object',
        targetOwnership: 'layer-id',
        color: this.primaryColor,
        opacity: this.opacity,
        commitPath: transactionResult.commitPath,
        commitSurfaceScope: transactionResult.commitSurfaceScope || null,
        invalidation: this._buildLayerContentInvalidation(
          context.targetLayerId,
          context.invalidationRect,
          { targetType: 'retained-raster-layer' },
        ),
      }),
      apply: (context) => this._applyRasterLayerFillCommit(context.target, context.fillContext, {
        recordHistory: false,
        emitEvents: false,
      }),
      afterCommit: (transactionResult, context) => {
        this._emitLayerCommitEvents(transactionResult?.committedTarget || context.target);
      },
    });

    return !!result;
  }

  async _fillSelectedObject(target) {
    if (!this._isFillableObject(target)) return false;

    const historyApi = window.LiveryLabHistory;
    const operationName = historyApi?.OPERATION_TYPES?.FILL_APPLY || 'document.fill.apply';
    const checkpointBoundary = historyApi?.CHECKPOINT_BOUNDARIES?.PER_OPERATION || 'per-operation';
    const reversibility = historyApi?.REVERSIBILITY?.REVERSIBLE || 'reversible';
    const targetId = this._ensureObjectId(target);
    const fillValue = this._colorWithOpacity(this.primaryColor, this.opacity);
    const invalidationRect = this._getObjectArtboardCommitRect(target, 0);

    const { result } = await this._runTargetedDocumentTransaction({
      name: operationName,
      label: 'Apply retained fill',
      coalesceKey: `fill:retained:${targetId}`,
      reversibility,
      checkpointBoundary,
      exclusiveMutationBarrier: 'async-paint',
      resolveTarget: () => ({
        target,
        targetId,
        fillValue,
        invalidationRect,
      }),
      renderInvalidation: (context) => this._buildLayerContentInvalidation(
        context.targetId,
        context.invalidationRect,
        { targetType: 'retained-object' },
      ),
      operation: (_transactionResult, context) => ({
        name: operationName,
        targetId: context.targetId,
        targetKind: 'retained-object',
        color: this.primaryColor,
        opacity: this.opacity,
        invalidation: this._buildLayerContentInvalidation(
          context.targetId,
          context.invalidationRect,
          { targetType: 'retained-object' },
        ),
      }),
      apply: (context) => {
        context.target.set('fill', context.fillValue);
        context.target._primaryColor = this.primaryColor;
        context.target.set({ selectable: true, evented: true });

        if (typeof context.target.setCoords === 'function') context.target.setCoords();

        this.canvas.setActiveObject(context.target);
        this.canvas.renderAll();
        return { targetId: context.targetId };
      },
      afterCommit: (_transactionResult, context) => {
        if (this.onSelectionChanged) this.onSelectionChanged(context.target);
        this._scheduleViewportBaseSync();
      },
    });

    return !!result;
  }

  async _commitActiveLayerFill(target, fillContext) {
    const historyApi = window.LiveryLabHistory;
    const operationName = historyApi?.OPERATION_TYPES?.FILL_APPLY || 'document.fill.apply';
    const checkpointBoundary = historyApi?.CHECKPOINT_BOUNDARIES?.PER_OPERATION || 'per-operation';
    const reversibility = historyApi?.REVERSIBILITY?.REVERSIBLE || 'reversible';
    const targetLayerId = this._ensureObjectId(target);
    const invalidationRect = fillContext?.invalidationRect || {
      left: Math.round(Number(target.left) || 0),
      top: Math.round(Number(target.top) || 0),
      width: Math.max(1, Math.round(fillContext.targetWidth)),
      height: Math.max(1, Math.round(fillContext.targetHeight)),
    };

    const { result } = await this._runTargetedDocumentTransaction({
      name: operationName,
      label: 'Apply layer fill',
      coalesceKey: `fill:paint-layer:${targetLayerId}`,
      reversibility,
      checkpointBoundary,
      exclusiveMutationBarrier: 'async-paint',
      resolveTarget: () => ({
        target,
        targetLayerId,
        fillContext,
        invalidationRect,
      }),
      renderInvalidation: (context) => this._buildLayerContentInvalidation(
        context.targetLayerId,
        context.invalidationRect,
        { targetType: 'paint-layer' },
      ),
      operation: (transactionResult, context) => ({
        name: operationName,
        targetLayerId: context.targetLayerId,
        targetKind: 'paint-layer',
        color: this.primaryColor,
        opacity: this.opacity,
        commitPath: transactionResult.commitPath,
        commitSurfaceScope: transactionResult.commitSurfaceScope || null,
        invalidation: this._buildLayerContentInvalidation(
          context.targetLayerId,
          context.invalidationRect,
          { targetType: 'paint-layer' },
        ),
      }),
      apply: (context) => this._applyRasterLayerFillCommit(context.target, context.fillContext, {
        recordHistory: false,
        emitEvents: false,
      }),
      afterCommit: (transactionResult, context) => {
        this._emitLayerCommitEvents(transactionResult?.committedTarget || context.target);
      },
    });

    return !!result;
  }

  async _commitAutoCreatedLayerFill() {
    const historyApi = window.LiveryLabHistory;
    const operationName = historyApi?.OPERATION_TYPES?.FILL_APPLY || 'document.fill.apply';
    const checkpointBoundary = historyApi?.CHECKPOINT_BOUNDARIES?.PER_OPERATION || 'per-operation';
    const reversibility = historyApi?.REVERSIBILITY?.REVERSIBLE || 'reversible';
    const invalidationRect = {
      left: 0,
      top: 0,
      width: this.ART_W,
      height: this.ART_H,
    };

    const { result } = await this._runTargetedDocumentTransaction({
      name: operationName,
      label: 'Apply fill to auto-created layer',
      coalesceKey: 'fill:auto-created-layer',
      reversibility,
      checkpointBoundary,
      exclusiveMutationBarrier: 'async-paint',
      resolveTarget: ({ beforeSelectedObjectId, beforeActiveLayerId }) => {
        const previousToolTargetId = this._toolTargetObject?._id || beforeSelectedObjectId || null;
        const target = this._createBlankLayer(false);
        if (!this._isValidPaintLayer(target)) {
          return false;
        }

        const targetLayerId = this._ensureObjectId(target);
        const createdTargetLayerInsertIndex = this.canvas.getObjects().indexOf(target);

        return {
          target,
          targetLayerId,
          createdTargetLayer: true,
          createdTargetLayerId: targetLayerId,
          createdTargetLayerInsertIndex: createdTargetLayerInsertIndex >= 0
            ? createdTargetLayerInsertIndex
            : null,
          previousToolTargetId,
          previousActiveLayerId: beforeActiveLayerId,
          invalidationRect,
          abort: () => {
            this._removeCanvasObjectWithoutHistory(target);
            this._restoreAutoCreatedFillAbortState(previousToolTargetId, beforeActiveLayerId);
          },
        };
      },
      renderInvalidation: (context) => this._buildLayerContentInvalidation(
        context.targetLayerId,
        context.invalidationRect,
        { targetType: 'paint-layer' },
      ),
      operation: (transactionResult, context) => ({
        name: operationName,
        targetLayerId: context.targetLayerId,
        targetKind: 'paint-layer',
        color: this.primaryColor,
        opacity: this.opacity,
        commitPath: transactionResult.commitPath,
        createdTargetLayer: true,
        createdTargetLayerId: context.createdTargetLayerId,
        createdTargetLayerInsertIndex: context.createdTargetLayerInsertIndex,
        invalidation: this._buildLayerContentInvalidation(
          context.targetLayerId,
          context.invalidationRect,
          { targetType: 'paint-layer' },
        ),
      }),
      apply: async (context) => {
        if (Number(this.opacity) <= 0) {
          return false;
        }

        const offscreen = document.createElement('canvas');
        offscreen.width = this.ART_W;
        offscreen.height = this.ART_H;
        const ctx = offscreen.getContext('2d');
        if (!ctx) return false;

        ctx.fillStyle = this._colorWithOpacity(this.primaryColor, this.opacity);
        ctx.fillRect(0, 0, this.ART_W, this.ART_H);

        const croppedSupport = this._resolveSharedCroppedRasterLayerSupport(context.target);
        if (croppedSupport.supported && this._commitLayerSurfaceInPlace(context.target, offscreen, null, {
          recordHistory: false,
          emitEvents: false,
        })) {
          return {
            committedTarget: context.target,
            commitPath: 'shared-surface',
          };
        }

        const filledUrl = offscreen.toDataURL('image/png');
        const committedTarget = await this._replaceLayerWithImage(context.target, filledUrl, {
          recordHistory: false,
          emitEvents: false,
        });
        if (!committedTarget) return false;

        return {
          committedTarget,
          commitPath: 'legacy-fallback',
        };
      },
      afterCommit: (transactionResult, context) => {
        this._emitLayerCommitEvents(transactionResult?.committedTarget || context.target);
      },
    });

    return !!result;
  }

  /* ── Mouse handlers for shape drawing ────────────────────── */
  _canvasPoint(event) {
    const ptr = this.canvas.getPointer(event.e);
    return { x: ptr.x, y: ptr.y };
  }

  _onMouseDown(event) {
    const tool = this.currentTool;

    if (tool === 'select') {
      if (this._isSelectableUserObject(event?.target)) {
        this._capturePointerTransformStart(event.target);
      } else {
        this._clearPendingPointerTransformCapture();
      }

      if (this._canKeepViewportBaseMountedForSelectInteraction(event?.target)) {
        this._beginViewportBaseLiveOverlay('select-transform', event.target);
      } else if (this._viewportBaseActive && this._isSelectableUserObject(event?.target)) {
        this._setViewportBaseSuspended(true);
      }
    }

    if (tool === 'brush' || tool === 'eraser') {
      this._activeToolController?.pointerDown?.();
      return;
    }

    if (!['rect', 'circle', 'line', 'fill', 'text', 'gradient'].includes(tool)) return;

    const pt = this._canvasPoint(event);

    if (tool === 'fill') {
      this._activeToolController?.pointerDown(pt);
      return;
    }
    if (tool === 'text') {
      if (this._viewportBaseActive) this._setViewportBaseSuspended(true);
      this._activeToolController?.pointerDown(pt);
      return;
    }
    if (tool === 'gradient') {
      if (this._viewportBaseActive && !this._canKeepViewportBaseMountedForPreview('gradient')) {
        this._setViewportBaseSuspended(true);
      }
      this._activeToolController?.pointerDown(pt);
      return;
    }
    if (this._viewportBaseActive && !this._canKeepViewportBaseMountedForPreview(tool)) {
      this._setViewportBaseSuspended(true);
    }
    this._activeToolController?.pointerDown(pt);
  }

  _onMouseMove(event) {
    if (!this._isDrawing || !this._activeShape) return;
    const pt    = this._canvasPoint(event);
    const tool  = this.currentTool;

    if (tool === 'gradient' || tool === 'rect' || tool === 'circle' || tool === 'line') {
      this._activeToolController?.pointerMove(pt);
      return;
    }
  }

  _onMouseUp() {
    if (this.currentTool === 'select' && this._pendingPointerTransform && !this._pendingPointerTransform.didTransform) {
      this._schedulePendingPointerTransformClear(this._pendingPointerTransform.targetId);
    }

    if (this.currentTool === 'select') {
      if (this._isViewportBaseLiveOverlayActive('select-transform')) {
        if (!this._pendingPointerTransform || !this._pendingPointerTransform.didTransform) {
          this._restoreViewportBaseLiveOverlay({ render: false });
        }
      } else if (
        this._viewportBaseSuspended
        && !this._viewportBaseSuspendedForTextEditing
        && !this._viewportBaseSuspendedForKeyboardNudge
      ) {
        this._setViewportBaseSuspended(false);
      }
    }

    if (this.currentTool === 'brush' || this.currentTool === 'eraser') {
      this._activeToolController?.pointerUp?.();
      return;
    }

    if (!this._isDrawing || !this._activeShape) return;
    this._activeToolController?.pointerUp?.();
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
  async _doFill(x, y) {
    if (this._isExclusiveAsyncPaintMutationActive()) return false;

    const retainedTarget = this._getRetainedToolTarget();
    const retainedRasterFillContext = this._buildSupportedSharedRasterFillContext(retainedTarget, x, y);
    if (retainedRasterFillContext) {
      await this._fillRetainedRasterObject(retainedTarget, retainedRasterFillContext);
      return true;
    }

    if (this._isFillableObject(retainedTarget) && this._isPointInsideObject(retainedTarget, x, y)) {
      await this._fillSelectedObject(retainedTarget);
      return true;
    }

    const target = this._activeLayer;
    if (this._isValidPaintLayer(target)) {
      const sharedFillContext = this._buildSupportedSharedRasterFillContext(target, x, y);
      if (sharedFillContext) {
        await this._commitActiveLayerFill(target, sharedFillContext);
        return true;
      }

      const targetEl = target.getElement ? target.getElement() : target._element;
      if (!targetEl) return;

      const targetWidth  = Math.round(target.width * target.scaleX);
      const targetHeight = Math.round(target.height * target.scaleY);

      const px = Math.round(x);
      const py = Math.round(y);
      if (px < target.left || px >= target.left + targetWidth || py < target.top || py >= target.top + targetHeight) return;

      await this._commitActiveLayerFill(target, {
        targetEl,
        targetWidth,
        targetHeight,
        localX: Math.round(px - target.left),
        localY: Math.round(py - target.top),
        invalidationRect: {
          left: Math.round(Number(target.left) || 0),
          top: Math.round(Number(target.top) || 0),
          width: Math.max(1, Math.round(targetWidth)),
          height: Math.max(1, Math.round(targetHeight)),
        },
      });
      return true;
    }

    // No active layer — create a new layer filled with the primary colour
    const AW = this.ART_W;
    const AH = this.ART_H;
    const px = Math.round(x);
    const py = Math.round(y);
    if (px < 0 || px >= AW || py < 0 || py >= AH) return;

    await this._commitAutoCreatedLayerFill();
    return true;
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
    this._ensureObjectId(obj);

    const { result } = this._insertStandaloneLayerWithTransaction(obj, {
      label: 'Insert text layer',
      source: 'text-insert',
      preferredAnchor: this._activeLayer,
      onInserted: (insertedText) => {
        this._makeOnlyActiveInteractive(insertedText);
        this._beginViewportBaseTextEditing();
        insertedText.enterEditing();
        insertedText.selectAll();
        this.canvas.renderAll();
        this.setTool('select');
      },
    });

    if (!result) {
      this.canvas.renderAll();
      this.setTool('select');
    }
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
    if (!file || this._isExclusiveAsyncPaintMutationActive()) return false;
    const reader = new FileReader();
    reader.onload = (e) => {
      if (this._isExclusiveAsyncPaintMutationActive()) return;
      fabric.Image.fromURL(e.target.result, (img) => {
        if (this._isExclusiveAsyncPaintMutationActive()) return;
        if (img.width > 1200) img.scaleToWidth(600);
        const groupName = (this._activeLayer && this._activeLayer._groupName) || '';
        img.set({ left: 300, top: 300, name: file.name.replace(/\.[^.]+$/, ''), _groupName: groupName, perPixelTargetFind: true });
        this._ensureObjectId(img);
        this._insertStandaloneLayerWithTransaction(img, {
          label: 'Upload image layer',
          source: 'upload-image',
          preferredAnchor: this.canvas.getActiveObject() || this._activeLayer,
          onInserted: (insertedImage) => {
            this._makeOnlyActiveInteractive(insertedImage);
            this.canvas.renderAll();
            this.setTool('select');
          },
        });
      }, { crossOrigin: 'anonymous' });
    };
    reader.readAsDataURL(file);
    return true;
  }

  /* ── Template ─────────────────────────────────────────────── */
  _createTemplateImageFromDataUrl(dataUrl) {
    return new Promise((resolve) => {
      fabric.Image.fromURL(dataUrl, (img) => resolve(img), { crossOrigin: 'anonymous' });
    });
  }

  _getTemplateInsertIndex() {
    const objects = this.canvas.getObjects();
    const backgroundIndex = objects.findIndex((obj) => obj.name === '__background__');
    return backgroundIndex >= 0 ? backgroundIndex + 1 : 0;
  }

  _applyTemplateImage(img, opacity = 0.30) {
    const nextOpacity = Number.isFinite(Number(opacity))
      ? Math.max(0, Math.min(1, Number(opacity)))
      : 0.30;
    const previousSuspendHistory = this._suspendHistory;

    this._suspendHistory = true;
    try {
      this._templateOpacity = nextOpacity;

      if (this._templateObject) {
        this.canvas.remove(this._templateObject);
        this._templateObject = null;
      }

      img.set({
        left: 0,
        top: 0,
        selectable: false,
        evented: false,
        opacity: nextOpacity,
        name: '__template__',
      });
      img.scaleToWidth(this.ART_W);
      img.setCoords();

      this._templateObject = img;
      this.canvas.insertAt(img, this._getTemplateInsertIndex());
      this.canvas.getObjects().forEach((obj) => {
        if (obj._isGuide) obj.set('opacity', this._templateOpacity);
      });
      this.canvas.renderAll();
    } finally {
      this._suspendHistory = previousSuspendHistory;
    }
  }

  async loadTemplate(dataUrl, opacity = 0.30) {
    if (this._isExclusiveAsyncPaintMutationActive()) return false;

    this._flushPendingHistoryTransaction('boundary');
    const img = await this._createTemplateImageFromDataUrl(dataUrl);
    this._applyTemplateImage(img, opacity);
    this._saveState();
    if (this.onLayersChanged) this.onLayersChanged();
    return true;
  }

  async loadUploadedTemplate(dataUrl, options = {}) {
    const historyApi = window.LiveryLabHistory;
    const operationName = historyApi?.OPERATION_TYPES?.TEMPLATE_LOAD || 'document.template.load';
    const checkpointBoundary = historyApi?.CHECKPOINT_BOUNDARIES?.IMPORT_LOAD || 'import-load';
    const reversibility = historyApi?.REVERSIBILITY?.CHECKPOINT_ONLY || 'checkpoint-only';
    const requestedWidth = Number(options.width);
    const requestedHeight = Number(options.height);
    const nextWidth = Number.isFinite(requestedWidth) && requestedWidth > 0
      ? Math.round(requestedWidth)
      : this.ART_W;
    const nextHeight = Number.isFinite(requestedHeight) && requestedHeight > 0
      ? Math.round(requestedHeight)
      : this.ART_H;
    const opacity = Number.isFinite(Number(options.opacity))
      ? Math.max(0, Math.min(1, Number(options.opacity)))
      : 0.30;
    const replacesDimensions = nextWidth !== this.ART_W || nextHeight !== this.ART_H;

    const { result } = await this._runDocumentBoundaryCheckpoint({
      name: operationName,
      label: 'Load custom template',
      coalesceKey: `template-load:${nextWidth}x${nextHeight}:${replacesDimensions ? 'replace' : 'overlay'}`,
      reversibility,
      checkpointBoundary,
      renderInvalidation: {
        scope: 'viewport-and-export',
        kind: replacesDimensions ? 'document-replaced' : 'template-load',
      },
      checkpointMetadata: (result) => ({
        reason: replacesDimensions
          ? 'Custom non-PSD template load replaced the working document dimensions and seeded a new undo baseline.'
          : 'Custom non-PSD template load crossed the template boundary and seeded a new undo baseline.',
        source: options.sourceType || 'custom-template-upload',
        filename: typeof options.fileName === 'string' ? options.fileName : null,
        artboard: result?.artboard || { width: nextWidth, height: nextHeight },
        template: {
          reset: false,
          hasTemplateLayer: true,
          opacity,
        },
        documentReplacement: replacesDimensions,
        replacedDocumentDimensions: replacesDimensions,
      }),
      apply: async () => {
        const img = await this._createTemplateImageFromDataUrl(dataUrl);
        if (replacesDimensions) {
          this._resetArtboardCanvas(nextWidth, nextHeight);
        }
        this._applyTemplateImage(img, opacity);
        if (this.onLayersChanged) this.onLayersChanged();

        return {
          artboard: {
            width: this.ART_W,
            height: this.ART_H,
          },
          replacedDocumentDimensions: replacesDimensions,
        };
      },
    });

    return !!result;
  }


  setTemplateOpacity(v) {
    if (this._isExclusiveAsyncPaintMutationActive()) return false;

    const nextOpacity = Math.max(0, Math.min(1, Number(v)));
    if (!Number.isFinite(nextOpacity)) return false;

    const currentOpacity = Number.isFinite(Number(this._templateOpacity)) ? Number(this._templateOpacity) : 1;
    if (Math.abs(currentOpacity - nextOpacity) < 0.0001) return false;

    const historyApi = window.LiveryLabHistory;
    const operationName = historyApi?.OPERATION_TYPES?.TEMPLATE_OPACITY_SET || 'document.template.opacity.set';
    const checkpointBoundary = historyApi?.CHECKPOINT_BOUNDARIES?.TRANSACTION_IDLE || 'transaction-idle';
    const reversibility = historyApi?.REVERSIBILITY?.REVERSIBLE || 'reversible';

    if (this._historySession) {
      const transactionMeta = {
        name: operationName,
        label: 'Adjust template opacity',
        coalesceKey: 'template-opacity',
        reversibility,
        checkpointBoundary,
        beforeSnapshot: this._serializeCanvasState(),
        beforeSelectedObjectId: this.canvas.getActiveObject()?._id || null,
        beforeActiveLayerId: this.getActiveLayerId(),
        renderInvalidation: {
          scope: 'viewport-and-export',
          kind: 'template-opacity',
        },
      };

      if (!this._historySession.canExtendActiveTransaction(transactionMeta)) {
        this._flushPendingHistoryTransaction('boundary');
        if (this._isExclusiveAsyncPaintMutationActive()) return false;
        this._historySession.openTransaction(transactionMeta);
      }

      this._historySession.recordOperation({
        name: operationName,
        target: 'template-and-guides',
        opacity: nextOpacity,
        mode: 'slider',
      });
    } else {
      this._pendingTemplateOpacityCommit = true;
    }

    this._templateOpacity = nextOpacity;
    if (this._templateObject) this._templateObject.set('opacity', nextOpacity);
    this.canvas.getObjects().forEach((obj) => {
      if (obj._isGuide) obj.set('opacity', nextOpacity);
    });
    this.canvas.renderAll();
    this._scheduleViewportBaseSync();
    return true;
  }

  commitTemplateOpacityChange() {
    if (this._isExclusiveAsyncPaintMutationActive()) return false;

    if (this._historySession) {
      this._flushPendingHistoryTransaction('explicit');
      return true;
    }

    if (this._pendingTemplateOpacityCommit) {
      this._pendingTemplateOpacityCommit = false;
      this._saveState();
      return true;
    }

    return false;
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
    const historyApi = window.LiveryLabHistory;
    const operationName = historyApi?.OPERATION_TYPES?.PSD_IMPORT || 'io.psd.import.commit';
    const checkpointBoundary = historyApi?.CHECKPOINT_BOUNDARIES?.IMPORT_LOAD || 'import-load';
    const reversibility = historyApi?.REVERSIBILITY?.CHECKPOINT_ONLY || 'checkpoint-only';

    const { result } = await this._runDocumentBoundaryCheckpoint({
      name: operationName,
      label: 'Import PSD',
      coalesceKey: `psd-import:${psd.width}x${psd.height}`,
      reversibility,
      checkpointBoundary,
      renderInvalidation: {
        scope: 'viewport-and-export',
        kind: 'document-replaced',
      },
      checkpointMetadata: (result) => ({
        reason: 'PSD import replaced the current document and seeded a new undo baseline.',
        source: 'psd-import',
        artboard: result?.artboard || { width: psd.width, height: psd.height },
        importedLayerCount: result?.importedLayerCount || 0,
        template: {
          reset: true,
          hasTemplateLayer: false,
        },
        documentReplacement: true,
      }),
      apply: async () => {
        this._suspendHistory = true;
        try {
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
            `[${i}] ${ld.isGuide ? 'guide' : 'paint'} | group="${ld.groupName}" | "${ld.name}" | hasCanvas=${!!ld.canvas}`
          ));
          console.groupEnd();

          for (const ld of flat) {
            await this._addPsdLayer(ld);
          }

          const defaultLayer = this._getDefaultPaintLayer();
          if (defaultLayer) {
            this.canvas.setActiveObject(defaultLayer);
            this._activeLayer = defaultLayer;
          } else {
            this._activeLayer = null;
          }

          this.setZoom(this.currentZoom);
          this.canvas.renderAll();
          if (this.onLayersChanged) this.onLayersChanged();

          return {
            artboard: {
              width: psd.width,
              height: psd.height,
            },
            importedLayerCount: flat.length,
          };
        } finally {
          this._suspendHistory = false;
        }
      },
    });

    return !!result;
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

  _setLayerOpacityForObject(target, v) {
    if (this._isExclusiveAsyncPaintMutationActive()) return false;
    if (!this._isWorkspaceLayerOpacityEditableObject(target)) return false;

    const nextOpacity = Math.max(0, Math.min(1, Number(v)));
    if (!Number.isFinite(nextOpacity)) return false;

    const currentOpacity = Number.isFinite(Number(target.opacity)) ? Number(target.opacity) : 1;
    if (Math.abs(currentOpacity - nextOpacity) < 0.0001) return false;

    const historyApi = window.LiveryLabHistory;
    const operationName = historyApi?.OPERATION_TYPES?.LAYER_OPACITY_SET || 'document.layer.opacity.set';
    const checkpointBoundary = historyApi?.CHECKPOINT_BOUNDARIES?.TRANSACTION_IDLE || 'transaction-idle';
    const reversibility = historyApi?.REVERSIBILITY?.REVERSIBLE || 'reversible';
    const activeObject = this.canvas.getActiveObject() || null;
    const targetId = target._id || null;

    if (this._historySession) {
      const transactionMeta = {
        name: operationName,
        label: 'Adjust layer opacity',
        coalesceKey: `layer-opacity:${targetId || 'active-object'}`,
        reversibility,
        checkpointBoundary,
        beforeSnapshot: this._serializeCanvasState(),
        beforeSelectedObjectId: activeObject?._id || null,
        beforeActiveLayerId: this.getActiveLayerId(),
        renderInvalidation: {
          scope: 'viewport-and-export',
          kind: 'layer-opacity',
          layerIds: [targetId].filter(Boolean),
        },
      };

      if (!this._historySession.canExtendActiveTransaction(transactionMeta)) {
        this._flushPendingHistoryTransaction('boundary');
        if (this._isExclusiveAsyncPaintMutationActive()) return false;
        this._historySession.openTransaction(transactionMeta);
      }

      this._historySession.recordOperation({
        name: operationName,
        targetId,
        opacity: nextOpacity,
        mode: 'slider',
      });
    }

    target.set('opacity', nextOpacity);
    this.canvas.renderAll();
    this._scheduleViewportBaseSync();

    if (!this._historySession) {
      this._saveState();
    }

    if (this.onLayersChanged) this.onLayersChanged();
    if (this.onSelectionChanged) this.onSelectionChanged(activeObject || target);
    return true;
  }

  /** Sets the opacity of the currently selected layer in the panel. */
  setLayerOpacity(v) {
    return this._setLayerOpacityForObject(this.canvas.getActiveObject(), v);
  }

  setWorkspaceLayerOpacityById(projectedLayerId, v) {
    return this._setLayerOpacityForObject(this._resolveWorkspaceEditableObjectById(projectedLayerId), v);
  }

  deleteWorkspaceSelectionById(projectedLayerId) {
    return this._deleteLayerObject(this._resolveWorkspaceEditableObjectById(projectedLayerId), {
      label: 'Delete selected layer',
    });
  }

  setWorkspaceInspectorPrimaryColorById(projectedObjectId, hex) {
    return this._applyWorkspaceInspectorPropertyChangeById(projectedObjectId, {
      propertyKey: 'primaryColor',
      value: hex,
      label: 'Adjust object primary color',
      coalesce: true,
      mode: 'color-input',
      canApply: (target) => this._canApplyWorkspaceInspectorPrimaryColor(target),
      apply: (nextValue, target) => this._applyObjectPrimaryColor(target, nextValue),
    });
  }

  setWorkspaceInspectorSecondaryColorById(projectedObjectId, hex) {
    return this._applyWorkspaceInspectorPropertyChangeById(projectedObjectId, {
      propertyKey: 'secondaryColor',
      value: hex,
      label: 'Adjust object secondary color',
      coalesce: true,
      mode: 'color-input',
      canApply: (target) => this._canApplyWorkspaceInspectorSecondaryColor(target),
      apply: (nextValue, target) => this._applyObjectSecondaryColor(target, nextValue),
    });
  }

  setWorkspaceInspectorOpacityById(projectedObjectId, v) {
    return this._applyWorkspaceInspectorPropertyChangeById(projectedObjectId, {
      propertyKey: 'opacity',
      value: v,
      label: 'Adjust object opacity',
      coalesce: true,
      mode: 'slider',
      canApply: (target) => this._isSelectableUserObject(target),
      apply: (nextValue, target) => this._applyObjectOpacity(target, nextValue),
    });
  }

  setWorkspaceInspectorStrokeWidthById(projectedObjectId, w) {
    return this._applyWorkspaceInspectorPropertyChangeById(projectedObjectId, {
      propertyKey: 'strokeWidth',
      value: w,
      label: 'Adjust object stroke width',
      coalesce: true,
      mode: 'slider',
      canApply: (target) => this._canApplyWorkspaceInspectorStrokeWidth(target),
      apply: (nextValue, target) => this._applyObjectStrokeWidth(target, nextValue),
    });
  }

  setWorkspaceInspectorFontFamilyById(projectedObjectId, family) {
    return this._applyWorkspaceInspectorPropertyChangeById(projectedObjectId, {
      propertyKey: 'fontFamily',
      value: family,
      label: 'Change object font family',
      coalesce: false,
      mode: 'select',
      canApply: (target) => this._canApplyWorkspaceInspectorTextStyle(target),
      apply: (nextValue, target) => this._applyObjectTextStyle(target, { fontFamily: nextValue }),
    });
  }

  setWorkspaceInspectorFontSizeById(projectedObjectId, size) {
    return this._applyWorkspaceInspectorPropertyChangeById(projectedObjectId, {
      propertyKey: 'fontSize',
      value: size,
      label: 'Change object font size',
      coalesce: false,
      mode: 'number-input',
      canApply: (target) => this._canApplyWorkspaceInspectorTextStyle(target),
      apply: (nextValue, target) => this._applyObjectTextStyle(target, { fontSize: nextValue }),
    });
  }

  commitWorkspaceInspectorChange() {
    if (this._isExclusiveAsyncPaintMutationActive()) return false;

    if (this._historySession) {
      this._flushPendingHistoryTransaction('explicit');
      return true;
    }

    if (this._pendingWorkspaceInspectorCommit) {
      this._pendingWorkspaceInspectorCommit = false;
      this._saveState();
      return true;
    }

    return false;
  }

  commitLayerOpacityChange() {
    if (this._isExclusiveAsyncPaintMutationActive()) return false;

    if (this._historySession) {
      this._flushPendingHistoryTransaction('explicit');
      return true;
    }

    return false;
  }

  setStrokeWidth(w) {
    if (this._isExclusiveAsyncPaintMutationActive()) return false;

    this.strokeWidth = w;
    const active = this.canvas.getActiveObject();
    if (active && active.strokeWidth !== undefined) {
      active.set('strokeWidth', w);
      this.canvas.renderAll();
      this._scheduleViewportBaseSync();
    }

    return true;
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
    if (this._isExclusiveAsyncPaintMutationActive()) return false;

    this.backgroundColor = hex;
    this.createBackgroundLayer(hex);
    this.canvas.renderAll();
    this._saveState();
    return true;
  }

  setFont(family) {
    this.currentFont = family;
    return this.updateActiveTextStyle({ fontFamily: family });
  }

  setFontSize(size) {
    this.currentFontSize = size;
    return this.updateActiveTextStyle({ fontSize: size });
  }

  /* ── Active Object helpers ────────────────────────────────── */
  getActiveObject() { return this.canvas.getActiveObject() || null; }

  getTemplateOpacity() {
    return this._templateOpacity;
  }

  updateActiveColor(hex) {
    if (this._isExclusiveAsyncPaintMutationActive()) return false;

    const obj = this.canvas.getActiveObject();
    return this._applyObjectPrimaryColor(obj, hex);
  }

  _applyObjectPrimaryColor(obj, hex) {
    if (!obj) return false;

    if (obj.type === 'path' || obj.type === 'i-text' || obj.type === 'text') {
      obj.set('fill', hex);
      obj._primaryColor = hex;
    } else if (obj.type === 'rect' || obj.type === 'ellipse' || obj.type === 'circle') {
      if (this._isGradientObject(obj)) {
        const secondaryColor = typeof obj._secondaryColor === 'string' && obj._secondaryColor
          ? obj._secondaryColor
          : this.secondaryColor;
        obj.set('fill', this._createGradientFillForColors(obj.width || 1, obj.height || 1, hex, secondaryColor));
      } else {
        obj.set('fill', hex);
      }
      obj._primaryColor = hex;
    } else if (obj.type === 'line') {
      const secondaryColor = typeof obj._secondaryColor === 'string' && obj._secondaryColor
        ? obj._secondaryColor
        : this.secondaryColor;
      obj.set('stroke', this._createLineStrokeForColors(obj, hex, secondaryColor, obj.opacity));
      obj._primaryColor = hex;
    }
    this.canvas.renderAll();
    this._scheduleViewportBaseSync();
    return true;
  }

  updateActiveSecondaryColor(hex) {
    if (this._isExclusiveAsyncPaintMutationActive()) return false;

    const obj = this.canvas.getActiveObject();
    return this._applyObjectSecondaryColor(obj, hex);
  }

  _applyObjectSecondaryColor(obj, hex) {
    if (!obj) return false;

    if (obj.type === 'line') {
      const primaryColor = typeof obj._primaryColor === 'string' && obj._primaryColor
        ? obj._primaryColor
        : this.primaryColor;
      obj.set('stroke', this._createLineStrokeForColors(obj, primaryColor, hex, obj.opacity));
      obj._secondaryColor = hex;
    } else if (this._isGradientObject(obj)) {
      const primaryColor = typeof obj._primaryColor === 'string' && obj._primaryColor
        ? obj._primaryColor
        : this.primaryColor;
      obj.set('fill', this._createGradientFillForColors(obj.width || 1, obj.height || 1, primaryColor, hex));
      obj._secondaryColor = hex;
    } else if (obj.type === 'rect' || obj.type === 'ellipse' || obj.type === 'circle') {
      obj.set('stroke', hex);
      obj._secondaryColor = hex;
    }

    this.canvas.renderAll();
    this._scheduleViewportBaseSync();
    return true;
  }

  _applyObjectTextStyle(obj, changes = {}) {
    if (!obj || (obj.type !== 'i-text' && obj.type !== 'text')) return false;

    obj.set(changes);
    if (typeof obj.setCoords === 'function') obj.setCoords();
    this.canvas.renderAll();
    this._scheduleViewportBaseSync();
    return true;
  }

  updateActiveTextStyle(changes = {}) {
    if (this._isExclusiveAsyncPaintMutationActive()) return false;

    const obj = this.canvas.getActiveObject();
    return this._applyObjectTextStyle(obj, changes);
  }

  _applyObjectOpacity(obj, v) {
    if (!obj) return false;

    obj.set('opacity', v);
    this.canvas.renderAll();
    this._scheduleViewportBaseSync();
    return true;
  }

  updateActiveOpacity(v) {
    if (this._isExclusiveAsyncPaintMutationActive()) return false;

    const obj = this.canvas.getActiveObject();
    return this._applyObjectOpacity(obj, v);
  }

  _applyObjectStrokeWidth(obj, w) {
    if (!obj || obj.strokeWidth === undefined) return false;

    obj.set('strokeWidth', w);
    this.canvas.renderAll();
    this._scheduleViewportBaseSync();
    return true;
  }

  _deleteLayerObject(obj, options = {}) {
    if (!this._canDeleteLayerObject(obj)) return false;

    const beforeIndex = this.canvas.getObjects().indexOf(obj);
    if (beforeIndex < 0) return false;

    const historyApi = window.LiveryLabHistory;
    const operationName = historyApi?.OPERATION_TYPES?.LAYER_REMOVE || 'document.layer.remove';
    const checkpointBoundary = historyApi?.CHECKPOINT_BOUNDARIES?.PER_OPERATION || 'per-operation';
    const reversibility = historyApi?.REVERSIBILITY?.REVERSIBLE || 'reversible';
    const layerId = this._ensureObjectId(obj);
    const beforeSnapshot = this._serializeCanvasState();
    const beforeSelectedObjectId = this.canvas.getActiveObject()?._id || null;
    const beforeActiveLayerId = this.getActiveLayerId();

    const { result } = this._runDocumentTransaction({
      name: operationName,
      label: options.label || 'Delete layer',
      coalesceKey: `layer-remove:${layerId}`,
      reversibility,
      checkpointBoundary,
      renderInvalidation: {
        scope: 'viewport-and-export',
        kind: 'stack.changed',
        startIndex: beforeIndex,
        layerIds: [layerId],
      },
      operation: {
        name: operationName,
        layerId,
        beforeIndex,
        beforeSnapshot,
        beforeSelectedObjectId,
        beforeActiveLayerId,
      },
      apply: () => {
        const removedWasSelected = this.canvas.getActiveObjects().includes(obj)
          || this.canvas.getActiveObject() === obj;

        this.canvas.remove(obj);

        if (removedWasSelected) {
          this.canvas.discardActiveObject();
        }

        if (this._activeLayer === obj) {
          this._activeLayer = this._getDefaultPaintLayer();
        }

        if (this.currentTool === 'select') {
          this._syncObjectInteractivity(this.canvas.getActiveObject() || null);
        }

        this.canvas.renderAll();
        return { layerId, beforeIndex };
      },
    });

    if (!result) return false;

    if (this.onLayersChanged) this.onLayersChanged();
    if (this.onSelectionChanged) this.onSelectionChanged(this.canvas.getActiveObject() || null);
    return true;
  }

  deleteSelected() {
    if (this._isExclusiveAsyncPaintMutationActive()) return false;

    const active = this.canvas.getActiveObjects();
    if (!active.length) return false;
    const activeObject = this.canvas.getActiveObject();

    if (active.length === 1 && activeObject && active[0] === activeObject) {
      if (this._deleteLayerObject(activeObject, { label: 'Delete selected layer' })) {
        return true;
      }

      if (!this._canDeleteLayerObject(activeObject)) {
        return false;
      }
    }

    active.forEach(o => {
      if (this._canDeleteLayerObject(o)) this.canvas.remove(o);
    });
    this.canvas.discardActiveObject();
    this.canvas.renderAll();
    this._saveState();
    if (this.onLayersChanged) this.onLayersChanged();
    if (this.onSelectionChanged) this.onSelectionChanged(null);
    return true;
  }

  _duplicateLayerObject(target, options = {}) {
    if (this._isExclusiveAsyncPaintMutationActive()) return false;
    if (!this._isSelectableUserObject(target)) return false;

    // Suspend history capture across the async clone callback to prevent
    // intermediate snapshots from being pushed before the transaction commits.
    const previousSuspendHistory = this._suspendHistory;
    this._suspendHistory = true;

    // Safety fence: if Fabric's clone() never invokes the callback (e.g.
    // corrupted source object), restore _suspendHistory after 1 second to
    // avoid permanently freezing the undo/redo system.
    let cloneCallbackFired = false;
    const safetyTimer = setTimeout(() => {
      if (!cloneCallbackFired) {
        this._suspendHistory = previousSuspendHistory;
      }
    }, 1000);

    target.clone((cloned) => {
      cloneCallbackFired = true;
      clearTimeout(safetyTimer);
      if (this._isExclusiveAsyncPaintMutationActive()) {
        this._suspendHistory = previousSuspendHistory;
        return;
      }

      cloned.set({
        left: (target.left || 0) + 30,
        top: (target.top || 0) + 30,
        _groupName: cloned._groupName || target._groupName || '',
      });
      if (cloned.name) cloned.name = cloned.name + ' copy';
      this._ensureObjectId(cloned);
      try {
        this._insertStandaloneLayerWithTransaction(cloned, {
          label: options.label || 'Duplicate selected layer',
          source: options.source || 'duplicate-selected',
          preferredAnchor: target,
          onInserted: (insertedClone) => {
            this._makeOnlyActiveInteractive(insertedClone);
            this.canvas.renderAll();
          },
        });
      } finally {
        this._suspendHistory = previousSuspendHistory;
      }
    });

    return true;
  }

  duplicateSelected() {
    return this._duplicateLayerObject(this.canvas.getActiveObject(), {
      label: 'Duplicate selected layer',
      source: 'duplicate-selected',
    });
  }

  duplicateWorkspaceSelectionById(projectedLayerId) {
    return this._duplicateLayerObject(this._resolveWorkspaceEditableObjectById(projectedLayerId), {
      label: 'Duplicate selected layer',
      source: 'duplicate-selected',
    });
  }

  nudgeSelected(dx, dy) {
    if (this._isExclusiveAsyncPaintMutationActive()) return false;

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
        if (this._isExclusiveAsyncPaintMutationActive()) return false;
        this._historySession.openTransaction(transactionMeta);
      }
    }

    this._beginViewportBaseKeyboardManipulation(active);

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
      this._endViewportBaseKeyboardManipulation();
    }

    if (this.onLayersChanged) this.onLayersChanged();
    if (this.onSelectionChanged) this.onSelectionChanged(active);
    return true;
  }

  getHistoryDebugState() {
    return this._historySession ? this._historySession.getDebugState() : null;
  }

  _reorderLayerObject(activeObject, direction = 'forward', options = {}) {
    if (!activeObject) return false;
    if (direction === 'backward' && activeObject.name === '__template__') return false;
    if (options.requireSelectable && !this._isSelectableUserObject(activeObject)) return false;

    const beforeIndex = this.canvas.getObjects().indexOf(activeObject);
    if (beforeIndex < 0) return false;

    const historyApi = window.LiveryLabHistory;
    const operationName = historyApi?.OPERATION_TYPES?.LAYER_ORDER_SET || 'document.layer.order.set';
    const checkpointBoundary = historyApi?.CHECKPOINT_BOUNDARIES?.PER_OPERATION || 'per-operation';
    const reversibility = historyApi?.REVERSIBILITY?.REVERSIBLE || 'reversible';
    const layerId = this._ensureObjectId(activeObject);
    const reorderLabel = direction === 'forward' ? 'Bring layer forward' : 'Send layer backward';
    const invalidationStartIndex = direction === 'forward'
      ? beforeIndex
      : Math.max(0, beforeIndex - 1);

    const { result } = this._runDocumentTransaction({
      name: operationName,
      label: reorderLabel,
      coalesceKey: `layer-order:${layerId}`,
      reversibility,
      checkpointBoundary,
      renderInvalidation: {
        scope: 'viewport-and-export',
        kind: 'stack.changed',
        startIndex: invalidationStartIndex,
        layerIds: [layerId],
      },
      operation: (transactionResult) => {
        if (!transactionResult || transactionResult.afterIndex === transactionResult.beforeIndex) {
          return null;
        }

        return {
          name: operationName,
          layerId,
          direction,
          fromIndex: transactionResult.beforeIndex,
          toIndex: transactionResult.afterIndex,
        };
      },
      apply: () => {
        if (direction === 'forward') {
          this.canvas.bringForward(activeObject);
        } else {
          this.canvas.sendBackwards(activeObject);
        }

        const afterIndex = this.canvas.getObjects().indexOf(activeObject);
        if (afterIndex < 0 || afterIndex === beforeIndex) {
          return false;
        }

        this.canvas.renderAll();
        return { beforeIndex, afterIndex };
      },
    });

    if (!result) return false;

    if (this.onLayersChanged) this.onLayersChanged();
    return true;
  }

  _reorderActiveObject(direction = 'forward') {
    return this._reorderLayerObject(this.canvas.getActiveObject(), direction);
  }

  bringForward() {
    return this._reorderActiveObject('forward');
  }

  sendBackward() {
    return this._reorderActiveObject('backward');
  }

  reorderWorkspaceLayerById(projectedLayerId, direction = 'forward') {
    const obj = this._getObjectById(projectedLayerId);
    return this._reorderLayerObject(obj, direction, { requireSelectable: true });
  }

  bringWorkspaceLayerForwardById(projectedLayerId) {
    return this.reorderWorkspaceLayerById(projectedLayerId, 'forward');
  }

  sendWorkspaceLayerBackwardById(projectedLayerId) {
    return this.reorderWorkspaceLayerById(projectedLayerId, 'backward');
  }

  /* ── Layers API (used by app.js to build the layers panel) ── */

  /**
   * Return a list of layer descriptors (bottom → top so index 0 is background).
   * We reverse for a "top = front" visual convention in the UI.
   */
  _getCanvasDerivedLayers() {
    const objects = this.canvas.getObjects();
    return objects.map((obj, i) => ({
      index:     i,
      id:        this._ensureObjectId(obj),
      name:      obj.name || obj.type || 'Layer ' + (i + 1),
      type:      obj.type,
      visible:   obj.visible !== false,
      locked:    obj.name === '__template__' || obj.name === '__background__' || !!obj._isGuide || !!obj._isSpecMap || !!obj.locked,
      isGuide:   !!obj._isGuide,
      isSpecMap: !!obj._isSpecMap,
      groupName: obj._groupName || '',
      selected:  obj === this.canvas.getActiveObject(),
      opacity:   (obj.opacity === undefined || obj.opacity === null) ? 1 : obj.opacity,
      actions: this._getWorkspaceLayerRowActionState(obj),
    })).reverse(); // Top visual layer first
  }

  _getMirrorBackedLayers() {
    const documentMirror = this.getLiveDocumentMirror({ includeSession: false });
    const durableLayers = Array.isArray(documentMirror?.layers) ? documentMirror.layers : null;
    const objects = this.canvas.getObjects();
    if (!durableLayers || !this._isLiveDocumentMirrorAlignedWithCanvas(documentMirror)) {
      return null;
    }

    const activeObject = this.canvas.getActiveObject() || null;
    const projectedLayers = [];

    for (let index = 0; index < durableLayers.length; index += 1) {
      const layerRecord = durableLayers[index];
      const obj = objects[index];
      const layerId = typeof layerRecord?.id === 'string' && layerRecord.id ? layerRecord.id : null;
      if (!layerId || !obj || this._ensureObjectId(obj) !== layerId) {
        return null;
      }

      projectedLayers.push({
        index,
        id: layerId,
        name: layerRecord.name || obj.name || obj.type || 'Layer ' + (index + 1),
        type: obj.type,
        visible: obj.visible !== false,
        locked: !!layerRecord.locked,
        isGuide: layerRecord.role === 'guide',
        isSpecMap: layerRecord.role === 'spec-map',
        groupName: layerRecord.groupName || '',
        selected: obj === activeObject,
        opacity: (obj.opacity === undefined || obj.opacity === null) ? 1 : obj.opacity,
        actions: this._getWorkspaceLayerRowActionState(obj),
      });
    }

    return projectedLayers.reverse();
  }

  getLayers() {
    return this._getMirrorBackedLayers() || this._getCanvasDerivedLayers();
  }

  _resolveWorkspaceLayerSelectionTarget(projectedLayerId) {
    return this._resolveWorkspaceEditableObjectById(projectedLayerId);
  }

  selectWorkspaceLayerById(projectedLayerId) {
    const obj = this._resolveWorkspaceLayerSelectionTarget(projectedLayerId);
    if (!obj) return false;

    if (this._isValidPaintLayer(obj)) {
      this._activeLayer = obj;
    }

    this._toolTargetObject = obj;

    // Route layer-panel selection through the normal tool transition so
    // mounted-base suspension and overlay bookkeeping stays consistent.
    this.setTool('select');
    this._makeOnlyActiveInteractive(obj);
    this._syncViewportBaseSuspensionReasons();

    if (this.onSelectionChanged) this.onSelectionChanged(obj);
    return true;
  }

  selectLayerByIndex(visualIndex) {
    const layer = this.getLayers()[visualIndex] || null;
    return this.selectWorkspaceLayerById(layer?.id || null);
  }

  toggleWorkspaceLayerVisibilityById(projectedLayerId) {
    const obj = this._getObjectById(projectedLayerId);
    if (!obj) return false;
    // Block spec map layers from being toggled visible
    if (obj._isSpecMap) return false;
    const historyApi = window.LiveryLabHistory;
    const operationName = historyApi?.OPERATION_TYPES?.LAYER_VISIBILITY_SET || 'document.layer.visibility.set';
    const checkpointBoundary = historyApi?.CHECKPOINT_BOUNDARIES?.PER_OPERATION || 'per-operation';
    const reversibility = historyApi?.REVERSIBILITY?.REVERSIBLE || 'reversible';
    const layerId = this._ensureObjectId(obj);
    const nextVisible = !obj.visible;
    this._runDocumentTransaction({
      name: operationName,
      label: 'Toggle layer visibility',
      coalesceKey: `layer-visibility:${layerId}`,
      reversibility,
      checkpointBoundary,
      renderInvalidation: {
        scope: 'viewport-and-export',
        kind: 'layer-visibility',
        layerIds: [layerId],
      },
      operation: {
        name: operationName,
        layerId,
        nextVisible,
      },
      apply: () => {
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
        return true;
      },
    });
    if (this.onLayersChanged) this.onLayersChanged();
    if (this.onSelectionChanged) this.onSelectionChanged(this.canvas.getActiveObject() || null);
    return true;
  }

  toggleLayerVisibility(visualIndex) {
    const layer = this.getLayers()[visualIndex] || null;
    return this.toggleWorkspaceLayerVisibilityById(layer?.id || null);
  }

  deleteWorkspaceLayerById(projectedLayerId) {
    const obj = this._getObjectById(projectedLayerId);
    return this._deleteLayerObject(obj, { label: 'Delete layer from panel' });
  }

  deleteLayerByIndex(visualIndex) {
    const layer = this.getLayers()[visualIndex] || null;
    return this.deleteWorkspaceLayerById(layer?.id || null);
  }

  /* ── Export / Serialization ───────────────────────────────── */

  /**
   * Render all non-template layers to a flat canvas at the requested
   * output resolution and return the ImageData.
   *
  * @param {number} outputSize  1024 or 2048
   * @returns {ImageData}
   */
  async getExportImageData(outputSize = 2048) {
    const renderState = await this.getExportRenderState(outputSize);
    return renderState.imageData;
  }

  async getExportRenderState(outputSize = 2048) {
    const composed = this._composeSharedRasterImageData(outputSize, outputSize, 'export');
    if (composed.supported) {
      return {
        ...composed,
        outputSize,
        fallbackUsed: false,
        fallbackReason: null,
        renderSource: 'shared-raster-compositor',
      };
    }

    const imageData = await this._getLegacyExportImageData(outputSize);
    return {
      supported: false,
      outputSize,
      fallbackUsed: true,
      fallbackReason: composed.fallbackReason || composed.reason || 'unsupported-document',
      reason: composed.reason || composed.fallbackReason || 'unsupported-document',
      unsupportedLayerIds: composed.unsupportedLayerIds || [],
      unsupportedLayers: composed.unsupportedLayers || [],
      includedLayerIds: composed.includedLayerIds || [],
      policy: composed.policy || window.LiveryLabRender?.createPolicy?.('export') || null,
      artboardWidth: composed.artboardWidth || this.ART_W,
      artboardHeight: composed.artboardHeight || this.ART_H,
      targetWidth: outputSize,
      targetHeight: outputSize,
      renderSource: 'legacy-fabric-scene',
      canvas: null,
      imageData,
    };
  }

  getViewportBaseRenderState(options = {}) {
    const { outputWidth, outputHeight } = this._resolveViewportBaseTargetDimensions(options);
    const composed = this._composeSharedRasterImageData(
      outputWidth,
      outputHeight,
      'viewport',
      options.targetCanvas || null
    );

    if (!composed.supported) {
      return {
        supported: false,
        reason: composed.reason,
        fallbackReason: composed.fallbackReason || composed.reason,
        unsupportedLayerIds: composed.unsupportedLayerIds || [],
        unsupportedLayers: composed.unsupportedLayers || [],
        includedLayerIds: composed.includedLayerIds || [],
        composedLayerIds: [],
        policy: composed.policy || window.LiveryLabRender?.createPolicy?.('viewport') || null,
        artboardWidth: composed.artboardWidth || this.ART_W,
        artboardHeight: composed.artboardHeight || this.ART_H,
        targetWidth: outputWidth,
        targetHeight: outputHeight,
        zoom: this.currentZoom,
        renderSource: 'shared-raster-compositor',
        canvas: null,
        imageData: null,
      };
    }

    return {
      ...composed,
      baseLayerIds: Array.isArray(composed.composedLayerIds) ? composed.composedLayerIds.slice() : [],
      supportedLayerIds: Array.isArray(composed.includedLayerIds) ? composed.includedLayerIds.slice() : [],
      zoom: this.currentZoom,
      renderSource: 'shared-raster-compositor',
    };
  }

  async getViewportCompositeImageData(outputWidth = this.ART_W, outputHeight = this.ART_H) {
    const baseRender = this.getViewportBaseRenderState({ outputWidth, outputHeight });
    if (baseRender.supported) {
      return baseRender.imageData;
    }

    return null;
  }

  saveProject() {
    if (this._isExclusiveAsyncPaintMutationActive()) return false;

    this._flushPendingHistoryTransaction('save-project');
    const payload = window.LiveryLabDocument
      ? window.LiveryLabDocument.createDocumentSnapshot(this)
      : this._serializeCanvasForDocument();
    const json = JSON.stringify(payload, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    triggerDownload(blob, 'livery-lab-project.json');
    return true;
  }

  loadProject(file) {
    if (this._isExclusiveAsyncPaintMutationActive()) return false;

    const reader = new FileReader();
    reader.onload = async (e) => {
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

        const historyApi = window.LiveryLabHistory;
        const operationName = historyApi?.OPERATION_TYPES?.DOCUMENT_LOAD || 'io.project.load.commit';
        const checkpointBoundary = historyApi?.CHECKPOINT_BOUNDARIES?.DOCUMENT_LOAD || 'document-load';
        const reversibility = historyApi?.REVERSIBILITY?.CHECKPOINT_ONLY || 'checkpoint-only';
        const previousCanvasState = this._serializeCanvasState();
        const previousSelectedObjectId = this.canvas.getActiveObject()?._id || null;
        const previousActiveLayerId = this.getActiveLayerId();
        const previousDocumentCar = this.getDocumentCar();
        const previousBackgroundColor = this.backgroundColor;
        const previousTemplateOpacity = this._templateOpacity;

        const { result } = await this._runDocumentBoundaryCheckpoint({
          name: operationName,
          label: 'Load project',
          coalesceKey: `project-load:${normalized.document.version || 'unknown'}`,
          reversibility,
          checkpointBoundary,
          renderInvalidation: {
            scope: 'viewport-and-export',
            kind: 'document-replaced',
          },
          checkpointMetadata: {
            reason: 'Project load replaced the current document and seeded a new undo baseline.',
            loadSource: normalized.migration?.source || 'editor-document',
            migrationApplied: Array.isArray(normalized.migration?.applied) ? normalized.migration.applied.slice() : [],
            loadedDocumentVersion: normalized.document.version || null,
            artboard: {
              width: normalized.document.artboard?.width || this.ART_W,
              height: normalized.document.artboard?.height || this.ART_H,
            },
            template: {
              reset: true,
              hasTemplateLayer: !!normalized.document.template?.hasTemplateLayer,
              opacity: typeof normalized.document.template?.opacity === 'number'
                ? normalized.document.template.opacity
                : null,
            },
            documentReplacement: true,
          },
          apply: () => new Promise((resolve, reject) => {
            this.setDocumentCar(normalized.document.car || null);
            if (typeof normalized.document.artboard?.backgroundColor === 'string') {
              this.backgroundColor = normalized.document.artboard.backgroundColor;
            }
            if (typeof normalized.document.template?.opacity === 'number') {
              this._templateOpacity = normalized.document.template.opacity;
            }

            this._loadState(JSON.stringify(fabricCanvas), () => {
              resolve({
                artboard: {
                  width: normalized.document.artboard?.width || this.ART_W,
                  height: normalized.document.artboard?.height || this.ART_H,
                },
              });
            }, (error) => {
              const rollbackPreviousDocument = () => {
                this.setDocumentCar(previousDocumentCar);
                this.backgroundColor = previousBackgroundColor;
                this._templateOpacity = previousTemplateOpacity;
                this._resyncLiveDocumentMirror({ includeSession: true });
                reject(error);
              };

              this._loadState(previousCanvasState, () => {
                rollbackPreviousDocument();
              }, () => {
                rollbackPreviousDocument();
              }, {
                selectedObjectId: previousSelectedObjectId,
                activeLayerId: previousActiveLayerId,
              });
            });
          }),
        });

        if (!result) {
          return;
        }

        this._resyncLiveDocumentMirror({ includeSession: true });

        if (this.onDocumentLoaded) {
          const restoredDocument = this.getLiveDocumentMirror({
            includeSession: true,
            clone: true,
            fallbackToRuntime: true,
          }) || normalized.document;
          this.onDocumentLoaded({
            ...normalized,
            document: restoredDocument,
          });
        }

        if (typeof showToast === 'function') {
          const isLegacyMigration = normalized.migration?.source === 'legacy-fabric-json';
          const message = isLegacyMigration
            ? `Legacy project loaded and migrated to EditorDocument v${normalized.document.version}.`
            : `Project loaded (EditorDocument v${normalized.document.version}).`;
          showToast(message, 'success');
        }
      } catch (error) {
        if (typeof showToast === 'function') {
          showToast('Could not load project: ' + error.message, 'error');
        }
        if (typeof this.onDocumentLoadFailed === 'function') {
          const restoredDocument = this.getLiveDocumentMirror({
            includeSession: true,
            clone: true,
            fallbackToRuntime: true,
          });
          this.onDocumentLoadFailed({
            error,
            document: restoredDocument,
          });
        }
      }
    };
    reader.readAsText(file);
    return true;
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
