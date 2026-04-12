(function attachLiveryLabWorkspaceUIController(global) {
  function createWorkspaceUIController(options = {}) {
    const editor = options.editor;
    const dispatcher = options.dispatcher;
    const appStore = options.appStore;
    const shellSelectors = options.shellSelectors || {};
    const defaultActiveTool = options.defaultActiveTool || 'select';

    const primaryColorInput = document.getElementById('prop-primary-color');
    const secondaryColorInput = document.getElementById('prop-secondary-color');
    const brushSizeInput = document.getElementById('prop-brush-size');
    const brushSizeVal = document.getElementById('prop-brush-size-val');
    const opacityInput = document.getElementById('prop-opacity');
    const opacityVal = document.getElementById('prop-opacity-val');
    const layerOpacityInput = document.getElementById('layer-opacity');
    const layerOpacityVal = document.getElementById('layer-opacity-val');
    const strokeWidthInput = document.getElementById('prop-stroke-width');
    const strokeWidthVal = document.getElementById('prop-stroke-width-val');
    const fontFamilySelect = document.getElementById('prop-font');
    const fontSizeInput = document.getElementById('prop-font-size');
    const tmplOpacityInput = document.getElementById('tmpl-opacity');
    const tmplOpacityVal = document.getElementById('tmpl-opacity-val');
    const bgColorInput = document.getElementById('prop-bg-color');
    const toolButtons = Array.from(document.querySelectorAll('.tool-btn[data-tool]'));

    const panelShellElements = {
      properties: {
        header: document.querySelector('.panel-header[data-toggle="props-body"]'),
        body: document.getElementById('props-body'),
      },
      layers: {
        header: document.querySelector('.panel-header[data-toggle="layers-list"]'),
        body: document.getElementById('layers-list'),
      },
    };

    const objectActionButtons = {
      bringForward: document.getElementById('btn-bring-fwd'),
      sendBackward: document.getElementById('btn-send-bck'),
      duplicate: document.getElementById('btn-duplicate'),
      delete: document.getElementById('btn-delete'),
    };

    const fontPickerCatalog = [
      {
        label: 'Sans Serif',
        genericFamily: 'sans-serif',
        fonts: [
          'Aptos',
          'Arial',
          'Bahnschrift',
          'Calibri',
          'Candara',
          'Century Gothic',
          'Corbel',
          'Franklin Gothic Medium',
          'Gadugi',
          'Gill Sans MT',
          'Leelawadee UI',
          'Lucida Sans Unicode',
          'Microsoft Sans Serif',
          'Segoe UI',
          'Tahoma',
          'Trebuchet MS',
          'Verdana',
          'Yu Gothic',
          'Yu Gothic UI'
        ]
      },
      {
        label: 'Serif',
        genericFamily: 'serif',
        fonts: [
          'Aptos Serif',
          'Baskerville Old Face',
          'Book Antiqua',
          'Bookman Old Style',
          'Cambria',
          'Constantia',
          'Garamond',
          'Georgia',
          'Palatino Linotype',
          'Perpetua',
          'Rockwell',
          'Sitka Text',
          'Sylfaen',
          'Times New Roman',
          'Yu Mincho'
        ]
      },
      {
        label: 'Monospace',
        genericFamily: 'monospace',
        fonts: [
          'Aptos Mono',
          'Cascadia Code',
          'Cascadia Mono',
          'Consolas',
          'Courier New',
          'Lucida Console'
        ]
      },
      {
        label: 'Script / Handwriting',
        genericFamily: 'cursive',
        fonts: [
          'Bradley Hand ITC',
          'Brush Script MT',
          'Comic Sans MS',
          'Gabriola',
          'Ink Free',
          'Lucida Handwriting',
          'MV Boli',
          'Segoe Print',
          'Segoe Script',
          'Tempus Sans ITC'
        ]
      },
      {
        label: 'Display',
        genericFamily: 'sans-serif',
        fonts: [
          'Arial Black',
          'Cooper Black',
          'Haettenschweiler',
          'Impact',
          'Jokerman',
          'Showcard Gothic'
        ]
      }
    ];

    const fontDetectionSample = 'mmmmmmmmmwwwwwwwiiiiiii1111111';
    const fontFallbackFamilies = ['monospace', 'serif', 'sans-serif'];
    let fontMeasureContext = null;

    function readWorkspaceState() {
      if (editor && typeof editor.getWorkspaceState === 'function') {
        return editor.getWorkspaceState();
      }

      return {
        tool: {
          active: editor?.currentTool || defaultActiveTool,
        },
        selection: {
          selectedObjectId: null,
          selectedObjectType: null,
          activeLayerId: null,
          activeLayerType: null,
        },
        inspector: {
          effectiveTool: editor?.currentTool || defaultActiveTool,
          selectedObject: null,
          controls: {
            primaryColor: primaryColorInput?.value || '#cc0000',
            secondaryColor: secondaryColorInput?.value || '#ffffff',
            opacity: Number.isFinite(Number(opacityInput?.value)) ? Number(opacityInput.value) : 1,
            strokeWidth: Number.isFinite(Number(strokeWidthInput?.value)) ? Number(strokeWidthInput.value) : 3,
            fontFamily: fontFamilySelect?.value || 'Arial',
            fontSize: Number.isFinite(Number(fontSizeInput?.value)) ? Number(fontSizeInput.value) : 120,
          },
          layerOpacity: {
            value: 1,
            editable: false,
          },
        },
        actions: {
          selectionTargetId: null,
          canDuplicateSelection: false,
          canDeleteSelection: false,
          canReorderSelection: false,
          canChangeLayerOpacity: false,
        },
        layers: editor && typeof editor.getLayers === 'function' ? editor.getLayers() : [],
      };
    }

    function getSelectedWorkspaceLayerId(workspaceState = readWorkspaceState()) {
      const projectedTargetId = workspaceState?.actions?.selectionTargetId;
      if (projectedTargetId) return projectedTargetId;

      const selectedLayer = Array.isArray(workspaceState?.layers)
        ? workspaceState.layers.find((layer) => layer?.selected && layer?.id)
        : null;

      return selectedLayer?.id || workspaceState?.selection?.selectedObjectId || null;
    }

    function getSelectedWorkspaceInspectorObjectId(workspaceState = readWorkspaceState()) {
      return workspaceState?.inspector?.selectedObject?.id || null;
    }

    function getPanelNameFromToggleTarget(targetId) {
      if (targetId === 'props-body') return 'properties';
      if (targetId === 'layers-list') return 'layers';
      return null;
    }

    function syncTemplateOpacityUI(value = editor?.getTemplateOpacity?.()) {
      const opacity = Number.isFinite(Number(value)) ? Number(value) : 1;
      if (tmplOpacityInput) tmplOpacityInput.value = String(opacity);
      if (tmplOpacityVal) tmplOpacityVal.textContent = Math.round(opacity * 100) + '%';
    }

    function syncLayerOpacityUI(workspaceState = readWorkspaceState()) {
      const opacity = Number.isFinite(Number(workspaceState?.inspector?.layerOpacity?.value))
        ? Number(workspaceState.inspector.layerOpacity.value)
        : 1;
      const isEditable = !!workspaceState?.inspector?.layerOpacity?.editable;

      if (layerOpacityInput) layerOpacityInput.value = String(opacity);
      if (layerOpacityInput) layerOpacityInput.disabled = !isEditable;
      if (layerOpacityVal) layerOpacityVal.textContent = Math.round(opacity * 100) + '%';
    }

    function syncBackgroundColorUI(value = editor?.backgroundColor) {
      if (bgColorInput) bgColorInput.value = value;
    }

    function toCssFontFamily(fontFamily) {
      const normalizedFontFamily = String(fontFamily || '').trim().replace(/\\/g, '\\\\').replace(/"/g, '\\"');
      if (!normalizedFontFamily) return 'sans-serif';
      return /[\s,]/.test(normalizedFontFamily)
        ? `"${normalizedFontFamily}"`
        : normalizedFontFamily;
    }

    function buildFontPreviewStack(fontFamily, genericFamily = 'sans-serif') {
      return `${toCssFontFamily(fontFamily)}, ${genericFamily}`;
    }

    function getFontMeasureContext() {
      if (fontMeasureContext) return fontMeasureContext;

      const canvas = document.createElement('canvas');
      fontMeasureContext = canvas.getContext('2d');
      return fontMeasureContext;
    }

    function isFontAvailable(fontFamily) {
      if (typeof fontFamily !== 'string' || !fontFamily.trim()) return false;

      const measureContext = getFontMeasureContext();
      if (!measureContext) return true;

      return fontFallbackFamilies.some((fallbackFamily) => {
        measureContext.font = `72px ${fallbackFamily}`;
        const baselineWidth = measureContext.measureText(fontDetectionSample).width;

        measureContext.font = `72px ${buildFontPreviewStack(fontFamily, fallbackFamily)}`;
        const candidateWidth = measureContext.measureText(fontDetectionSample).width;

        return candidateWidth !== baselineWidth;
      });
    }

    function createFontOption(fontFamily, genericFamily = 'sans-serif') {
      const option = document.createElement('option');
      option.value = fontFamily;
      option.textContent = fontFamily;
      option.style.fontFamily = buildFontPreviewStack(fontFamily, genericFamily);
      return option;
    }

    function findFontGroup(label) {
      return Array.from(fontFamilySelect?.children || []).find((child) => child.tagName === 'OPTGROUP' && child.label === label) || null;
    }

    function ensureFontGroup(label) {
      let group = findFontGroup(label);
      if (group || !fontFamilySelect) return group;

      group = document.createElement('optgroup');
      group.label = label;
      fontFamilySelect.appendChild(group);
      return group;
    }

    function ensureFontPickerOption(fontFamily, groupLabel = 'Document Fonts', genericFamily = 'sans-serif') {
      if (!fontFamilySelect || typeof fontFamily !== 'string' || !fontFamily.trim()) return null;

      const normalizedFontFamily = fontFamily.trim();
      const existingOption = Array.from(fontFamilySelect.options).find((option) => option.value === normalizedFontFamily);
      if (existingOption) return existingOption;

      const group = ensureFontGroup(groupLabel);
      if (!group) return null;

      const option = createFontOption(normalizedFontFamily, genericFamily);
      group.appendChild(option);
      return option;
    }

    function populateSupportedFontOptions(selectedFontFamily = 'Arial') {
      if (!fontFamilySelect) return;

      fontFamilySelect.innerHTML = '';

      let renderedFontCount = 0;
      fontPickerCatalog.forEach((groupDefinition) => {
        const supportedFonts = groupDefinition.fonts.filter(isFontAvailable);
        if (!supportedFonts.length) return;

        const group = document.createElement('optgroup');
        group.label = groupDefinition.label;
        supportedFonts.forEach((fontFamily) => {
          group.appendChild(createFontOption(fontFamily, groupDefinition.genericFamily));
          renderedFontCount += 1;
        });
        fontFamilySelect.appendChild(group);
      });

      if (!renderedFontCount) {
        ensureFontPickerOption('Arial', 'Sans Serif', 'sans-serif');
      }

      const preferredFontFamily = typeof selectedFontFamily === 'string' && selectedFontFamily.trim()
        ? selectedFontFamily.trim()
        : (fontFamilySelect.options[0]?.value || 'Arial');

      ensureFontPickerOption(preferredFontFamily);
      fontFamilySelect.value = preferredFontFamily;
    }

    function syncFontFamilyPreview(fontFamily) {
      if (!fontFamilySelect || typeof fontFamily !== 'string' || !fontFamily) return;
      ensureFontPickerOption(fontFamily);
      fontFamilySelect.style.fontFamily = buildFontPreviewStack(fontFamily, 'sans-serif');
    }

    function updatePropertiesPanel(workspaceState = readWorkspaceState()) {
      const effectiveTool = workspaceState?.inspector?.effectiveTool
        || workspaceState?.tool?.active
        || defaultActiveTool;

      document.querySelectorAll('.props-group').forEach((group) => {
        const tools = group.dataset.tools ? group.dataset.tools.split(',') : [];
        group.classList.toggle('hidden', tools.length > 0 && !tools.includes(effectiveTool));
      });
    }

    function updatePropertiesFromWorkspaceState(workspaceState = readWorkspaceState()) {
      const selectedObject = workspaceState?.inspector?.selectedObject || null;
      const controls = workspaceState?.inspector?.controls || {};

      if (controls.primaryColor && primaryColorInput) {
        primaryColorInput.value = controls.primaryColor;
      }

      if (Number.isFinite(Number(controls.opacity)) && opacityInput) {
        opacityInput.value = String(Number(controls.opacity));
        if (opacityVal) opacityVal.textContent = Math.round(Number(controls.opacity) * 100) + '%';
      }

      if (secondaryColorInput && controls.secondaryColor) {
        secondaryColorInput.value = controls.secondaryColor;
      }

      if (Number.isFinite(Number(controls.strokeWidth)) && strokeWidthInput) {
        strokeWidthInput.value = String(Number(controls.strokeWidth));
        if (strokeWidthVal) strokeWidthVal.textContent = String(Number(controls.strokeWidth));
      }

      if (fontFamilySelect && typeof controls.fontFamily === 'string' && controls.fontFamily) {
        ensureFontPickerOption(controls.fontFamily);
        fontFamilySelect.value = controls.fontFamily;
        syncFontFamilyPreview(controls.fontFamily);
      }

      if (fontSizeInput && Number.isFinite(Number(controls.fontSize))) {
        fontSizeInput.value = String(Number(controls.fontSize));
      }

      if ((selectedObject?.type === 'i-text' || selectedObject?.type === 'text') && fontFamilySelect && fontSizeInput) {
        if (typeof controls.fontFamily === 'string' && controls.fontFamily) {
          ensureFontPickerOption(controls.fontFamily);
          fontFamilySelect.value = controls.fontFamily;
          syncFontFamilyPreview(controls.fontFamily);
        }
        if (Number.isFinite(Number(controls.fontSize))) {
          fontSizeInput.value = String(Number(controls.fontSize));
        }
      }
    }

    function syncWorkspaceActionButtons(workspaceState = readWorkspaceState()) {
      const actions = workspaceState?.actions || {};

      if (objectActionButtons.bringForward) {
        objectActionButtons.bringForward.disabled = !actions.canReorderSelection;
      }
      if (objectActionButtons.sendBackward) {
        objectActionButtons.sendBackward.disabled = !actions.canReorderSelection;
      }
      if (objectActionButtons.duplicate) {
        objectActionButtons.duplicate.disabled = !actions.canDuplicateSelection;
      }
      if (objectActionButtons.delete) {
        objectActionButtons.delete.disabled = !actions.canDeleteSelection;
      }
    }

    function syncToolUI(toolName, workspaceState = readWorkspaceState()) {
      toolButtons.forEach((button) => button.classList.toggle('active', button.dataset.tool === toolName));

      updatePropertiesPanel(workspaceState);
      updatePropertiesFromWorkspaceState(workspaceState);
      syncLayerOpacityUI(workspaceState);
      syncWorkspaceActionButtons(workspaceState);
    }

    function renderToolShell(state = appStore?.getState?.(), workspaceState = readWorkspaceState()) {
      const activeTool = typeof shellSelectors.selectActiveTool === 'function'
        ? shellSelectors.selectActiveTool(state)
        : defaultActiveTool;
      syncToolUI(activeTool, workspaceState);
    }

    function renderPanelShell(state = appStore?.getState?.()) {
      Object.entries(panelShellElements).forEach(([panelName, elements]) => {
        const header = elements?.header;
        const body = elements?.body;
        if (!header || !body) return;

        const isOpen = typeof shellSelectors.isPanelOpen === 'function'
          ? shellSelectors.isPanelOpen(state, panelName)
          : true;
        body.classList.toggle('hidden', !isOpen);
        header.classList.toggle('collapsed', !isOpen);
      });
    }

    function layerIcon(type) {
      const map = {
        image: '🖼',
        rect: '▬',
        ellipse: '⬭',
        circle: '⬤',
        path: '✏️',
        'i-text': 'T',
        text: 'T',
        line: '╱',
        group: '📦',
      };
      return map[type] || '◻';
    }

    function renderLayersPanel(workspaceState = readWorkspaceState()) {
      const list = document.getElementById('layers-list');
      if (!list) return;

      const layers = Array.isArray(workspaceState?.layers) ? workspaceState.layers : [];
      list.innerHTML = '';

      let currentGroup = null;

      layers.forEach((layer) => {
        if (layer.groupName !== currentGroup) {
          currentGroup = layer.groupName;
          if (currentGroup) {
            const header = document.createElement('div');
            header.className = 'layer-group-header'
              + (layer.isGuide ? ' guide' : '')
              + (layer.isSpecMap ? ' specmap' : '');
            header.title = currentGroup;

            const icon = document.createElement('span');
            icon.textContent = layer.isSpecMap ? '🔒' : (layer.isGuide ? '🔒' : '📁');

            const label = document.createElement('span');
            label.className = 'layer-group-label';
            if (layer.isSpecMap) {
              label.textContent = 'Custom Spec Map (locked)';
            } else if (layer.isGuide) {
              label.textContent = 'Guide Overlays (export locked)';
            } else {
              label.textContent = currentGroup;
            }

            header.appendChild(icon);
            header.appendChild(label);
            list.appendChild(header);
          }
        }

        if (layer.isSpecMap) return;

        const item = document.createElement('div');
        item.className = 'layer-item'
          + (layer.selected ? ' selected' : '')
          + (layer.locked ? ' locked' : '')
          + (layer.isGuide ? ' guide' : '')
          + (layer.groupName ? ' grouped' : '');
        item.title = layer.name;

        const thumb = document.createElement('div');
        thumb.className = 'layer-thumb';
        thumb.textContent = layer.isGuide ? '🎛' : layerIcon(layer.type);

        const name = document.createElement('div');
        name.className = 'layer-name';
        name.textContent = layer.name;

        const actions = document.createElement('div');
        actions.className = 'layer-actions';

        const visBtn = document.createElement('button');
        const canToggleVisibility = layer.actions
          ? layer.actions.canToggleVisibility !== false
          : !layer.isSpecMap;
        visBtn.className = 'icon-btn';
        visBtn.title = layer.visible ? 'Hide layer' : 'Show layer';
        visBtn.textContent = layer.visible ? '👁' : '🚫';
        visBtn.disabled = !canToggleVisibility;
        if (canToggleVisibility) {
          visBtn.addEventListener('click', (event) => {
            event.stopPropagation();
            editor.toggleWorkspaceLayerVisibilityById(layer.id);
          });
        }
        actions.appendChild(visBtn);

        const canDeleteLayer = layer.actions
          ? !!layer.actions.canDelete
          : (!layer.locked && !layer.isGuide);
        if (canDeleteLayer) {
          const delBtn = document.createElement('button');
          delBtn.className = 'icon-btn danger';
          delBtn.title = 'Delete layer';
          delBtn.textContent = '🗑';
          delBtn.addEventListener('click', (event) => {
            event.stopPropagation();
            editor.deleteWorkspaceLayerById(layer.id);
          });
          actions.appendChild(delBtn);
        }

        item.appendChild(thumb);
        item.appendChild(name);
        item.appendChild(actions);

        const canSelectLayer = layer.actions
          ? !!layer.actions.canSelect
          : (!layer.locked && layer.visible !== false);
        if (canSelectLayer) {
          item.addEventListener('click', () => editor.selectWorkspaceLayerById(layer.id));
        }

        list.appendChild(item);
      });
    }

    function renderWorkspaceState(workspaceState = readWorkspaceState(), shellState = appStore?.getState?.()) {
      renderToolShell(shellState, workspaceState);
      renderLayersPanel(workspaceState);
    }

    function handleSelectionChanged() {
      const workspaceState = readWorkspaceState();
      renderWorkspaceState(workspaceState);
      syncTemplateOpacityUI();
    }

    function handleLayersChanged() {
      renderWorkspaceState(readWorkspaceState());
    }

    function bindPanelEvents() {
      document.querySelectorAll('.panel-header[data-toggle]').forEach((header) => {
        header.addEventListener('click', () => {
          const panelName = getPanelNameFromToggleTarget(header.dataset.toggle);
          if (!panelName) return;

          dispatcher.dispatch('app.panel.toggle', { panel: panelName });
        });
      });
    }

    function bindPropertyEvents() {
      function commitSelectedWorkspaceInspectorChange() {
        const workspaceState = readWorkspaceState();
        const projectedObjectId = getSelectedWorkspaceInspectorObjectId(workspaceState);
        if (!projectedObjectId) return;

        if (!editor.commitWorkspaceInspectorChange()) {
          renderWorkspaceState(workspaceState);
        }
      }

      primaryColorInput?.addEventListener('input', (event) => {
        const nextColor = event.target.value;
        const workspaceState = readWorkspaceState();
        const projectedObjectId = getSelectedWorkspaceInspectorObjectId(workspaceState);

        if (projectedObjectId && typeof editor.setWorkspaceInspectorPrimaryColorById === 'function') {
          if (editor.setWorkspaceInspectorPrimaryColorById(projectedObjectId, nextColor)) {
            return;
          }

          renderWorkspaceState(workspaceState);
          return;
        }

        editor.setPrimaryColor(nextColor);
        editor.updateActiveColor(nextColor);
      });

      primaryColorInput?.addEventListener('change', commitSelectedWorkspaceInspectorChange);
      primaryColorInput?.addEventListener('blur', commitSelectedWorkspaceInspectorChange);

      secondaryColorInput?.addEventListener('input', (event) => {
        const nextColor = event.target.value;
        const workspaceState = readWorkspaceState();
        const projectedObjectId = getSelectedWorkspaceInspectorObjectId(workspaceState);

        if (projectedObjectId && typeof editor.setWorkspaceInspectorSecondaryColorById === 'function') {
          if (editor.setWorkspaceInspectorSecondaryColorById(projectedObjectId, nextColor)) {
            return;
          }

          renderWorkspaceState(workspaceState);
          return;
        }

        editor.setSecondaryColor(nextColor);
        editor.updateActiveSecondaryColor(nextColor);
      });

      secondaryColorInput?.addEventListener('change', commitSelectedWorkspaceInspectorChange);
      secondaryColorInput?.addEventListener('blur', commitSelectedWorkspaceInspectorChange);

      brushSizeInput?.addEventListener('input', (event) => {
        const value = Number.parseInt(event.target.value, 10);
        editor.setBrushSize(value);
        if (brushSizeVal) brushSizeVal.textContent = value;
      });

      opacityInput?.addEventListener('input', (event) => {
        const value = Number.parseFloat(event.target.value);
        const workspaceState = readWorkspaceState();
        const projectedObjectId = getSelectedWorkspaceInspectorObjectId(workspaceState);

        if (projectedObjectId && typeof editor.setWorkspaceInspectorOpacityById === 'function') {
          if (editor.setWorkspaceInspectorOpacityById(projectedObjectId, value)) {
            if (opacityVal) opacityVal.textContent = Math.round(value * 100) + '%';
            return;
          }

          renderWorkspaceState(workspaceState);
          return;
        }

        editor.setOpacity(value);
        if (opacityVal) opacityVal.textContent = Math.round(value * 100) + '%';
      });

      opacityInput?.addEventListener('change', commitSelectedWorkspaceInspectorChange);
      opacityInput?.addEventListener('blur', commitSelectedWorkspaceInspectorChange);

      layerOpacityInput?.addEventListener('input', (event) => {
        const value = Number.parseFloat(event.target.value);
        const workspaceState = readWorkspaceState();
        const projectedLayerId = getSelectedWorkspaceLayerId(workspaceState);

        if (projectedLayerId && typeof editor.setWorkspaceLayerOpacityById === 'function') {
          if (editor.setWorkspaceLayerOpacityById(projectedLayerId, value)) {
            if (layerOpacityVal) layerOpacityVal.textContent = Math.round(value * 100) + '%';
            return;
          }

          syncLayerOpacityUI();
          return;
        }

        if (editor.setLayerOpacity(value)) {
          if (layerOpacityVal) layerOpacityVal.textContent = Math.round(value * 100) + '%';
          return;
        }

        syncLayerOpacityUI();
      });

      layerOpacityInput?.addEventListener('change', () => {
        if (!editor.commitLayerOpacityChange()) {
          syncLayerOpacityUI();
        }
      });

      layerOpacityInput?.addEventListener('blur', () => {
        if (!editor.commitLayerOpacityChange()) {
          syncLayerOpacityUI();
        }
      });

      strokeWidthInput?.addEventListener('input', (event) => {
        const value = Number.parseInt(event.target.value, 10);
        const workspaceState = readWorkspaceState();
        const projectedObjectId = getSelectedWorkspaceInspectorObjectId(workspaceState);

        if (projectedObjectId && typeof editor.setWorkspaceInspectorStrokeWidthById === 'function') {
          if (editor.setWorkspaceInspectorStrokeWidthById(projectedObjectId, value)) {
            if (strokeWidthVal) strokeWidthVal.textContent = value;
            return;
          }

          renderWorkspaceState(workspaceState);
          return;
        }

        editor.setStrokeWidth(value);
        if (strokeWidthVal) strokeWidthVal.textContent = value;
      });

      strokeWidthInput?.addEventListener('change', commitSelectedWorkspaceInspectorChange);
      strokeWidthInput?.addEventListener('blur', commitSelectedWorkspaceInspectorChange);

      fontFamilySelect?.addEventListener('change', (event) => {
        const nextFontFamily = event.target.value;
        const workspaceState = readWorkspaceState();
        const projectedObjectId = getSelectedWorkspaceInspectorObjectId(workspaceState);

        if (projectedObjectId && typeof editor.setWorkspaceInspectorFontFamilyById === 'function') {
          if (editor.setWorkspaceInspectorFontFamilyById(projectedObjectId, nextFontFamily)) {
            syncFontFamilyPreview(nextFontFamily);
            return;
          }

          renderWorkspaceState(workspaceState);
          return;
        }

        editor.setFont(nextFontFamily);
        syncFontFamilyPreview(nextFontFamily);
      });

      fontSizeInput?.addEventListener('change', (event) => {
        const nextFontSize = Number.parseInt(event.target.value, 10);
        const workspaceState = readWorkspaceState();
        const projectedObjectId = getSelectedWorkspaceInspectorObjectId(workspaceState);

        if (projectedObjectId && typeof editor.setWorkspaceInspectorFontSizeById === 'function') {
          if (editor.setWorkspaceInspectorFontSizeById(projectedObjectId, nextFontSize)) {
            return;
          }

          renderWorkspaceState(workspaceState);
          return;
        }

        editor.setFontSize(nextFontSize);
      });

      tmplOpacityInput?.addEventListener('input', (event) => {
        const value = Number.parseFloat(event.target.value);
        if (editor.setTemplateOpacity(value)) {
          syncTemplateOpacityUI(value);
          return;
        }

        syncTemplateOpacityUI();
      });

      tmplOpacityInput?.addEventListener('change', () => {
        if (!editor.commitTemplateOpacityChange()) {
          syncTemplateOpacityUI();
        }
      });

      tmplOpacityInput?.addEventListener('blur', () => {
        if (!editor.commitTemplateOpacityChange()) {
          syncTemplateOpacityUI();
        }
      });

      bgColorInput?.addEventListener('input', (event) => {
        if (editor.setBackgroundColor(event.target.value)) return;
        syncBackgroundColorUI();
      });
    }

    function bindObjectActionEvents() {
      objectActionButtons.delete?.addEventListener('click', () => {
        const workspaceState = readWorkspaceState();
        const projectedLayerId = getSelectedWorkspaceLayerId(workspaceState);

        if (projectedLayerId && typeof editor.deleteWorkspaceSelectionById === 'function') {
          if (editor.deleteWorkspaceSelectionById(projectedLayerId)) {
            return;
          }
        }

        editor.deleteSelected();
      });

      objectActionButtons.duplicate?.addEventListener('click', () => {
        const workspaceState = readWorkspaceState();
        const projectedLayerId = getSelectedWorkspaceLayerId(workspaceState);

        if (projectedLayerId && typeof editor.duplicateWorkspaceSelectionById === 'function') {
          editor.duplicateWorkspaceSelectionById(projectedLayerId);
          return;
        }

        editor.duplicateSelected();
      });

      objectActionButtons.bringForward?.addEventListener('click', () => {
        const workspaceState = readWorkspaceState();
        const projectedLayerId = getSelectedWorkspaceLayerId(workspaceState);

        if (projectedLayerId && typeof editor.bringWorkspaceLayerForwardById === 'function') {
          editor.bringWorkspaceLayerForwardById(projectedLayerId);
          return;
        }

        editor.bringForward();
      });

      objectActionButtons.sendBackward?.addEventListener('click', () => {
        const workspaceState = readWorkspaceState();
        const projectedLayerId = getSelectedWorkspaceLayerId(workspaceState);

        if (projectedLayerId && typeof editor.sendWorkspaceLayerBackwardById === 'function') {
          editor.sendWorkspaceLayerBackwardById(projectedLayerId);
          return;
        }

        editor.sendBackward();
      });
    }

    function initialize() {
      bindPanelEvents();
      bindPropertyEvents();
      bindObjectActionEvents();

      if (fontFamilySelect) {
        populateSupportedFontOptions(editor?.currentFont || fontFamilySelect.value || 'Arial');
        syncFontFamilyPreview(fontFamilySelect.value);
      }

      syncTemplateOpacityUI();
      syncBackgroundColorUI();
    }

    initialize();

    return {
      readWorkspaceState,
      getSelectedWorkspaceLayerId,
      getSelectedWorkspaceInspectorObjectId,
      syncTemplateOpacityUI,
      syncLayerOpacityUI,
      syncBackgroundColorUI,
      renderPanelShell,
      renderToolShell,
      renderWorkspaceState,
      handleSelectionChanged,
      handleLayersChanged,
    };
  }

  global.LiveryLabWorkspaceUIController = {
    createWorkspaceUIController,
  };
})(window);