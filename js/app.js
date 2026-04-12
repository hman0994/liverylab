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
  const SHELL_PREFERENCES_STORAGE_KEY = 'liverylab.shellPreferences';
  const RECENT_CARS_STORAGE_KEY = 'liverylab.recentCars';
  const MAX_RECENT_CARS = 5;
  const initialShellPreferences = loadShellPreferences();
  const initialRecentCarFiles = loadRecentCarFiles();
  const DEFAULT_ACTIVE_TOOL = window.LiveryLabAppStore.DEFAULT_ACTIVE_TOOL || 'select';
  const appStore = window.LiveryLabAppStore.createAppStore({
    activeModal: 'template',
    activeTool: DEFAULT_ACTIVE_TOOL,
    exportSize: initialShellPreferences.exportSize,
    panels: initialShellPreferences.panels,
    carProjection: {
      width: 2048,
      height: 2048,
    },
    picker: {
      isDropdownOpen: initialRecentCarFiles.length > 0,
      recentCarFiles: initialRecentCarFiles,
    },
  });
  const shellSelectors = window.LiveryLabAppStore.selectors;
  const DEFAULT_PICKER_CATEGORY = window.LiveryLabAppStore.DEFAULT_PICKER_CATEGORY || 'All';
  window.LiveryLabAppStore.registerHandlers(dispatcher, appStore);

  function loadShellPreferences() {
    try {
      const raw = window.localStorage.getItem(SHELL_PREFERENCES_STORAGE_KEY);
      if (!raw) return {};

      const parsed = JSON.parse(raw);
      return {
        exportSize: window.LiveryLabAppStore.normalizeExportSize(parsed?.exportSize),
        panels: window.LiveryLabAppStore.normalizePanelsState(parsed?.panels),
      };
    } catch {
      return {};
    }
  }

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
  window.editor = editor;
  let availableCars = [];
  let hasLoadedCarManifest = false;
  let lastSavedShellPreferences = JSON.stringify(shellSelectors.selectPersistentShellPreferences(appStore.getState()));
  let lastSavedRecentCarFiles = JSON.stringify(shellSelectors.selectRecentCarFiles(appStore.getState()));
  let pendingProjectLoadFile = null;

  function saveShellPreferences(shellPreferences) {
    try {
      window.localStorage.setItem(SHELL_PREFERENCES_STORAGE_KEY, JSON.stringify(shellPreferences));
    } catch {
      // Ignore storage failures; the shell still works with in-memory state only.
    }
  }

  function saveRecentCarFiles(recentCarFiles) {
    try {
      window.localStorage.setItem(RECENT_CARS_STORAGE_KEY, JSON.stringify(recentCarFiles.slice(0, MAX_RECENT_CARS)));
    } catch {
      // Ignore storage failures; the picker still works without browser persistence.
    }
  }

  function arraysEqual(left, right) {
    if (left === right) return true;
    if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) {
      return false;
    }

    return left.every((value, index) => value === right[index]);
  }

  function getPickerState(state = appStore.getState()) {
    return shellSelectors.selectPickerState(state);
  }

  function getRecentCarFiles(state = appStore.getState()) {
    return shellSelectors.selectRecentCarFiles(state);
  }

  function persistShellPreferencesIfNeeded(state) {
    const shellPreferences = shellSelectors.selectPersistentShellPreferences(state);
    const nextSavedShellPreferences = JSON.stringify(shellPreferences);
    if (nextSavedShellPreferences === lastSavedShellPreferences) return;

    lastSavedShellPreferences = nextSavedShellPreferences;
    saveShellPreferences(shellPreferences);
  }

  function persistRecentCarsIfNeeded(state) {
    const recentCarFiles = getRecentCarFiles(state);
    const nextSavedRecentCarFiles = JSON.stringify(recentCarFiles);
    if (nextSavedRecentCarFiles === lastSavedRecentCarFiles) return;

    lastSavedRecentCarFiles = nextSavedRecentCarFiles;
    saveRecentCarFiles(recentCarFiles);
  }

  function syncRecentCarsWithManifest() {
    const recentCarFiles = getRecentCarFiles();
    const availableFiles = new Set(availableCars.map((car) => car.file));
    const filteredRecentCarFiles = recentCarFiles
      .filter((file) => availableFiles.has(file))
      .slice(0, MAX_RECENT_CARS);

    if (arraysEqual(filteredRecentCarFiles, recentCarFiles)) {
      return;
    }

    dispatcher.dispatch('app.picker.recent.set', { files: filteredRecentCarFiles });

    if (!filteredRecentCarFiles.length && getSelectedCategory() === DEFAULT_PICKER_CATEGORY && !shellSelectors.selectPickerSearchQuery(appStore.getState()).trim()) {
      dispatcher.dispatch('app.picker.dropdown.close');
    }
  }

  function rememberRecentCar(car) {
    if (!car?.file) return;

    dispatcher.dispatch('app.picker.recent.remember', { file: car.file, maxItems: MAX_RECENT_CARS });
  }

  function buildSelectedCarShellProjection(car = editor.getDocumentCar()) {
    return {
      name: typeof car?.name === 'string' ? car.name : '',
      file: typeof car?.file === 'string' ? car.file : '',
      folder: typeof car?.folder === 'string' ? car.folder : '',
      width: Number.isFinite(Number(car?.width)) && Number(car.width) > 0 ? Number(car.width) : editor.ART_W,
      height: Number.isFinite(Number(car?.height)) && Number(car.height) > 0 ? Number(car.height) : editor.ART_H,
    };
  }

  function syncSelectedCarShellProjection(car = editor.getDocumentCar()) {
    dispatcher.dispatch('app.car.project', {
      carProjection: buildSelectedCarShellProjection(car),
    });
  }

  function renderSelectedCarShell(state) {
    const label = document.getElementById('car-label');
    const resolutionHint = document.getElementById('export-resolution-hint');
    const folderHint = document.getElementById('export-folder-hint');

    if (label) label.textContent = shellSelectors.selectCarLabel(state);
    if (resolutionHint) resolutionHint.textContent = shellSelectors.selectExportResolutionHint(state);
    if (folderHint) folderHint.textContent = shellSelectors.selectExportFolderHint(state);
  }

  function setDocumentCar(car) {
    editor.setDocumentCar(car ? { ...car } : null);
    syncSelectedCarShellProjection(car);
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

  function getCarDisplayName(car) {
    return car.name.replace(/_/g, ' ').replace(/\s+/g, ' ').trim();
  }

  function getSelectedCategory(state = appStore.getState()) {
    return shellSelectors.selectPickerCategory(state);
  }

  function populateCarCategories(state = appStore.getState()) {
    if (!carCategoryInput) return;

    const activeCategory = getSelectedCategory(state);
    const categories = ['All', ...new Set(availableCars.map((car) => car.category).filter(Boolean).sort((a, b) => a.localeCompare(b)))];
    carCategoryInput.innerHTML = '';

    categories.forEach((category) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'car-category-chip' + (category === activeCategory ? ' active' : '');
      button.dataset.category = category;
      button.textContent = category === 'All' ? 'All Categories' : category;
      button.addEventListener('pointerdown', (e) => {
        // Keep the search input as the primary focus target so the dropdown behavior stays stable.
        e.preventDefault();
      });
      button.addEventListener('click', () => {
        dispatcher.dispatch('app.picker.category.set', { category });
        dispatcher.dispatch('app.picker.dropdown.open');
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

  function syncCarDropdownOpen(isOpen) {
    if (!carList) return;
    carList.classList.toggle('open', isOpen);
    if (isOpen) {
      syncCarDropdownPosition();
    } else {
      carList.classList.remove('open-above');
    }
  }

  function getRecentCarsForState(state = appStore.getState(), filter = shellSelectors.selectPickerSearchQuery(state)) {
    const query = filter.trim().toLowerCase();
    const selectedCategory = getSelectedCategory(state);
    const carByFile = new Map(availableCars.map((car) => [car.file, car]));

    return getRecentCarFiles(state)
      .map((file) => carByFile.get(file))
      .filter(Boolean)
      .filter((car) => selectedCategory === 'All' || car.category === selectedCategory)
      .filter((car) => !query || getCarDisplayName(car).toLowerCase().includes(query));
  }

  function createCarOptionButton(car, selectedCarFile) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'car-list-option' + (selectedCarFile === car.file ? ' selected' : '');
    button.innerHTML = `<span class="car-list-name">${getCarDisplayName(car)}</span>`;
    button.addEventListener('click', async () => {
      await dispatcher.dispatch('app.picker.search.set', { query: getCarDisplayName(car) });
      const didLoad = await loadBuiltinTemplate(car);
      if (!didLoad) return;

      await dispatcher.dispatch('app.picker.dropdown.close');
      await dispatcher.dispatch('app.modal.close', { modal: 'template' });
    });
    return button;
  }

  function appendCarSection(label, cars, selectedCarFile) {
    if (!carList || !cars.length) return;

    const sectionLabel = document.createElement('div');
    sectionLabel.className = 'car-list-section-label';
    sectionLabel.textContent = label;
    carList.appendChild(sectionLabel);

    cars.forEach((car) => {
      carList.appendChild(createCarOptionButton(car, selectedCarFile));
    });
  }

  function renderCarList(state = appStore.getState()) {
    if (!carList) return;

    const pickerState = getPickerState(state);
    const filter = pickerState.searchQuery;
    const query = filter.trim().toLowerCase();
    const selectedCategory = pickerState.activeCategory;
    const selectedCarFile = shellSelectors.selectSelectedCarFile(state);
    const filteredCars = availableCars
      .filter((car) => selectedCategory === 'All' || car.category === selectedCategory)
      .filter((car) => !query || getCarDisplayName(car).toLowerCase().includes(query));
    const recentMatches = getRecentCarsForState(state, filter);
    const recentFiles = new Set(recentMatches.map((car) => car.file));
    const matches = filteredCars.filter((car) => !recentFiles.has(car.file));

    carList.innerHTML = '';

    if (!hasLoadedCarManifest) {
      const loading = document.createElement('div');
      loading.className = 'car-list-empty';
      loading.textContent = 'Loading cars...';
      carList.appendChild(loading);
      syncCarDropdownOpen(true);
      return;
    }

    if (!pickerState.isDropdownOpen) {
      syncCarDropdownOpen(false);
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
      syncCarDropdownOpen(true);
      return;
    }

    appendCarSection('Recent Cars', recentMatches, selectedCarFile);

    if (matches.length) {
      appendCarSection(
        query ? 'All Matching Cars' : selectedCategory === 'All' ? 'All Cars' : `${selectedCategory} Cars`,
        matches,
        selectedCarFile,
      );
    }

    syncCarDropdownOpen(true);
  }

  function renderTemplateShell(state) {
    const isTemplateModalOpen = shellSelectors.isModalOpen(state, 'template');
    const searchQuery = shellSelectors.selectPickerSearchQuery(state);

    tmplModal?.classList.toggle('hidden', !isTemplateModalOpen);
    if (carSearchInput && carSearchInput.value !== searchQuery) {
      carSearchInput.value = searchQuery;
    }

    populateCarCategories(state);

    if (!isTemplateModalOpen) {
      syncCarDropdownOpen(false);
      return;
    }

    renderCarList(state);
  }

  carSearchInput?.addEventListener('input', () => {
    const query = carSearchInput.value;
    const selectedCategory = getSelectedCategory();
    const shouldOpenDropdown = !!query.trim() || selectedCategory !== DEFAULT_PICKER_CATEGORY || getRecentCarsForState(appStore.getState(), query).length > 0;

    dispatcher.dispatch('app.picker.search.set', { query });
    dispatcher.dispatch(shouldOpenDropdown ? 'app.picker.dropdown.open' : 'app.picker.dropdown.close');
  });

  carSearchInput?.addEventListener('focus', () => {
    dispatcher.dispatch('app.picker.dropdown.open');
  });

  carSearchInput?.addEventListener('click', () => {
    dispatcher.dispatch('app.picker.dropdown.open');
  });

  carSearchInput?.addEventListener('keydown', async (e) => {
    if (e.key === 'Escape') {
      await dispatcher.dispatch('app.picker.dropdown.close');
      return;
    }

    if (e.key !== 'Enter') return;

    const query = carSearchInput.value.trim().toLowerCase();
    const selectedCategory = getSelectedCategory();
    const exactMatch = availableCars.find((car) => {
      const categoryMatch = selectedCategory === DEFAULT_PICKER_CATEGORY || car.category === selectedCategory;
      return categoryMatch && getCarDisplayName(car).toLowerCase() === query;
    });
    if (!exactMatch) return;

    e.preventDefault();
    const didLoad = await loadBuiltinTemplate(exactMatch);
    if (!didLoad) return;

    await dispatcher.dispatch('app.picker.dropdown.close');
    await dispatcher.dispatch('app.modal.close', { modal: 'template' });
  });

  document.addEventListener('click', (e) => {
    if (!carSearchInput || !carList || !carCategoryInput) return;
    if (carSearchInput.contains(e.target) || carList.contains(e.target) || carCategoryInput.contains(e.target)) return;
    dispatcher.dispatch('app.picker.dropdown.close');
  });

  window.addEventListener('resize', syncCarDropdownPosition);

  btnUploadTmpl.addEventListener('click', () => fileInputTmpl.click());

  fileInputTmpl.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const didLoad = await loadTemplateFile(file);
    e.target.value = null;
    if (!didLoad) return;

    await dispatcher.dispatch('app.picker.dropdown.close');
    await dispatcher.dispatch('app.modal.close', { modal: 'template' });
  });

  /**
   * Load a template from a File object — handles PSD, TGA, and PNG/JPG.
   * Also resizes the artboard if the source dimensions differ from current.
   */
  async function loadTemplateFile(file) {
    const name = file.name.toLowerCase();
    let dataUrl = null;
    let artW = null, artH = null;

    function readTemplateDimensions(sourceUrl) {
      return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
          const width = Number(img.naturalWidth || img.width);
          const height = Number(img.naturalHeight || img.height);
          if (!Number.isFinite(width) || width <= 0 || !Number.isFinite(height) || height <= 0) {
            reject(new Error('decoded image reported invalid dimensions'));
            return;
          }
          resolve({ width, height });
        };
        img.onerror = () => reject(new Error('browser could not measure the decoded image'));
        img.src = sourceUrl;
      });
    }

    if (name.endsWith('.psd')) {
      if (!window.agPsd) {
        showToast('PSD support not loaded; please ensure the ag-psd script is available.', 'error');
        return false;
      }
      const buf = await file.arrayBuffer();
      try {
        const psd = agPsd.readPsd(buf);
        const didLoad = await editor.loadPsdLayers(psd);
        if (!didLoad) {
          workspaceUI.syncTemplateOpacityUI();
          return false;
        }
        workspaceUI.syncTemplateOpacityUI();
        const currentDocumentCar = editor.getDocumentCar();
        setDocumentCar({
          name: file.name.replace(/\.[^.]+$/, ''),
          file: file.name,
          folder: currentDocumentCar?.folder || '',
          width: psd.width,
          height: psd.height,
        });
        renderTemplateShell(appStore.getState());
        showToast(`Template loaded — ${psd.width}×${psd.height}`, 'success');
        setTimeout(() => { editor.zoomFit(); syncZoomSlider(); }, 50);
        return true;
      } catch (err) {
        showToast('Could not read PSD: ' + err.message, 'error');
        return false;
      }
      return false; // Unreachable guard; PSD branch returns above.
    } else if (name.endsWith('.tga')) {
      const buf = await file.arrayBuffer();
      try {
        dataUrl = TGA.decode(buf);
      } catch (err) {
        showToast('Could not decode TGA: ' + err.message, 'error');
        return false;
      }
    } else {
      dataUrl = await new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = (ev) => resolve(ev.target.result);
        reader.readAsDataURL(file);
      });
    }

    try {
      const dimensions = await readTemplateDimensions(dataUrl);
      artW = dimensions.width;
      artH = dimensions.height;
    } catch (err) {
      showToast('Could not read template dimensions: ' + err.message, 'error');
      return false;
    }

    const previousArtW = editor.ART_W;
    const previousArtH = editor.ART_H;
    const replacesDocumentDimensions = artW !== previousArtW || artH !== previousArtH;

    const didLoad = await editor.loadUploadedTemplate(dataUrl, {
      opacity: 0.30,
      width: artW,
      height: artH,
      fileName: file.name,
      sourceType: name.endsWith('.tga') ? 'custom-tga-upload' : 'custom-image-upload',
    });

    if (!didLoad) {
      workspaceUI.syncTemplateOpacityUI();
      return false;
    }

    if (replacesDocumentDimensions) {
      setTimeout(() => { editor.zoomFit(); syncZoomSlider(); }, 50);
    }

    workspaceUI.syncTemplateOpacityUI();
    setDocumentCar({
      name: file.name.replace(/\.[^.]+$/, ''),
      file: file.name,
      folder: '',
      width: artW,
      height: artH,
    });
    showToast(`Template loaded — ${artW}×${artH}`, 'success');
    return true;
  }

  const TEMPLATE_BASE_URL = 'https://github.com/hman0994/liverylab-templates/releases/download/templates/';

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
      const remoteFile = car.file.replaceAll(' ', '.');
      const resp = await fetch(`${TEMPLATE_BASE_URL}${encodeURIComponent(remoteFile)}`);
      if (!resp.ok) throw new Error('Template file not found');
      const buf = await resp.arrayBuffer();
      const psd = agPsd.readPsd(buf);
      const didLoad = await editor.loadPsdLayers(psd);
      if (!didLoad) {
        workspaceUI.syncTemplateOpacityUI();
        return false;
      }
      workspaceUI.syncTemplateOpacityUI();
      setDocumentCar({ ...car, width: psd.width, height: psd.height });
      rememberRecentCar(car);
      renderTemplateShell(appStore.getState());
      showToast(`${car.name} template loaded — ${psd.width}×${psd.height}`, 'success');
      setTimeout(() => { editor.zoomFit(); syncZoomSlider(); }, 50);
      return true;
    } catch (err) {
      showToast(`Could not load ${car.name}: ` + err.message, 'error');
      return false;
    }
  }

  // "Skip" button — just close without a template
  document.getElementById('btn-skip-template')?.addEventListener('click', async () => {
    await dispatcher.dispatch('app.picker.dropdown.close');
    await dispatcher.dispatch('app.modal.close', { modal: 'template' });
    if (editor.getDocumentCar()) {
      showToast('Template picker closed. Current document left unchanged.');
      return;
    }

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
        dispatcher.dispatch('app.picker.reset');
        if (getRecentCarFiles().length > 0) {
          dispatcher.dispatch('app.picker.dropdown.open');
        }
        dispatcher.dispatch('app.modal.open', { modal: 'template' });
        return;
      }

      setActiveTool(tool);
    });
  });

  function setActiveTool(toolName) {
    dispatcher.dispatch('app.tool.set', { tool: toolName });
  }

  const workspaceUI = window.LiveryLabWorkspaceUIController.createWorkspaceUIController({
    editor,
    dispatcher,
    appStore,
    shellSelectors,
    defaultActiveTool: DEFAULT_ACTIVE_TOOL,
  });

  // Keep UI in sync when editor internally switches tool (e.g. after placing a shape)
  editor.onToolChanged = (toolName) => {
    dispatcher.dispatch('app.tool.set', { tool: toolName || editor.currentTool || DEFAULT_ACTIVE_TOOL });
  };
  editor.onSelectionChanged = () => {
    workspaceUI.handleSelectionChanged();
  };
  editor.onLayersChanged = () => workspaceUI.handleLayersChanged();
  editor.onDocumentLoaded = ({ document: loadedDocument }) => {
    pendingProjectLoadFile = null;
    setDocumentCar(loadedDocument.car || null);
    syncZoomSlider();
    workspaceUI.syncTemplateOpacityUI(loadedDocument?.template?.opacity);
    workspaceUI.syncBackgroundColorUI(loadedDocument?.artboard?.backgroundColor || editor.backgroundColor);
    renderTemplateShell(appStore.getState());
    workspaceUI.renderWorkspaceState();
  };
  editor.onDocumentLoadFailed = ({ document: loadedDocument } = {}) => {
    pendingProjectLoadFile = null;
    setDocumentCar(loadedDocument?.car || editor.getDocumentCar() || null);
    workspaceUI.syncTemplateOpacityUI(loadedDocument?.template?.opacity);
    workspaceUI.syncBackgroundColorUI(loadedDocument?.artboard?.backgroundColor || editor.backgroundColor);
    renderTemplateShell(appStore.getState());
    workspaceUI.renderWorkspaceState();
  };

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

  document.addEventListener('keydown', (e) => {
    // Don't intercept shortcuts when user is typing in an input
    const tag = document.activeElement?.tagName?.toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
    if (document.activeElement?.isContentEditable) return;

    const key = String(e.key || '').toLowerCase();

    // Escape — deselect active object (skip if a modal is open or text is being edited inline)
    if (e.key === 'Escape') {
      const state = appStore.getState();
      if (shellSelectors.isModalOpen(state, 'template') || shellSelectors.isModalOpen(state, 'export')) return;
      const activeObj = editor.canvas.getActiveObject();
      if (activeObj?.isEditing) return;
      if (activeObj) {
        editor.canvas.discardActiveObject();
        editor.canvas.requestRenderAll();
      }
      return;
    }

    if ((e.ctrlKey || e.metaKey) && key === 'z') { e.preventDefault(); editor.undo(); return; }
    if ((e.ctrlKey || e.metaKey) && (key === 'y' || (e.shiftKey && key === 'z'))) { e.preventDefault(); editor.redo(); return; }
    if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      const workspaceState = workspaceUI.readWorkspaceState();
      const projectedLayerId = workspaceUI.getSelectedWorkspaceLayerId(workspaceState);
      if (projectedLayerId && typeof editor.deleteWorkspaceSelectionById === 'function') {
        if (editor.deleteWorkspaceSelectionById(projectedLayerId)) {
          return;
        }
      }
      editor.deleteSelected();
      return;
    }

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
    const activeTool = shellSelectors.selectActiveTool(state);
    if (editor.currentTool !== activeTool) {
      editor.setTool(activeTool);
    }

    workspaceUI.renderToolShell(state, workspaceUI.readWorkspaceState());
    workspaceUI.renderPanelShell(state);
    renderExportShell(state);
    renderSelectedCarShell(state);
    renderTemplateShell(state);
    persistShellPreferencesIfNeeded(state);
    persistRecentCarsIfNeeded(state);
  });

  dispatcher.register('app.export.request', async ({ payload }) => {
    await dispatcher.dispatch('app.modal.close', { modal: 'export' });

    const exportSize = shellSelectors.selectExportSize(appStore.getState());
    const exportFolder = shellSelectors.selectSelectedCarFolder(appStore.getState());

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
  document.getElementById('btn-load-project')?.addEventListener('click', () => {
    if (pendingProjectLoadFile) {
      editor.loadProject(pendingProjectLoadFile);
      return;
    }

    inputProjectFile?.click();
  });
  inputProjectFile?.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;

    pendingProjectLoadFile = file;
    const didStartLoad = editor.loadProject(file);
    if (didStartLoad) {
      e.target.value = null;
      return;
    }

    e.target.value = null;
  });

  // Close any modal on backdrop click
  document.querySelectorAll('.modal-backdrop').forEach(backdrop => {
    backdrop.addEventListener('click', async (e) => {
      if (e.target !== backdrop) return;

      if (backdrop === exportModal) {
        await dispatcher.dispatch('app.modal.close', { modal: 'export' });
        return;
      }

      if (backdrop === tmplModal) {
        await dispatcher.dispatch('app.picker.dropdown.close');
        await dispatcher.dispatch('app.modal.close', { modal: 'template' });
        return;
      }
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
  syncVersionBadge();
  syncSelectedCarShellProjection();
  workspaceUI.renderToolShell(appStore.getState());
  workspaceUI.renderPanelShell(appStore.getState());
  renderExportShell(appStore.getState());
  renderTemplateShell(appStore.getState());

  // Draw initial layers panel
  workspaceUI.renderWorkspaceState();

  availableCars = await loadCarManifest();
  hasLoadedCarManifest = true;
  syncRecentCarsWithManifest();
  renderTemplateShell(appStore.getState());

  // Zoom to fit the viewport
  setTimeout(() => {
    editor.zoomFit();
    syncZoomSlider();
  }, 100);

  console.log('%c Livery Lab ready ', 'background:#a8ff1e;color:#101508;font-weight:bold;');
});
