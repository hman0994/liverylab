/**
 * app.js — Livery Lab main orchestrator
 *
 * Wires together:
 *  - PaintEditor  (js/editor.js)
 *  - Export helpers (js/export.js)
 *  - TGA codec (js/vendor/tga.js)
 *  - All UI event listeners
 *
 * No build step needed — runs as a plain <script> after the libraries load.
 */

document.addEventListener('DOMContentLoaded', async () => {
  const appVersion = window.LIVERY_LAB_VERSION || { display: 'v0.0.0-dev', semver: '0.0.0-dev', channel: 'development' };
  const dispatcher = window.LiveryLabDispatcher.createDispatcher();
  const appStore = window.LiveryLabAppStore.createAppStore({ exportSize: 2048 });
  const shellSelectors = window.LiveryLabAppStore.selectors;
  window.LiveryLabAppStore.registerHandlers(dispatcher, appStore);
  const RECENT_CARS_STORAGE_KEY = 'liverylab.recentCars';
  const MAX_RECENT_CARS = 5;

  function loadRecentCarFiles() {
    try {
      const raw = window.localStorage.getItem(RECENT_CARS_STORAGE_KEY);
      if (!raw) return [];

      const recentFiles = JSON.parse(raw);
      return Array.isArray(recentFiles)
        ? recentFiles.filter((file) => typeof file === 'string').slice(0, MAX_RECENT_CARS)
        : [];
    } catch {
      return [];
    }
  }

  function syncVersionBadge() {
    const versionBadge = document.getElementById('app-version-badge');
    if (!versionBadge) return;

    versionBadge.textContent = appVersion.display || appVersion.semver || 'v0.0.0-dev';
    versionBadge.title = appVersion.targetRelease
      ? `Current app version: ${appVersion.display}. Target release: v${appVersion.targetRelease}`
      : `Current app version: ${appVersion.display}`;
  }

  /* ══════════════════════════════════════════════════════════
     1.  Initialise editor
     ══════════════════════════════════════════════════════════ */
  const editor  = new PaintEditor('paint-canvas');
  let availableCars = [];
  let selectedCar = null;
  let recentCarFiles = loadRecentCarFiles();

  function saveRecentCarFiles() {
    try {
      window.localStorage.setItem(RECENT_CARS_STORAGE_KEY, JSON.stringify(recentCarFiles.slice(0, MAX_RECENT_CARS)));
    } catch {
      // Ignore storage failures; the picker still works without browser persistence.
    }
  }

  function syncRecentCarsWithManifest() {
    const availableFiles = new Set(availableCars.map((car) => car.file));
    const filteredRecentCarFiles = recentCarFiles
      .filter((file) => availableFiles.has(file))
      .slice(0, MAX_RECENT_CARS);

    if (filteredRecentCarFiles.length === recentCarFiles.length && filteredRecentCarFiles.every((file, index) => file === recentCarFiles[index])) {
      return;
    }

    recentCarFiles = filteredRecentCarFiles;
    saveRecentCarFiles();
  }

  function rememberRecentCar(car) {
    if (!car?.file) return;

    recentCarFiles = [car.file, ...recentCarFiles.filter((file) => file !== car.file)].slice(0, MAX_RECENT_CARS);
    saveRecentCarFiles();
  }

  function getExportFolder(folder) {
    return folder || 'your_car_folder';
  }

  /** Update the topbar label and the export modal hint text with the selected car metadata. */
  function updateCarLabel(car) {
    const label = document.getElementById('car-label');
    const resolutionHint = document.getElementById('export-resolution-hint');
    const folderHint = document.getElementById('export-folder-hint');

    if (!car) {
      if (label) label.textContent = `Blank canvas · ${editor.ART_W}×${editor.ART_H}`;
      if (resolutionHint) resolutionHint.textContent = `${editor.ART_W}×${editor.ART_H} TGA`;
      if (folderHint) folderHint.textContent = `Documents\\iRacing\\paint\\${getExportFolder('')}\\`;
      return;
    }

    if (label) label.textContent = `${car.name} · ${car.width}×${car.height}`;
    if (resolutionHint) resolutionHint.textContent = `${car.width}×${car.height} TGA`;
    if (folderHint) folderHint.textContent = `Documents\\iRacing\\paint\\${getExportFolder(car.folder)}\\`;
  }

  function setSelectedCar(car) {
    selectedCar = car ? { ...car } : null;
    editor.setDocumentCar(selectedCar);
    updateCarLabel(selectedCar);
  }

  async function loadCarManifest() {
    try {
      const resp = await fetch('templates/cars.json');
      if (!resp.ok) throw new Error('cars.json not found');
      const cars = await resp.json();
      return Array.isArray(cars) ? cars : [];
    } catch (err) {
      showToast('Could not load car list: ' + err.message, 'error');
      return [];
    }
  }

  /* ══════════════════════════════════════════════════════════
     2.  Template modal
     ══════════════════════════════════════════════════════════ */
  const tmplModal        = document.getElementById('template-modal');
  const btnUploadTmpl    = document.getElementById('btn-upload-template');
  const fileInputTmpl    = document.getElementById('input-template-file');
  const carCategoryInput = document.getElementById('car-category');
  const carSearchInput   = document.getElementById('car-search');
  const carList          = document.getElementById('car-list');
  let activeCarCategory  = 'All';

  function getCarDisplayName(car) {
    return car.name.replace(/_/g, ' ').replace(/\s+/g, ' ').trim();
  }

  function getSelectedCategory() {
    return activeCarCategory;
  }

  function populateCarCategories() {
    if (!carCategoryInput) return;

    const categories = ['All', ...new Set(availableCars.map((car) => car.category).filter(Boolean).sort((a, b) => a.localeCompare(b)))];
    carCategoryInput.innerHTML = '';

    categories.forEach((category) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'car-category-chip' + (category === activeCarCategory ? ' active' : '');
      button.dataset.category = category;
      button.textContent = category === 'All' ? 'All Categories' : category;
      button.addEventListener('pointerdown', (e) => {
        // Keep the search input as the primary focus target so the dropdown behavior stays stable.
        e.preventDefault();
      });
      button.addEventListener('click', () => {
        activeCarCategory = category;
        populateCarCategories();
        renderCarList(carSearchInput?.value || '', true);
        requestAnimationFrame(() => carSearchInput?.focus());
      });
      carCategoryInput.appendChild(button);
    });
  }

  function syncCarDropdownPosition() {
    if (!carSearchInput || !carList || !carList.classList.contains('open')) return;

    const rect = carSearchInput.getBoundingClientRect();
    const viewportPadding = 24;
    const preferredHeight = 280;
    const spaceBelow = window.innerHeight - rect.bottom - viewportPadding;
    const spaceAbove = rect.top - viewportPadding;
    const shouldOpenAbove = spaceBelow < 180 && spaceAbove > spaceBelow;
    const maxHeight = Math.max(120, Math.min(preferredHeight, shouldOpenAbove ? spaceAbove - 8 : spaceBelow - 8));

    carList.style.left = `${rect.left}px`;
    carList.style.width = `${rect.width}px`;
    carList.style.maxHeight = `${maxHeight}px`;
    carList.classList.toggle('open-above', shouldOpenAbove);

    if (shouldOpenAbove) {
      carList.style.top = `${Math.max(viewportPadding, rect.top - maxHeight - 8)}px`;
    } else {
      carList.style.top = `${rect.bottom + 8}px`;
    }
  }

  function setCarDropdownOpen(isOpen) {
    if (!carList) return;
    carList.classList.toggle('open', isOpen);
    if (isOpen) {
      syncCarDropdownPosition();
    } else {
      carList.classList.remove('open-above');
    }
  }

  function getRecentCars(filter = '') {
    const query = filter.trim().toLowerCase();
    const selectedCategory = getSelectedCategory();
    const carByFile = new Map(availableCars.map((car) => [car.file, car]));

    return recentCarFiles
      .map((file) => carByFile.get(file))
      .filter(Boolean)
      .filter((car) => selectedCategory === 'All' || car.category === selectedCategory)
      .filter((car) => !query || getCarDisplayName(car).toLowerCase().includes(query));
  }

  function createCarOptionButton(car) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'car-list-option' + (selectedCar?.file === car.file ? ' selected' : '');
    button.innerHTML = `<span class="car-list-name">${getCarDisplayName(car)}</span>`;
    button.addEventListener('click', async () => {
      carSearchInput.value = getCarDisplayName(car);
      setCarDropdownOpen(false);
      closeModal(tmplModal);
      await loadBuiltinTemplate(car);
    });
    return button;
  }

  function appendCarSection(label, cars) {
    if (!carList || !cars.length) return;

    const sectionLabel = document.createElement('div');
    sectionLabel.className = 'car-list-section-label';
    sectionLabel.textContent = label;
    carList.appendChild(sectionLabel);

    cars.forEach((car) => {
      carList.appendChild(createCarOptionButton(car));
    });
  }

  function renderCarList(filter = '', openOnEmpty = false) {
    if (!carList) return;

    const query = filter.trim().toLowerCase();
    const selectedCategory = getSelectedCategory();
    const filteredCars = availableCars
      .filter((car) => selectedCategory === 'All' || car.category === selectedCategory)
      .filter((car) => !query || getCarDisplayName(car).toLowerCase().includes(query));
    const recentMatches = getRecentCars(filter);
    const recentFiles = new Set(recentMatches.map((car) => car.file));
    const matches = filteredCars.filter((car) => !recentFiles.has(car.file));

    carList.innerHTML = '';

    if (!query && selectedCategory === 'All' && !openOnEmpty && !recentMatches.length) {
      setCarDropdownOpen(false);
      return;
    }

    if (!recentMatches.length && !matches.length) {
      const empty = document.createElement('div');
      empty.className = 'car-list-empty';
      empty.textContent = selectedCategory === 'All' && !query
        ? 'No cars available.'
        : selectedCategory === 'All'
        ? 'No cars match that search.'
        : `No ${selectedCategory.toLowerCase()} cars match that search.`;
      carList.appendChild(empty);
      setCarDropdownOpen(true);
      return;
    }

    appendCarSection('Recent Cars', recentMatches);

    if (matches.length) {
      appendCarSection(
        query ? 'All Matching Cars' : selectedCategory === 'All' ? 'All Cars' : `${selectedCategory} Cars`,
        matches,
      );
    }

    setCarDropdownOpen(true);
  }

  carSearchInput?.addEventListener('input', () => {
    renderCarList(carSearchInput.value);
  });

  carSearchInput?.addEventListener('focus', () => {
    renderCarList(carSearchInput.value, true);
  });

  carSearchInput?.addEventListener('click', () => {
    renderCarList(carSearchInput.value, true);
  });

  carSearchInput?.addEventListener('keydown', async (e) => {
    if (e.key === 'Escape') {
      setCarDropdownOpen(false);
      return;
    }

    if (e.key !== 'Enter') return;

    const query = carSearchInput.value.trim().toLowerCase();
    const exactMatch = availableCars.find((car) => {
      const categoryMatch = getSelectedCategory() === 'All' || car.category === getSelectedCategory();
      return categoryMatch && getCarDisplayName(car).toLowerCase() === query;
    });
    if (!exactMatch) return;

    e.preventDefault();
    setCarDropdownOpen(false);
    closeModal(tmplModal);
    await loadBuiltinTemplate(exactMatch);
  });

  document.addEventListener('click', (e) => {
    if (!carSearchInput || !carList || !carCategoryInput) return;
    if (carSearchInput.contains(e.target) || carList.contains(e.target) || carCategoryInput.contains(e.target)) return;
    setCarDropdownOpen(false);
  });

  window.addEventListener('resize', syncCarDropdownPosition);

  btnUploadTmpl.addEventListener('click', () => fileInputTmpl.click());

  fileInputTmpl.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    e.target.value = null;

    closeModal(tmplModal);
    await loadTemplateFile(file);
  });

  /**
   * Load a template from a File object — handles PSD, TGA, and PNG/JPG.
   * Also resizes the artboard if the source dimensions differ from current.
   */
  async function loadTemplateFile(file) {
    const name = file.name.toLowerCase();
    let dataUrl = null;
    let artW = null, artH = null;

    if (name.endsWith('.psd')) {
      if (!window.agPsd) {
        showToast('PSD support not loaded; please ensure the ag-psd script is available.', 'error');
        return;
      }
      const buf = await file.arrayBuffer();
      try {
        const psd = agPsd.readPsd(buf);
        await editor.loadPsdLayers(psd);
        setSelectedCar({
          name: file.name.replace(/\.[^.]+$/, ''),
          file: file.name,
          folder: selectedCar?.folder || '',
          width: psd.width,
          height: psd.height,
        });
        renderCarList(carSearchInput?.value || '');
        showToast(`Template loaded — ${psd.width}×${psd.height}`, 'success');
        setTimeout(() => { editor.zoomFit(); syncZoomSlider(); }, 50);
      } catch (err) {
        showToast('Could not read PSD: ' + err.message, 'error');
      }
      return; // PSD fully handled — skip generic loadTemplate path
    } else if (name.endsWith('.tga')) {
      const buf = await file.arrayBuffer();
      try {
        dataUrl = TGA.decode(buf);
      } catch (err) {
        showToast('Could not decode TGA: ' + err.message, 'error');
        return;
      }
    } else {
      dataUrl = await new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = (ev) => resolve(ev.target.result);
        reader.readAsDataURL(file);
      });
    }

    // Resize artboard to match template dimensions if we know them
    if (artW && artH && (artW !== editor.ART_W || artH !== editor.ART_H)) {
      editor.resizeArtboard(artW, artH);
      setTimeout(() => { editor.zoomFit(); syncZoomSlider(); }, 50);
    }

    await editor.loadTemplate(dataUrl, 0.30);
    setSelectedCar({
      name: file.name.replace(/\.[^.]+$/, ''),
      file: file.name,
      folder: selectedCar?.folder || '',
      width: editor.ART_W,
      height: editor.ART_H,
    });
    showToast(`Template loaded (${artW || '?'}×${artH || '?'})`, 'success');
  }

  async function loadBuiltinTemplate(car) {
    if (!window.agPsd) {
      showToast('PSD support not loaded; please check your internet connection.', 'error');
      return false;
    }

    if (!car) {
      showToast('No car selected.', 'error');
      return false;
    }

    try {
      const resp = await fetch(`templates/${encodeURIComponent(car.file)}`);
      if (!resp.ok) throw new Error('Template file not found');
      const buf = await resp.arrayBuffer();
      const psd = agPsd.readPsd(buf);
      await editor.loadPsdLayers(psd);
      setSelectedCar({ ...car, width: psd.width, height: psd.height });
      rememberRecentCar(car);
      renderCarList(carSearchInput?.value || '');
      showToast(`${car.name} template loaded — ${psd.width}×${psd.height}`, 'success');
      setTimeout(() => { editor.zoomFit(); syncZoomSlider(); }, 50);
      return true;
    } catch (err) {
      showToast(`Could not load ${car.name}: ` + err.message, 'error');
      return false;
    }
  }

  // "Skip" button — just close without a template
  document.getElementById('btn-skip-template')?.addEventListener('click', () => {
    closeModal(tmplModal);
    setSelectedCar(null);
    showToast('No template loaded. You can upload one via the toolbar at any time.');
  });

  /* ══════════════════════════════════════════════════════════
     3.  Tool buttons
     ══════════════════════════════════════════════════════════ */
  const toolButtons = document.querySelectorAll('.tool-btn[data-tool]');

  toolButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const tool = btn.dataset.tool;

      // Some tools just trigger an action rather than a persistent mode
      if (tool === 'upload-image') {
        document.getElementById('input-image-file').click();
        return;
      }
      if (tool === 'load-template') {
        activeCarCategory = 'All';
        populateCarCategories();
        if (carSearchInput) carSearchInput.value = '';
        renderCarList('');
        openModal(tmplModal);
        return;
      }

      setActiveTool(tool);
    });
  });

  function setActiveTool(toolName) {
    editor.setTool(toolName);
  }

  function readWorkspaceState() {
    if (typeof editor.getWorkspaceState === 'function') {
      return editor.getWorkspaceState();
    }

    return {
      tool: {
        active: editor.currentTool,
      },
      layers: typeof editor.getLayers === 'function' ? editor.getLayers() : [],
    };
  }

  function syncToolUI(toolName) {
    // Update active state on toolbar buttons
    toolButtons.forEach(b => b.classList.toggle('active', b.dataset.tool === toolName));

    // Show/hide context-sensitive properties
    updatePropertiesPanel(toolName, editor.getActiveObject?.() || null);
  }

  function renderWorkspaceState(workspaceState = readWorkspaceState()) {
    syncToolUI(workspaceState?.tool?.active || 'select');
    renderLayersPanel(workspaceState);
  }

  // Keep UI in sync when editor internally switches tool (e.g. after placing a shape)
  editor.onToolChanged = () => renderWorkspaceState();
  editor.onDocumentLoaded = ({ document: loadedDocument }) => {
    setSelectedCar(loadedDocument.car || null);
    syncZoomSlider();
    renderCarList(carSearchInput?.value || '');
    renderWorkspaceState();
  };

  /* ══════════════════════════════════════════════════════════
     4.  Properties panel — colour, size, opacity, stroke
     ══════════════════════════════════════════════════════════ */
  const primaryColorInput   = document.getElementById('prop-primary-color');
  const brushSizeInput      = document.getElementById('prop-brush-size');
  const brushSizeVal        = document.getElementById('prop-brush-size-val');
  const opacityInput        = document.getElementById('prop-opacity');
  const opacityVal          = document.getElementById('prop-opacity-val');
  const layerOpacityInput   = document.getElementById('layer-opacity');
  const layerOpacityVal     = document.getElementById('layer-opacity-val');
  const strokeWidthInput    = document.getElementById('prop-stroke-width');
  const strokeWidthVal      = document.getElementById('prop-stroke-width-val');
  const fontFamilySelect    = document.getElementById('prop-font');
  const fontSizeInput       = document.getElementById('prop-font-size');
  const tmplOpacityInput    = document.getElementById('tmpl-opacity');
  const tmplOpacityVal      = document.getElementById('tmpl-opacity-val');
  const bgColorInput        = document.getElementById('prop-bg-color');

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

  primaryColorInput?.addEventListener('input', e => {
    editor.setPrimaryColor(e.target.value);
    editor.updateActiveColor(e.target.value);
  });

  const secondaryColorInput = document.getElementById('prop-secondary-color');
  secondaryColorInput?.addEventListener('input', e => {
    editor.setSecondaryColor(e.target.value);
    editor.updateActiveSecondaryColor(e.target.value);
  });


  brushSizeInput?.addEventListener('input', e => {
    const v = parseInt(e.target.value);
    editor.setBrushSize(v);
    if (brushSizeVal) brushSizeVal.textContent = v;
  });

  opacityInput?.addEventListener('input', e => {
    const v = parseFloat(e.target.value);
    editor.setOpacity(v);  // affects new drawings only
    if (opacityVal) opacityVal.textContent = Math.round(v * 100) + '%';
  });

  layerOpacityInput?.addEventListener('input', e => {
    const v = parseFloat(e.target.value);
    editor.setLayerOpacity(v);
    if (layerOpacityVal) layerOpacityVal.textContent = Math.round(v * 100) + '%';
  });
  layerOpacityInput?.addEventListener('change', () => editor.commitLayerOpacityChange());
  layerOpacityInput?.addEventListener('blur', () => editor.commitLayerOpacityChange());

  // Sync layer opacity slider when a layer is selected
  editor.onSelectionChanged = (obj) => {
    renderLayersPanel(readWorkspaceState());
    updatePropertiesPanel(editor.currentTool, obj || null);
    updatePropertiesFromObject(obj);
    if (layerOpacityInput && obj && !obj._isGuide && !obj._isSpecMap) {
      const op = obj.opacity !== undefined ? obj.opacity : 1;
      layerOpacityInput.value = op;
      if (layerOpacityVal) layerOpacityVal.textContent = Math.round(op * 100) + '%';
    }
  };

  strokeWidthInput?.addEventListener('input', e => {
    const v = parseInt(e.target.value);
    editor.setStrokeWidth(v);
    if (strokeWidthVal) strokeWidthVal.textContent = v;
  });

  fontFamilySelect?.addEventListener('change', e => {
    editor.setFont(e.target.value);
    syncFontFamilyPreview(e.target.value);
  });
  fontSizeInput?.addEventListener('change', e => editor.setFontSize(parseInt(e.target.value)));

  if (fontFamilySelect) {
    populateSupportedFontOptions(editor.currentFont || fontFamilySelect.value || 'Arial');
    syncFontFamilyPreview(fontFamilySelect.value);
  }

  tmplOpacityInput?.addEventListener('input', e => {
    const v = parseFloat(e.target.value);
    editor.setTemplateOpacity(v);
    if (tmplOpacityVal) tmplOpacityVal.textContent = Math.round(v * 100) + '%';
  });

  // Initialise template slider display to match default
  if (tmplOpacityVal) tmplOpacityVal.textContent = '100%';

  bgColorInput?.addEventListener('input', e => editor.setBackgroundColor(e.target.value));

  /* ══════════════════════════════════════════════════════════
     5.  Upload image decal
     ══════════════════════════════════════════════════════════ */
  const inputImageFile = document.getElementById('input-image-file');
  inputImageFile?.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
      editor.uploadImage(file);
      e.target.value = null;
    }
  });

  /* ══════════════════════════════════════════════════════════
     6.  Undo / Redo / Delete — keyboard + buttons
     ══════════════════════════════════════════════════════════ */
  document.getElementById('btn-undo')?.addEventListener('click', () => editor.undo());
  document.getElementById('btn-redo')?.addEventListener('click', () => editor.redo());
  document.getElementById('btn-delete')?.addEventListener('click', () => editor.deleteSelected());
  document.getElementById('btn-duplicate')?.addEventListener('click', () => editor.duplicateSelected());
  document.getElementById('btn-bring-fwd')?.addEventListener('click', () => editor.bringForward());
  document.getElementById('btn-send-bck')?.addEventListener('click', () => editor.sendBackward());

  document.addEventListener('keydown', (e) => {
    // Don't intercept shortcuts when user is typing in an input
    const tag = document.activeElement?.tagName?.toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
    if (document.activeElement?.isContentEditable) return;

    const key = String(e.key || '').toLowerCase();

    if ((e.ctrlKey || e.metaKey) && key === 'z') { e.preventDefault(); editor.undo(); return; }
    if ((e.ctrlKey || e.metaKey) && (key === 'y' || (e.shiftKey && key === 'z'))) { e.preventDefault(); editor.redo(); return; }
    if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); editor.deleteSelected(); return; }

    const nudgeMap = {
      ArrowUp: { dx: 0, dy: -1 },
      ArrowDown: { dx: 0, dy: 1 },
      ArrowLeft: { dx: -1, dy: 0 },
      ArrowRight: { dx: 1, dy: 0 },
    };
    if (!e.ctrlKey && !e.metaKey && !e.altKey && nudgeMap[e.key]) {
      const step = e.shiftKey ? 10 : 1;
      const move = nudgeMap[e.key];
      if (editor.nudgeSelected(move.dx * step, move.dy * step)) {
        e.preventDefault();
        return;
      }
    }

    // Tool shortcuts
    const toolMap = { v: 'select', b: 'brush', e: 'eraser', f: 'fill',
                      r: 'rect',   c: 'circle', t: 'text',  l: 'line', g: 'gradient' };
    if (!e.ctrlKey && !e.metaKey && !e.altKey && toolMap[key]) {
      e.preventDefault();
      setActiveTool(toolMap[key]);
    }
  });

  /* ══════════════════════════════════════════════════════════
     7.  Zoom controls
     ══════════════════════════════════════════════════════════ */
  const zoomSlider = document.getElementById('zoom-slider');
  const zoomLabel  = document.getElementById('zoom-label');

  zoomSlider?.addEventListener('input', e => {
    const z = parseInt(e.target.value) / 100;
    editor.setZoom(z);
    if (zoomLabel) zoomLabel.textContent = e.target.value + '%';
  });

  document.getElementById('btn-zoom-fit')?.addEventListener('click', () => {
    editor.zoomFit();
    syncZoomSlider();
  });
  document.getElementById('btn-zoom-in')?.addEventListener('click', () => {
    editor.zoomIn();
    syncZoomSlider();
  });
  document.getElementById('btn-zoom-out')?.addEventListener('click', () => {
    editor.zoomOut();
    syncZoomSlider();
  });

  // Ctrl+scroll to zoom
  document.getElementById('canvas-wrap')?.addEventListener('wheel', (e) => {
    if (!e.ctrlKey) return;
    e.preventDefault();
    if (e.deltaY < 0) editor.zoomIn(); else editor.zoomOut();
    syncZoomSlider();
  }, { passive: false });

  function syncZoomSlider() {
    const z = Math.round(editor.currentZoom * 100);
    if (zoomSlider) zoomSlider.value = z;
    if (zoomLabel)  zoomLabel.textContent = z + '%';
  }

  /* ══════════════════════════════════════════════════════════
     8.  Layers panel
     ══════════════════════════════════════════════════════════ */
  editor.onLayersChanged = () => renderLayersPanel(readWorkspaceState());
  // onSelectionChanged is set up alongside the layer-opacity slider wiring above

  function renderLayersPanel(workspaceState = readWorkspaceState()) {
    const list = document.getElementById('layers-list');
    if (!list) return;

    const layers = Array.isArray(workspaceState?.layers) ? workspaceState.layers : [];
    list.innerHTML = '';

    let currentGroup = null;

    layers.forEach((layer, visualIdx) => {
      // ── Group header ──────────────────────────────────────
      if (layer.groupName !== currentGroup) {
        currentGroup = layer.groupName;
        if (currentGroup) {
          const header = document.createElement('div');
          header.className = 'layer-group-header'
            + (layer.isGuide   ? ' guide'   : '')
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

      // Spec map layers: just the header, don't render individual rows
      if (layer.isSpecMap) return;

      // ── Layer row ─────────────────────────────────────────
      const item = document.createElement('div');
      item.className = 'layer-item' +
        (layer.selected  ? ' selected' : '') +
        (layer.locked    ? ' locked'   : '') +
        (layer.isGuide   ? ' guide'    : '') +
        (layer.groupName ? ' grouped'  : '');
      item.title = layer.name;

      // Thumbnail icon
      const thumb = document.createElement('div');
      thumb.className = 'layer-thumb';
      thumb.textContent = layer.isGuide ? '🎛' : layerIcon(layer.type);

      // Name
      const name = document.createElement('div');
      name.className = 'layer-name';
      name.textContent = layer.name;

      // Actions — visibility toggle for all layers; delete only for editable ones
      const actions = document.createElement('div');
      actions.className = 'layer-actions';

      // Eye / visibility (available on every layer, including guides)
      const visBtn = document.createElement('button');
      visBtn.className = 'icon-btn';
      visBtn.title = layer.visible ? 'Hide layer' : 'Show layer';
      visBtn.textContent = layer.visible ? '👁' : '🚫';
      visBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        editor.toggleLayerVisibility(visualIdx);
      });
      actions.appendChild(visBtn);

      // Delete — only for non-locked, non-guide layers
      if (!layer.locked && !layer.isGuide) {
        const delBtn = document.createElement('button');
        delBtn.className = 'icon-btn danger';
        delBtn.title = 'Delete layer';
        delBtn.textContent = '🗑';
        delBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          editor.deleteLayerByIndex(visualIdx);
        });
        actions.appendChild(delBtn);
      }

      item.appendChild(thumb);
      item.appendChild(name);
      item.appendChild(actions);

      item.addEventListener('click', () => editor.selectLayerByIndex(visualIdx));

      list.appendChild(item);
    });
  }

  function layerIcon(type) {
    const map = {
      'image':     '🖼',
      'rect':      '▬',
      'ellipse':   '⬭',
      'circle':    '⬤',
      'path':      '✏️',
      'i-text':    'T',
      'text':      'T',
      'line':      '╱',
      'group':     '📦',
    };
    return map[type] || '◻';
  }

  /* ══════════════════════════════════════════════════════════
     9.  Properties panel — show context-sensitive controls
     ══════════════════════════════════════════════════════════ */
  function getSelectedObjectToolContext(obj) {
    if (!obj) return null;
    const hasGradientFill = !!obj.fill && typeof obj.fill === 'object' && Array.isArray(obj.fill.colorStops);
    if (obj.type === 'i-text' || obj.type === 'text') return 'text';
    if (obj.type === 'line') return 'line';
    if ((obj.type === 'rect' || obj.type === 'image') && hasGradientFill) return 'gradient';
    if (obj.type === 'rect') return 'rect';
    if (obj.type === 'ellipse' || obj.type === 'circle') return 'circle';
    return null;
  }

  function updatePropertiesPanel(toolName, selectedObject = null) {
    const effectiveTool = toolName === 'select'
      ? (getSelectedObjectToolContext(selectedObject) || toolName)
      : toolName;

    document.querySelectorAll('.props-group').forEach(g => {
      const tools = g.dataset.tools ? g.dataset.tools.split(',') : [];
      g.classList.toggle('hidden', tools.length > 0 && !tools.includes(effectiveTool));
    });
  }

  function updatePropertiesFromObject(obj) {
    if (!obj) return;
    const primaryColor = typeof obj._primaryColor === 'string'
      ? obj._primaryColor
      : (typeof obj.fill === 'string' && obj.fill.startsWith('#')
          ? obj.fill
          : (typeof obj.stroke === 'string' && obj.stroke.startsWith('#') ? obj.stroke : null));

    if (primaryColor && primaryColorInput) {
      primaryColorInput.value = primaryColor;
      editor.setPrimaryColor(primaryColor);
    }

    if (obj.opacity !== undefined && opacityInput) {
      opacityInput.value = obj.opacity;
      if (opacityVal) opacityVal.textContent = Math.round(obj.opacity * 100) + '%';
    }

    const secondaryColor = typeof obj._secondaryColor === 'string'
      ? obj._secondaryColor
      : (typeof obj.stroke === 'string' && obj.stroke.startsWith('#') ? obj.stroke : null);

    if (secondaryColorInput && secondaryColor) {
      secondaryColorInput.value = secondaryColor;
      editor.setSecondaryColor(secondaryColor);
    }

    if ((obj.type === 'i-text' || obj.type === 'text') && fontFamilySelect && fontSizeInput) {
      if (typeof obj.fontFamily === 'string') {
        ensureFontPickerOption(obj.fontFamily);
        fontFamilySelect.value = obj.fontFamily;
        editor.setFont(obj.fontFamily);
        syncFontFamilyPreview(obj.fontFamily);
      }
      if (Number.isFinite(Number(obj.fontSize))) {
        fontSizeInput.value = String(obj.fontSize);
        editor.setFontSize(Number(obj.fontSize));
      }
    }
  }

  /* ══════════════════════════════════════════════════════════
     10. Export modal
     ══════════════════════════════════════════════════════════ */
  const exportModal = document.getElementById('export-modal');
  const exportSizeButtons = Array.from(document.querySelectorAll('.export-size-btn'));

  function renderExportShell(state) {
    const exportSize = shellSelectors.selectExportSize(state);
    const isExportModalOpen = shellSelectors.isModalOpen(state, 'export');

    exportModal?.classList.toggle('hidden', !isExportModalOpen);
    exportSizeButtons.forEach((button) => {
      const buttonSize = Number.parseInt(button.dataset.size, 10);
      button.classList.toggle('selected', buttonSize === exportSize);
    });
  }

  appStore.subscribe((state) => {
    renderExportShell(state);
  });

  dispatcher.register('app.export.request', async ({ payload }) => {
    await dispatcher.dispatch('app.modal.close', { modal: 'export' });

    const exportSize = shellSelectors.selectExportSize(appStore.getState());
    const exportFolder = selectedCar?.folder;

    if (payload?.format === 'png') {
      await exportPNG(editor, exportSize, exportFolder);
      return;
    }

    if (payload?.format === 'tga') {
      await exportTGA(editor, exportSize, exportFolder);
    }
  });

  document.getElementById('btn-open-export')?.addEventListener('click', () => {
    dispatcher.dispatch('app.modal.open', { modal: 'export' });
  });
  document.getElementById('btn-close-export')?.addEventListener('click', () => {
    dispatcher.dispatch('app.modal.close', { modal: 'export' });
  });

  exportSizeButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      dispatcher.dispatch('app.export.size.set', { size: btn.dataset.size });
    });
  });

  document.getElementById('btn-do-export-png')?.addEventListener('click', async () => {
    await dispatcher.dispatch('app.export.request', { format: 'png' });
  });

  document.getElementById('btn-do-export-tga')?.addEventListener('click', async () => {
    await dispatcher.dispatch('app.export.request', { format: 'tga' });
  });

  /* ══════════════════════════════════════════════════════════
     11. Save / Load project
     ══════════════════════════════════════════════════════════ */
  document.getElementById('btn-save-project')?.addEventListener('click', () => editor.saveProject());

  const inputProjectFile = document.getElementById('input-project-file');
  document.getElementById('btn-load-project')?.addEventListener('click', () => inputProjectFile?.click());
  inputProjectFile?.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) { editor.loadProject(file); e.target.value = null; }
  });

  /* ══════════════════════════════════════════════════════════
     12. Panel collapse toggles
     ══════════════════════════════════════════════════════════ */
  document.querySelectorAll('.panel-header[data-toggle]').forEach(hdr => {
    hdr.addEventListener('click', () => {
      const targetId = hdr.dataset.toggle;
      const target   = document.getElementById(targetId);
      if (!target) return;
      const isCollapsed = target.classList.toggle('hidden');
      hdr.classList.toggle('collapsed', isCollapsed);
    });
  });

  /* ══════════════════════════════════════════════════════════
     14. Modal helpers
     ══════════════════════════════════════════════════════════ */
  function openModal(el)  { el?.classList.remove('hidden'); }
  function closeModal(el) { el?.classList.add('hidden'); }

  // Close any modal on backdrop click
  document.querySelectorAll('.modal-backdrop').forEach(backdrop => {
    backdrop.addEventListener('click', (e) => {
      if (e.target !== backdrop) return;

      if (backdrop === exportModal) {
        dispatcher.dispatch('app.modal.close', { modal: 'export' });
        return;
      }

      closeModal(backdrop);
    });
  });

  /* ══════════════════════════════════════════════════════════
     15. Window resize
     ══════════════════════════════════════════════════════════ */
  window.addEventListener('resize', () => {
    if (preview) preview.resize();
  });

  /* ══════════════════════════════════════════════════════════
     16. Boot sequence
     ══════════════════════════════════════════════════════════ */
  // Set default tool
  setActiveTool('select');
  syncVersionBadge();
  updateCarLabel(null);
  renderExportShell(appStore.getState());

  // Draw initial layers panel
  renderWorkspaceState();

  availableCars = await loadCarManifest();
  syncRecentCarsWithManifest();
  populateCarCategories();
  renderCarList('');
  openModal(tmplModal);

  // Zoom to fit the viewport
  setTimeout(() => {
    editor.zoomFit();
    syncZoomSlider();
  }, 100);

  console.log('%c Livery Lab ready ', 'background:#a8ff1e;color:#101508;font-weight:bold;');
});
