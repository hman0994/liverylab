(function (global) {
  const EDITOR_DOCUMENT_SCHEMA = 'liverylab.editor-document';
  const EDITOR_DOCUMENT_KIND = 'editor-document';
  const CURRENT_EDITOR_DOCUMENT_VERSION = 1;

  function cloneJson(value) {
    return value == null ? value : JSON.parse(JSON.stringify(value));
  }

  function asNumber(value, fallback) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }

  function normalizeCarRecord(car) {
    if (!car || typeof car !== 'object') return null;

    return {
      name: typeof car.name === 'string' ? car.name : '',
      file: typeof car.file === 'string' ? car.file : '',
      folder: typeof car.folder === 'string' ? car.folder : '',
      width: Number.isFinite(Number(car.width)) ? Number(car.width) : null,
      height: Number.isFinite(Number(car.height)) ? Number(car.height) : null,
    };
  }

  function normalizeLayerRecord(layer, index) {
    if (!layer || typeof layer !== 'object') return null;

    return {
      id: typeof layer.id === 'string' && layer.id ? layer.id : `legacy-layer-${index + 1}`,
      name: typeof layer.name === 'string' && layer.name ? layer.name : `Layer ${index + 1}`,
      layerType: typeof layer.layerType === 'string' && layer.layerType ? layer.layerType : 'unknown-layer',
      role: typeof layer.role === 'string' && layer.role ? layer.role : 'content',
      visible: layer.visible !== false,
      locked: !!layer.locked,
      opacity: Number.isFinite(Number(layer.opacity)) ? Number(layer.opacity) : 1,
      blendMode: typeof layer.blendMode === 'string' && layer.blendMode ? layer.blendMode : 'source-over',
      groupName: typeof layer.groupName === 'string' ? layer.groupName : '',
      transform: {
        x: asNumber(layer.transform?.x, 0),
        y: asNumber(layer.transform?.y, 0),
        scaleX: asNumber(layer.transform?.scaleX, 1),
        scaleY: asNumber(layer.transform?.scaleY, 1),
        angle: asNumber(layer.transform?.angle, 0),
      },
      bounds: {
        width: asNumber(layer.bounds?.width, 0),
        height: asNumber(layer.bounds?.height, 0),
      },
      payloadRef: {
        adapter: typeof layer.payloadRef?.adapter === 'string' && layer.payloadRef.adapter
          ? layer.payloadRef.adapter
          : 'fabric-canvas-json',
        objectId: typeof layer.payloadRef?.objectId === 'string' ? layer.payloadRef.objectId : null,
      },
    };
  }

  function normalizeSessionSnapshot(session) {
    return {
      selection: {
        selectedObjectId: typeof session?.selection?.selectedObjectId === 'string'
          ? session.selection.selectedObjectId
          : null,
        activeLayerId: typeof session?.selection?.activeLayerId === 'string'
          ? session.selection.activeLayerId
          : null,
      },
      viewport: {
        zoom: asNumber(session?.viewport?.zoom, 1),
      },
    };
  }

  function getCanvasObjects(canvasState) {
    return Array.isArray(canvasState?.objects) ? canvasState.objects : [];
  }

  function getBackgroundColor(canvasState) {
    const backgroundObject = getCanvasObjects(canvasState).find((object) => object?.name === '__background__');
    return typeof backgroundObject?.fill === 'string' ? backgroundObject.fill : '#ffffff';
  }

  function getTemplateOpacity(canvasState) {
    const templateObject = getCanvasObjects(canvasState).find((object) => object?.name === '__template__');
    return typeof templateObject?.opacity === 'number' ? templateObject.opacity : 1;
  }

  function getLayerRole(fabricObject) {
    if (fabricObject?.name === '__background__') return 'background';
    if (fabricObject?.name === '__template__') return 'template';
    if (fabricObject?._isGuide) return 'guide';
    if (fabricObject?._isSpecMap) return 'spec-map';
    return 'content';
  }

  function getLayerType(fabricObject) {
    switch (fabricObject?.type) {
      case 'image':
        return getLayerRole(fabricObject) === 'content' ? 'raster-layer' : 'overlay-image';
      case 'i-text':
      case 'text':
        return 'text-layer';
      case 'rect':
        return 'shape-rect';
      case 'ellipse':
      case 'circle':
        return 'shape-ellipse';
      case 'line':
        return 'shape-line';
      case 'path':
        return 'path-layer';
      default:
        return fabricObject?.type || 'unknown-layer';
    }
  }

  function createLayerRecord(fabricObject, index) {
    return {
      id: fabricObject?._id || `legacy-layer-${index + 1}`,
      name: fabricObject?.name || fabricObject?.type || `Layer ${index + 1}`,
      layerType: getLayerType(fabricObject),
      role: getLayerRole(fabricObject),
      visible: fabricObject?.visible !== false,
      locked: !!(
        fabricObject?.locked ||
        fabricObject?._isGuide ||
        fabricObject?._isSpecMap ||
        fabricObject?.name === '__template__' ||
        fabricObject?.name === '__background__'
      ),
      opacity: typeof fabricObject?.opacity === 'number' ? fabricObject.opacity : 1,
      blendMode: fabricObject?.globalCompositeOperation || 'source-over',
      groupName: fabricObject?._groupName || '',
      transform: {
        x: asNumber(fabricObject?.left, 0),
        y: asNumber(fabricObject?.top, 0),
        scaleX: asNumber(fabricObject?.scaleX, 1),
        scaleY: asNumber(fabricObject?.scaleY, 1),
        angle: asNumber(fabricObject?.angle, 0),
      },
      bounds: {
        width: asNumber(fabricObject?.width, 0),
        height: asNumber(fabricObject?.height, 0),
      },
      payloadRef: {
        adapter: 'fabric-canvas-json',
        objectId: fabricObject?._id || null,
      },
    };
  }

  function createSessionSnapshot(editor) {
    if (!editor) return null;

    return normalizeSessionSnapshot({
      selection: {
        selectedObjectId: editor.getActiveObject()?._id || null,
        activeLayerId: typeof editor.getActiveLayerId === 'function' ? editor.getActiveLayerId() : null,
      },
      viewport: {
        zoom: asNumber(editor.currentZoom, 1),
      },
    });
  }

  function finalizeDocumentSnapshot(documentPayload, editor, canvasState, options = {}) {
    const normalized = ensureDocumentDefaults(documentPayload);
    normalized.metadata = {
      ...normalized.metadata,
      savedAt: new Date().toISOString(),
      source: normalized.metadata?.source || 'Livery Lab',
    };
    normalized.bridge = normalized.bridge || {};
    normalized.bridge.fabricCanvas = cloneJson(canvasState);

    if (options.includeSession) {
      normalized.session = normalizeSessionSnapshot(normalized.session || createSessionSnapshot(editor));
    } else if (Object.prototype.hasOwnProperty.call(normalized, 'session')) {
      delete normalized.session;
    }

    return normalized;
  }

  function createDocumentSnapshotFromCanvasState(editor, canvasState, options = {}) {
    if (!canvasState || typeof canvasState !== 'object') {
      throw new Error('Editor document snapshot requires a serializable canvas state.');
    }

    const documentPayload = {
      schema: EDITOR_DOCUMENT_SCHEMA,
      kind: EDITOR_DOCUMENT_KIND,
      version: CURRENT_EDITOR_DOCUMENT_VERSION,
      metadata: {
        source: 'Livery Lab',
      },
      artboard: {
        width: asNumber(editor.ART_W, canvasState.width || 2048),
        height: asNumber(editor.ART_H, canvasState.height || 2048),
        backgroundColor: typeof editor.backgroundColor === 'string'
          ? editor.backgroundColor
          : getBackgroundColor(canvasState),
      },
      car: normalizeCarRecord(typeof editor.getDocumentCar === 'function' ? editor.getDocumentCar() : null),
      template: {
        opacity: typeof editor._templateOpacity === 'number'
          ? editor._templateOpacity
          : getTemplateOpacity(canvasState),
        hasTemplateLayer: getCanvasObjects(canvasState).some((object) => object?.name === '__template__'),
      },
      layers: getCanvasObjects(canvasState).map(createLayerRecord),
      bridge: {
        fabricCanvas: cloneJson(canvasState),
      },
    };

    return finalizeDocumentSnapshot(documentPayload, editor, canvasState, options);
  }

  function createDocumentSnapshot(editor, options = {}) {
    const canvasState = typeof editor?._serializeCanvasForDocument === 'function'
      ? editor._serializeCanvasForDocument()
      : null;

    if (!canvasState) {
      throw new Error('Editor document snapshot requires a serializable canvas state.');
    }

    const preferLiveMirror = options.preferLiveMirror !== false;
    const liveDocument = preferLiveMirror && typeof editor?.getLiveDocumentMirror === 'function'
      ? editor.getLiveDocumentMirror({
          includeSession: true,
          clone: true,
          fallbackToRuntime: false,
        })
      : null;

    if (isEditorDocumentPayload(liveDocument)) {
      return finalizeDocumentSnapshot(liveDocument, editor, canvasState, options);
    }

    const snapshot = createDocumentSnapshotFromCanvasState(editor, canvasState, options);

    // When the full mirror is layer-misaligned but still present, prefer its
    // mirror-authoritative metadata fields (car, artboard, template) over the
    // Fabric-derived values.  These fields are maintained independently of
    // layer records and remain valid even when the layer stack has drifted.
    if (preferLiveMirror && typeof editor?._liveDocumentMirror === 'object' && editor._liveDocumentMirror) {
      const mirrorMeta = editor._liveDocumentMirror;
      if (mirrorMeta.car && typeof mirrorMeta.car === 'object') {
        snapshot.car = normalizeCarRecord(mirrorMeta.car);
      }
      if (mirrorMeta.artboard && typeof mirrorMeta.artboard === 'object') {
        if (Number.isFinite(mirrorMeta.artboard.width)) {
          snapshot.artboard.width = mirrorMeta.artboard.width;
        }
        if (Number.isFinite(mirrorMeta.artboard.height)) {
          snapshot.artboard.height = mirrorMeta.artboard.height;
        }
        if (typeof mirrorMeta.artboard.backgroundColor === 'string') {
          snapshot.artboard.backgroundColor = mirrorMeta.artboard.backgroundColor;
        }
      }
      if (mirrorMeta.template && typeof mirrorMeta.template === 'object') {
        if (typeof mirrorMeta.template.opacity === 'number') {
          snapshot.template.opacity = mirrorMeta.template.opacity;
        }
        if (typeof mirrorMeta.template.hasTemplateLayer === 'boolean') {
          snapshot.template.hasTemplateLayer = mirrorMeta.template.hasTemplateLayer;
        }
      }
    }

    return snapshot;
  }

  function ensureDocumentDefaults(documentPayload) {
    const normalized = cloneJson(documentPayload);
    normalized.schema = EDITOR_DOCUMENT_SCHEMA;
    normalized.kind = EDITOR_DOCUMENT_KIND;
    normalized.version = CURRENT_EDITOR_DOCUMENT_VERSION;
    normalized.metadata = normalized.metadata || {};
    normalized.artboard = normalized.artboard || {};
    normalized.bridge = normalized.bridge || {};

    const canvasState = normalized.bridge.fabricCanvas || {};

    normalized.artboard.width = asNumber(normalized.artboard.width, asNumber(canvasState.width, 2048));
    normalized.artboard.height = asNumber(normalized.artboard.height, asNumber(canvasState.height, 2048));
    normalized.artboard.backgroundColor = typeof normalized.artboard.backgroundColor === 'string'
      ? normalized.artboard.backgroundColor
      : getBackgroundColor(canvasState);

    normalized.car = normalizeCarRecord(normalized.car);
    normalized.template = normalized.template || {};
    normalized.template.opacity = typeof normalized.template.opacity === 'number'
      ? normalized.template.opacity
      : getTemplateOpacity(canvasState);
    normalized.template.hasTemplateLayer = !!normalized.template.hasTemplateLayer || getCanvasObjects(canvasState).some((object) => object?.name === '__template__');
    normalized.layers = Array.isArray(normalized.layers)
      ? normalized.layers.map(normalizeLayerRecord).filter(Boolean)
      : [];
    if (!normalized.layers.length) {
      normalized.layers = getCanvasObjects(canvasState).map(createLayerRecord);
    }

    if (Object.prototype.hasOwnProperty.call(normalized, 'session')) {
      normalized.session = normalizeSessionSnapshot(normalized.session);
    }

    return normalized;
  }

  function isEditorDocumentPayload(payload) {
    return !!payload && typeof payload === 'object' && payload.schema === EDITOR_DOCUMENT_SCHEMA;
  }

  function isLegacyFabricProject(payload) {
    return !!payload && typeof payload === 'object' && Array.isArray(payload.objects);
  }

  function migrateLegacyFabricProject(payload) {
    const canvasState = cloneJson(payload);
    const migrated = ensureDocumentDefaults({
      schema: EDITOR_DOCUMENT_SCHEMA,
      kind: EDITOR_DOCUMENT_KIND,
      version: CURRENT_EDITOR_DOCUMENT_VERSION,
      metadata: {
        savedAt: new Date().toISOString(),
        source: 'Livery Lab',
        migratedFrom: {
          format: 'fabric-canvas-json',
          version: canvasState?.version || null,
        },
      },
      artboard: {
        width: asNumber(canvasState?.width, 2048),
        height: asNumber(canvasState?.height, 2048),
        backgroundColor: getBackgroundColor(canvasState),
      },
      car: null,
      template: {
        opacity: getTemplateOpacity(canvasState),
        hasTemplateLayer: getCanvasObjects(canvasState).some((object) => object?.name === '__template__'),
      },
      layers: getCanvasObjects(canvasState).map(createLayerRecord),
      bridge: {
        fabricCanvas: canvasState,
      },
    });

    return {
      document: migrated,
      migration: {
        source: 'legacy-fabric-json',
        applied: ['wrapped-legacy-fabric-canvas-as-editor-document-v1'],
      },
    };
  }

  function normalizeProjectPayload(payload) {
    if (isEditorDocumentPayload(payload)) {
      if (payload.version > CURRENT_EDITOR_DOCUMENT_VERSION) {
        throw new Error(`Unsupported EditorDocument version ${payload.version}.`);
      }

      return {
        document: ensureDocumentDefaults(payload),
        migration: {
          source: 'editor-document',
          applied: [],
        },
      };
    }

    if (isLegacyFabricProject(payload)) {
      return migrateLegacyFabricProject(payload);
    }

    throw new Error('Unsupported project file format.');
  }

  function getLegacyFabricCanvas(documentPayload) {
    return cloneJson(documentPayload?.bridge?.fabricCanvas || null);
  }

  global.LiveryLabDocument = {
    EDITOR_DOCUMENT_SCHEMA,
    EDITOR_DOCUMENT_KIND,
    CURRENT_EDITOR_DOCUMENT_VERSION,
    createDocumentSnapshot,
    createDocumentSnapshotFromCanvasState,
    createSessionSnapshot,
    normalizeProjectPayload,
    getLegacyFabricCanvas,
    isEditorDocumentPayload,
    isLegacyFabricProject,
  };
})(window);