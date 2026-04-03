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

    return {
      selection: {
        selectedObjectId: editor.getActiveObject()?._id || null,
        activeLayerId: typeof editor.getActiveLayerId === 'function' ? editor.getActiveLayerId() : null,
      },
      viewport: {
        zoom: asNumber(editor.currentZoom, 1),
      },
    };
  }

  function createDocumentSnapshot(editor, options = {}) {
    const canvasState = typeof editor?._serializeCanvasForDocument === 'function'
      ? editor._serializeCanvasForDocument()
      : null;

    if (!canvasState) {
      throw new Error('Editor document snapshot requires a serializable canvas state.');
    }

    const documentPayload = {
      schema: EDITOR_DOCUMENT_SCHEMA,
      kind: EDITOR_DOCUMENT_KIND,
      version: CURRENT_EDITOR_DOCUMENT_VERSION,
      metadata: {
        savedAt: new Date().toISOString(),
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

    if (options.includeSession) {
      documentPayload.session = createSessionSnapshot(editor);
    }

    return documentPayload;
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
    normalized.layers = Array.isArray(normalized.layers) && normalized.layers.length
      ? normalized.layers
      : getCanvasObjects(canvasState).map(createLayerRecord);

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
    createSessionSnapshot,
    normalizeProjectPayload,
    getLegacyFabricCanvas,
    isEditorDocumentPayload,
    isLegacyFabricProject,
  };
})(window);