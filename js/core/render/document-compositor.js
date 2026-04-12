(function attachLiveryLabRender(global) {
  const SUPPORTED_LAYER_TYPES = new Set([
    'raster-layer',
    'overlay-image',
    'text-layer',
    'shape-rect',
    'shape-ellipse',
    'shape-line',
  ]);
  const IMAGE_BACKED_LAYER_TYPES = new Set(['raster-layer', 'overlay-image']);
  const FABRIC_OBJECT_LAYER_TYPES = new Set(['text-layer', 'shape-rect', 'shape-ellipse', 'shape-line']);
  const SUPPORTED_IMAGE_BACKED_BLEND_MODES = new Set(['source-over', 'destination-out', 'multiply', 'screen']);
  const SUPPORTED_FABRIC_OBJECT_BLEND_MODES = new Set(['source-over', 'destination-out', 'multiply', 'screen']);
  const SUPPORTED_BLEND_MODES = new Set([...SUPPORTED_IMAGE_BACKED_BLEND_MODES, ...SUPPORTED_FABRIC_OBJECT_BLEND_MODES]);
  const POLICY_PRESETS = Object.freeze({
    export: Object.freeze({
      mode: 'export',
      includeTemplate: false,
      includeGuides: false,
      includeSpecMap: false,
      includeTransientPreview: false,
    }),
    viewport: Object.freeze({
      mode: 'viewport',
      includeTemplate: true,
      includeGuides: true,
      includeSpecMap: true,
      includeTransientPreview: false,
    }),
  });

  function clampOpacity(value) {
    const opacity = Number(value);
    if (!Number.isFinite(opacity)) return 1;
    return Math.max(0, Math.min(1, opacity));
  }

  function asNumber(value, fallback = 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  function normalizeBlendMode(value) {
    return typeof value === 'string' && value ? value : 'source-over';
  }

  function isSupportedBlendModeForLayerType(layerType, blendMode) {
    const normalizedBlendMode = normalizeBlendMode(blendMode);
    if (IMAGE_BACKED_LAYER_TYPES.has(layerType)) {
      return SUPPORTED_IMAGE_BACKED_BLEND_MODES.has(normalizedBlendMode);
    }

    if (FABRIC_OBJECT_LAYER_TYPES.has(layerType)) {
      return SUPPORTED_FABRIC_OBJECT_BLEND_MODES.has(normalizedBlendMode);
    }

    return false;
  }

  function getUnsupportedLayerReason(layer, surface) {
    if (!SUPPORTED_LAYER_TYPES.has(layer?.layerType)) {
      return 'unsupported-layer-type';
    }

    if (!surface) {
      return 'missing-surface';
    }

    const blendMode = normalizeBlendMode(surface.blendMode || layer?.blendMode || 'source-over');
    if (!isSupportedBlendModeForLayerType(layer?.layerType, blendMode)) {
      return 'unsupported-blend-mode';
    }

    return null;
  }

  function createPolicy(mode, overrides = {}) {
    const preset = POLICY_PRESETS[mode] || POLICY_PRESETS.export;
    const policy = {
      ...preset,
      ...overrides,
    };

    const rolePolicy = {
      template: policy.includeTemplate ? 'include' : 'exclude',
      guide: policy.includeGuides ? 'include' : 'exclude',
      'spec-map': policy.includeSpecMap ? 'include' : 'exclude',
      ...(overrides.rolePolicy || {}),
    };

    policy.rolePolicy = rolePolicy;
    policy.includeTemplate = rolePolicy.template !== 'exclude';
    policy.includeGuides = rolePolicy.guide !== 'exclude';
    policy.includeSpecMap = rolePolicy['spec-map'] !== 'exclude';

    return policy;
  }

  function shouldIncludeRole(policy, role) {
    const decision = policy?.rolePolicy?.[role];
    if (decision === 'include') return true;
    if (decision === 'exclude') return false;
    return true;
  }

  function resolveTargetDimensions(options = {}) {
    const documentPayload = options.document;
    const artboardWidth = Math.max(1, asNumber(documentPayload?.artboard?.width, 2048));
    const artboardHeight = Math.max(1, asNumber(documentPayload?.artboard?.height, 2048));
    const targetWidth = Math.max(1, Math.round(asNumber(options.targetWidth, artboardWidth)));
    const targetHeight = Math.max(1, Math.round(asNumber(options.targetHeight, artboardHeight)));

    return {
      artboardWidth,
      artboardHeight,
      targetWidth,
      targetHeight,
      xScale: targetWidth / artboardWidth,
      yScale: targetHeight / artboardHeight,
    };
  }

  function resolveCompositionPlan(options = {}) {
    const documentPayload = options.document;
    const surfaceRegistry = options.surfaceRegistry || {};
    const mode = options.mode || 'export';
    const policy = createPolicy(mode, options.policyOverrides || {});
    const unsupportedLayerIds = [];
    const unsupportedLayers = [];
    const includedLayerIds = [];

    (documentPayload?.layers || []).forEach((layer) => {
      if (!shouldIncludeLayer(layer, policy)) return;
      if (layer.role === 'background') return;

      includedLayerIds.push(layer.id);

      const surface = surfaceRegistry[layer.id];
      const unsupportedReason = getUnsupportedLayerReason(layer, surface);
      if (unsupportedReason) {
        unsupportedLayerIds.push(layer.id);
        unsupportedLayers.push({
          id: layer.id,
          layerType: layer.layerType,
          blendMode: normalizeBlendMode(surface?.blendMode || layer.blendMode || 'source-over'),
          reason: unsupportedReason,
        });
      }
    });

    return {
      mode,
      policy,
      includedLayerIds,
      unsupportedLayerIds,
      unsupportedLayers,
      supported: unsupportedLayerIds.length === 0,
      fallbackReason: unsupportedLayers[0]?.reason || null,
    };
  }

  function shouldIncludeLayer(layer, policy) {
    if (!layer || layer.visible === false) return false;
    if (layer.role === 'template') return shouldIncludeRole(policy, 'template');
    if (layer.role === 'guide') return shouldIncludeRole(policy, 'guide');
    if (layer.role === 'spec-map') return shouldIncludeRole(policy, 'spec-map');
    return true;
  }

  function findLayerById(documentPayload, layerId) {
    if (!layerId) return null;
    return (documentPayload?.layers || []).find((layer) => layer?.id === layerId) || null;
  }

  function getFabricObjectBounds(object, layer) {
    if (typeof object?.getBoundingRect === 'function') {
      return object.getBoundingRect(true, true);
    }

    return {
      left: asNumber(object?.left, asNumber(layer?.transform?.x, 0)),
      top: asNumber(object?.top, asNumber(layer?.transform?.y, 0)),
      width: asNumber(object?.width, asNumber(layer?.bounds?.width, 0)),
      height: asNumber(object?.height, asNumber(layer?.bounds?.height, 0)),
    };
  }

  function createImageBackedSurface(layer, object, element) {
    const sourceWidth = Math.max(1, asNumber(object.width, asNumber(layer?.bounds?.width, element.naturalWidth || element.width || 1)));
    const sourceHeight = Math.max(1, asNumber(object.height, asNumber(layer?.bounds?.height, element.naturalHeight || element.height || 1)));

    return {
      objectId: layer.id,
      element,
      sourceWidth,
      sourceHeight,
      left: asNumber(object.left, asNumber(layer?.transform?.x, 0)),
      top: asNumber(object.top, asNumber(layer?.transform?.y, 0)),
      scaleX: asNumber(object.scaleX, asNumber(layer?.transform?.scaleX, 1)),
      scaleY: asNumber(object.scaleY, asNumber(layer?.transform?.scaleY, 1)),
      angle: asNumber(object.angle, asNumber(layer?.transform?.angle, 0)),
      opacity: clampOpacity(object.opacity ?? layer?.opacity ?? 1),
      blendMode: normalizeBlendMode(object.globalCompositeOperation || layer?.blendMode || 'source-over'),
    };
  }

  function createFabricObjectSurface(layer, object) {
    const element = typeof object?.toCanvasElement === 'function'
      ? object.toCanvasElement({ enableRetinaScaling: false })
      : null;
    if (!element) return null;

    const bounds = getFabricObjectBounds(object, layer);
    return {
      objectId: layer.id,
      element,
      sourceWidth: Math.max(1, asNumber(element.width, asNumber(bounds.width, asNumber(layer?.bounds?.width, 1)))),
      sourceHeight: Math.max(1, asNumber(element.height, asNumber(bounds.height, asNumber(layer?.bounds?.height, 1)))),
      left: asNumber(bounds.left, asNumber(layer?.transform?.x, 0)),
      top: asNumber(bounds.top, asNumber(layer?.transform?.y, 0)),
      scaleX: 1,
      scaleY: 1,
      angle: 0,
      opacity: 1,
      blendMode: normalizeBlendMode(object.globalCompositeOperation || layer?.blendMode || 'source-over'),
    };
  }

  function createFabricSurfaceRegistry(options = {}) {
    const fabricCanvas = options.fabricCanvas;
    const documentPayload = options.document;
    const objects = typeof fabricCanvas?.getObjects === 'function' ? fabricCanvas.getObjects() : [];
    const objectsById = new Map(objects.map((object) => [object?._id, object]));
    const registry = {};

    (documentPayload?.layers || []).forEach((layer) => {
      if (!SUPPORTED_LAYER_TYPES.has(layer?.layerType)) return;

      const object = objectsById.get(layer.id);
      if (!object) return;

      if (IMAGE_BACKED_LAYER_TYPES.has(layer.layerType)) {
        const element = object?.getElement ? object.getElement() : object?._element;
        if (!element) return;
        registry[layer.id] = createImageBackedSurface(layer, object, element);
        return;
      }

      if (FABRIC_OBJECT_LAYER_TYPES.has(layer.layerType)) {
        const surface = createFabricObjectSurface(layer, object);
        if (surface) {
          registry[layer.id] = surface;
        }
      }
    });

    return registry;
  }

  function resolveSurfaceLayerSupport(options = {}) {
    const documentPayload = options.document;
    const surfaceRegistry = options.surfaceRegistry || {};
    const layerId = options.layerId || null;
    const layer = findLayerById(documentPayload, layerId);

    if (!layerId) {
      return {
        supported: false,
        reason: 'missing-layer-id',
        layer: null,
        surface: null,
      };
    }

    if (!layer) {
      return {
        supported: false,
        reason: 'missing-layer-record',
        layer: null,
        surface: null,
      };
    }

    const surface = surfaceRegistry[layer.id];
    const unsupportedReason = getUnsupportedLayerReason(layer, surface);
    if (unsupportedReason) {
      return {
        supported: false,
        reason: unsupportedReason,
        layer,
        surface: surface || null,
      };
    }

    return {
      supported: true,
      reason: null,
      layer,
      surface,
    };
  }

  function analyzeDocumentSupport(options = {}) {
    const plan = resolveCompositionPlan(options);
    return {
      supported: plan.supported,
      unsupportedLayerIds: plan.unsupportedLayerIds,
      unsupportedLayers: plan.unsupportedLayers,
      includedLayerIds: plan.includedLayerIds,
      policy: plan.policy,
      fallbackReason: plan.fallbackReason,
    };
  }

  function renderDocumentComposition(options = {}) {
    const documentPayload = options.document;
    const surfaceRegistry = options.surfaceRegistry || {};
    const mode = options.mode || 'export';
    const dimensions = resolveTargetDimensions(options);
    const plan = resolveCompositionPlan({
      document: documentPayload,
      surfaceRegistry,
      mode,
      policyOverrides: options.policyOverrides || {},
    });

    if (!plan.supported) {
      return {
        supported: false,
        reason: plan.fallbackReason,
        unsupportedLayerIds: plan.unsupportedLayerIds,
        unsupportedLayers: plan.unsupportedLayers,
        includedLayerIds: plan.includedLayerIds,
        fallbackReason: plan.fallbackReason,
        policy: plan.policy,
        ...dimensions,
      };
    }

    return {
      supported: true,
      unsupportedLayerIds: [],
      includedLayerIds: plan.includedLayerIds,
      fallbackReason: null,
      ...dimensions,
      ...composeDocument({
        document: documentPayload,
        targetWidth: dimensions.targetWidth,
        targetHeight: dimensions.targetHeight,
        surfaceRegistry,
        policy: plan.policy,
        targetCanvas: options.targetCanvas,
      }),
    };
  }

  function drawSurface(ctx, surface, xScale, yScale) {
    const scaledWidth = Math.abs(surface.sourceWidth * surface.scaleX * xScale);
    const scaledHeight = Math.abs(surface.sourceHeight * surface.scaleY * yScale);
    if (scaledWidth <= 0 || scaledHeight <= 0) return;

    const drawLeft = surface.left * xScale;
    const drawTop = surface.top * yScale;
    const centerX = drawLeft + (surface.sourceWidth * surface.scaleX * xScale) / 2;
    const centerY = drawTop + (surface.sourceHeight * surface.scaleY * yScale) / 2;
    const flipX = surface.scaleX < 0 ? -1 : 1;
    const flipY = surface.scaleY < 0 ? -1 : 1;

    ctx.save();
    ctx.globalAlpha = clampOpacity(surface.opacity);
    ctx.globalCompositeOperation = surface.blendMode || 'source-over';
    ctx.translate(centerX, centerY);
    if (surface.angle) {
      ctx.rotate((surface.angle * Math.PI) / 180);
    }
    ctx.scale(flipX, flipY);
    ctx.drawImage(surface.element, -scaledWidth / 2, -scaledHeight / 2, scaledWidth, scaledHeight);
    ctx.restore();
  }

  function composeDocument(options = {}) {
    if (!global.document) {
      throw new Error('Document compositor requires a browser document.');
    }

    const documentPayload = options.document;
    const surfaceRegistry = options.surfaceRegistry || {};
    const policy = options.policy || createPolicy('export');
    const {
      artboardWidth,
      artboardHeight,
      targetWidth,
      targetHeight,
      xScale,
      yScale,
    } = resolveTargetDimensions(options);

    const canvas = options.targetCanvas || global.document.createElement('canvas');
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    const composedLayerIds = [];

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.clearRect(0, 0, targetWidth, targetHeight);
    ctx.fillStyle = documentPayload?.artboard?.backgroundColor || '#ffffff';
    ctx.fillRect(0, 0, targetWidth, targetHeight);

    (documentPayload?.layers || []).forEach((layer) => {
      if (!shouldIncludeLayer(layer, policy) || layer.role === 'background') return;

      const surface = surfaceRegistry[layer.id];
      if (!surface) return;

      drawSurface(ctx, surface, xScale, yScale);
      composedLayerIds.push(layer.id);
    });

    return {
      canvas,
      imageData: ctx.getImageData(0, 0, targetWidth, targetHeight),
      composedLayerIds,
      policy: { ...policy },
    };
  }

  global.LiveryLabRender = {
    POLICY_PRESETS,
    SUPPORTED_LAYER_TYPES,
    SUPPORTED_IMAGE_BACKED_BLEND_MODES,
    SUPPORTED_BLEND_MODES,
    SUPPORTED_FABRIC_OBJECT_BLEND_MODES,
    normalizeBlendMode,
    isSupportedBlendModeForLayerType,
    createPolicy,
    resolveTargetDimensions,
    resolveCompositionPlan,
    createFabricSurfaceRegistry,
    resolveSurfaceLayerSupport,
    analyzeDocumentSupport,
    renderDocumentComposition,
    composeDocument,
  };
})(window);