(function attachLiveryLabAppStore(global) {
  const VALID_EXPORT_SIZES = new Set([1024, 2048]);
  const VALID_ACTIVE_TOOLS = new Set(['select', 'brush', 'eraser', 'fill', 'rect', 'circle', 'line', 'gradient', 'text']);
  const DEFAULT_ACTIVE_TOOL = 'select';
  const DEFAULT_PICKER_CATEGORY = 'All';
  const DEFAULT_CAR_PROJECTION_SIZE = 2048;
  const VALID_PANEL_NAMES = new Set(['properties', 'layers']);

  function normalizeExportSize(value) {
    const parsed = Number.parseInt(value, 10);
    return VALID_EXPORT_SIZES.has(parsed) ? parsed : 2048;
  }

  function normalizeActiveTool(value) {
    if (typeof value !== 'string') return DEFAULT_ACTIVE_TOOL;

    const normalizedValue = value.trim();
    return VALID_ACTIVE_TOOLS.has(normalizedValue) ? normalizedValue : DEFAULT_ACTIVE_TOOL;
  }

  function normalizePickerCategory(value) {
    return typeof value === 'string' && value.trim() ? value.trim() : DEFAULT_PICKER_CATEGORY;
  }

  function normalizePickerSearchQuery(value) {
    return typeof value === 'string' ? value : '';
  }

  function normalizeProjectionDimension(value) {
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_CAR_PROJECTION_SIZE;
  }

  function normalizeCarProjection(value) {
    const carProjection = value && typeof value === 'object' ? value : {};

    return {
      name: typeof carProjection.name === 'string' ? carProjection.name : '',
      file: typeof carProjection.file === 'string' ? carProjection.file : '',
      folder: typeof carProjection.folder === 'string' ? carProjection.folder : '',
      width: normalizeProjectionDimension(carProjection.width),
      height: normalizeProjectionDimension(carProjection.height),
    };
  }

  function normalizeRecentCarFiles(value) {
    const recentCarFiles = Array.isArray(value) ? value : [];
    const seenFiles = new Set();

    return recentCarFiles.filter((file) => {
      if (typeof file !== 'string') return false;

      const normalizedFile = file.trim();
      if (!normalizedFile || seenFiles.has(normalizedFile)) {
        return false;
      }

      seenFiles.add(normalizedFile);
      return true;
    });
  }

  function normalizePanelName(value) {
    if (typeof value !== 'string') return '';

    const normalizedValue = value.trim().toLowerCase();
    return VALID_PANEL_NAMES.has(normalizedValue) ? normalizedValue : '';
  }

  function getPanelOpenKey(panelName) {
    if (panelName === 'properties') return 'propertiesOpen';
    if (panelName === 'layers') return 'layersOpen';
    return '';
  }

  function normalizePanelsState(value) {
    const panels = value && typeof value === 'object' ? value : {};

    return {
      propertiesOpen: panels.propertiesOpen !== false,
      layersOpen: panels.layersOpen !== false,
    };
  }

  function arraysEqual(left, right) {
    if (left === right) return true;
    if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) {
      return false;
    }

    return left.every((value, index) => value === right[index]);
  }

  function carProjectionsEqual(left, right) {
    return !!left && !!right &&
      left.name === right.name &&
      left.file === right.file &&
      left.folder === right.folder &&
      left.width === right.width &&
      left.height === right.height;
  }

  function getExportFolder(folder) {
    return folder || 'your_car_folder';
  }

  function createInitialState(initialState = {}) {
    const initialPickerState = initialState.picker || {};

    return {
      shell: {
        modal: {
          activeModal: initialState.activeModal || null,
        },
        preferences: {
          exportSize: normalizeExportSize(initialState.exportSize),
        },
        tool: {
          active: normalizeActiveTool(initialState.activeTool),
        },
        panels: normalizePanelsState(initialState.panels),
        carProjection: normalizeCarProjection(initialState.carProjection),
        picker: {
          activeCategory: normalizePickerCategory(initialPickerState.activeCategory),
          searchQuery: normalizePickerSearchQuery(initialPickerState.searchQuery),
          isDropdownOpen: initialPickerState.isDropdownOpen === true,
          recentCarFiles: normalizeRecentCarFiles(initialPickerState.recentCarFiles),
        },
      },
    };
  }

  function createAppStore(initialState = {}) {
    let state = createInitialState(initialState);
    const listeners = new Set();

    function getState() {
      return state;
    }

    function setState(updater) {
      const nextState = typeof updater === 'function' ? updater(state) : updater;

      if (!nextState || nextState === state) {
        return state;
      }

      state = nextState;
      listeners.forEach((listener) => listener(state));
      return state;
    }

    function subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    }

    return {
      getState,
      setState,
      subscribe,
    };
  }

  function updateShellState(state, updater) {
    const nextShell = updater(state.shell);

    if (!nextShell || nextShell === state.shell) {
      return state;
    }

    return {
      ...state,
      shell: nextShell,
    };
  }

  function updatePickerState(state, updater) {
    return updateShellState(state, (shell) => {
      const nextPicker = updater(shell.picker);

      if (!nextPicker || nextPicker === shell.picker) {
        return shell;
      }

      return {
        ...shell,
        picker: nextPicker,
      };
    });
  }

  function updateToolState(state, updater) {
    return updateShellState(state, (shell) => {
      const nextToolState = updater(shell.tool);

      if (!nextToolState || nextToolState === shell.tool) {
        return shell;
      }

      return {
        ...shell,
        tool: nextToolState,
      };
    });
  }

  function updatePanelsState(state, updater) {
    return updateShellState(state, (shell) => {
      const nextPanelsState = updater(shell.panels);

      if (!nextPanelsState || nextPanelsState === shell.panels) {
        return shell;
      }

      return {
        ...shell,
        panels: nextPanelsState,
      };
    });
  }

  function registerHandlers(dispatcher, store) {
    dispatcher.register('app.modal.open', ({ payload }) => {
      const modal = payload?.modal;
      if (!modal) return null;

      return store.setState((state) => {
        if (state.shell.modal.activeModal === modal) {
          return state;
        }

        return updateShellState(state, (shell) => ({
          ...shell,
          modal: {
            ...shell.modal,
            activeModal: modal,
          },
        }));
      });
    });

    dispatcher.register('app.modal.close', ({ payload }) => {
      const modal = payload?.modal || null;

      return store.setState((state) => {
        if (!state.shell.modal.activeModal) {
          return state;
        }

        if (modal && state.shell.modal.activeModal !== modal) {
          return state;
        }

        return updateShellState(state, (shell) => ({
          ...shell,
          modal: {
            ...shell.modal,
            activeModal: null,
          },
        }));
      });
    });

    dispatcher.register('app.export.size.set', ({ payload }) => {
      const exportSize = normalizeExportSize(payload?.size);

      return store.setState((state) => {
        if (state.shell.preferences.exportSize === exportSize) {
          return state;
        }

        return updateShellState(state, (shell) => ({
          ...shell,
          preferences: {
            ...shell.preferences,
            exportSize,
          },
        }));
      });
    });

    dispatcher.register('app.tool.set', ({ payload }) => {
      const activeTool = normalizeActiveTool(payload?.tool);

      return store.setState((state) => updateToolState(state, (toolState) => {
        if (toolState.active === activeTool) {
          return toolState;
        }

        return {
          ...toolState,
          active: activeTool,
        };
      }));
    });

    dispatcher.register('app.panel.toggle', ({ payload }) => {
      const panelName = normalizePanelName(payload?.panel);
      const panelOpenKey = getPanelOpenKey(panelName);
      if (!panelOpenKey) return null;

      return store.setState((state) => updatePanelsState(state, (panelsState) => ({
        ...panelsState,
        [panelOpenKey]: !panelsState[panelOpenKey],
      })));
    });

    dispatcher.register('app.car.project', ({ payload }) => {
      const carProjection = normalizeCarProjection(payload?.carProjection);

      return store.setState((state) => updateShellState(state, (shell) => {
        if (carProjectionsEqual(shell.carProjection, carProjection)) {
          return shell;
        }

        return {
          ...shell,
          carProjection,
        };
      }));
    });

    dispatcher.register('app.picker.reset', () => {
      return store.setState((state) => updatePickerState(state, (picker) => {
        if (
          picker.activeCategory === DEFAULT_PICKER_CATEGORY &&
          picker.searchQuery === '' &&
          picker.isDropdownOpen === false
        ) {
          return picker;
        }

        return {
          ...picker,
          activeCategory: DEFAULT_PICKER_CATEGORY,
          searchQuery: '',
          isDropdownOpen: false,
        };
      }));
    });

    dispatcher.register('app.picker.category.set', ({ payload }) => {
      const activeCategory = normalizePickerCategory(payload?.category);

      return store.setState((state) => updatePickerState(state, (picker) => {
        if (picker.activeCategory === activeCategory) {
          return picker;
        }

        return {
          ...picker,
          activeCategory,
        };
      }));
    });

    dispatcher.register('app.picker.search.set', ({ payload }) => {
      const searchQuery = normalizePickerSearchQuery(payload?.query);

      return store.setState((state) => updatePickerState(state, (picker) => {
        if (picker.searchQuery === searchQuery) {
          return picker;
        }

        return {
          ...picker,
          searchQuery,
        };
      }));
    });

    dispatcher.register('app.picker.dropdown.open', () => {
      return store.setState((state) => updatePickerState(state, (picker) => {
        if (picker.isDropdownOpen) {
          return picker;
        }

        return {
          ...picker,
          isDropdownOpen: true,
        };
      }));
    });

    dispatcher.register('app.picker.dropdown.close', () => {
      return store.setState((state) => updatePickerState(state, (picker) => {
        if (!picker.isDropdownOpen) {
          return picker;
        }

        return {
          ...picker,
          isDropdownOpen: false,
        };
      }));
    });

    dispatcher.register('app.picker.recent.set', ({ payload }) => {
      const recentCarFiles = normalizeRecentCarFiles(payload?.files);

      return store.setState((state) => updatePickerState(state, (picker) => {
        if (arraysEqual(picker.recentCarFiles, recentCarFiles)) {
          return picker;
        }

        return {
          ...picker,
          recentCarFiles,
        };
      }));
    });

    dispatcher.register('app.picker.recent.remember', ({ payload }) => {
      const rememberedFile = typeof payload?.file === 'string' ? payload.file.trim() : '';
      if (!rememberedFile) return null;

      const requestedMaxItems = Number.parseInt(payload?.maxItems, 10);
      const maxItems = Number.isFinite(requestedMaxItems) && requestedMaxItems > 0 ? requestedMaxItems : 5;

      return store.setState((state) => updatePickerState(state, (picker) => {
        const recentCarFiles = normalizeRecentCarFiles([rememberedFile, ...picker.recentCarFiles]).slice(0, maxItems);
        if (arraysEqual(picker.recentCarFiles, recentCarFiles)) {
          return picker;
        }

        return {
          ...picker,
          recentCarFiles,
        };
      }));
    });
  }

  const selectors = {
    selectShellState(state) {
      return state.shell;
    },
    selectModalState(state) {
      return state.shell.modal;
    },
    selectActiveModal(state) {
      return state.shell.modal.activeModal;
    },
    isModalOpen(state, modalName) {
      return selectors.selectActiveModal(state) === modalName;
    },
    selectShellPreferences(state) {
      return state.shell.preferences;
    },
    selectExportSize(state) {
      return selectors.selectShellPreferences(state).exportSize;
    },
    selectPersistentShellPreferences(state) {
      return {
        exportSize: selectors.selectExportSize(state),
        panels: normalizePanelsState(selectors.selectPanelsState(state)),
      };
    },
    selectToolState(state) {
      return state.shell.tool;
    },
    selectActiveTool(state) {
      return selectors.selectToolState(state).active;
    },
    isToolActive(state, toolName) {
      return selectors.selectActiveTool(state) === normalizeActiveTool(toolName);
    },
    selectPanelsState(state) {
      return state.shell.panels;
    },
    isPanelOpen(state, panelName) {
      const panelOpenKey = getPanelOpenKey(normalizePanelName(panelName));
      if (!panelOpenKey) return true;

      return selectors.selectPanelsState(state)[panelOpenKey] !== false;
    },
    selectPropertiesPanelOpen(state) {
      return selectors.isPanelOpen(state, 'properties');
    },
    selectLayersPanelOpen(state) {
      return selectors.isPanelOpen(state, 'layers');
    },
    selectCarProjection(state) {
      return state.shell.carProjection;
    },
    selectSelectedCarFile(state) {
      return selectors.selectCarProjection(state).file;
    },
    selectSelectedCarFolder(state) {
      return selectors.selectCarProjection(state).folder;
    },
    selectCarLabel(state) {
      const carProjection = selectors.selectCarProjection(state);
      const sizeLabel = `${carProjection.width}×${carProjection.height}`;
      return carProjection.name
        ? `${carProjection.name} · ${sizeLabel}`
        : `Blank canvas · ${sizeLabel}`;
    },
    selectExportResolutionHint(state) {
      const carProjection = selectors.selectCarProjection(state);
      return `${carProjection.width}×${carProjection.height} TGA`;
    },
    selectExportFolderHint(state) {
      const folder = selectors.selectSelectedCarFolder(state);
      return `Documents\\iRacing\\paint\\${getExportFolder(folder)}\\`;
    },
    selectPickerState(state) {
      return state.shell.picker;
    },
    selectPickerCategory(state) {
      return selectors.selectPickerState(state).activeCategory;
    },
    selectPickerSearchQuery(state) {
      return selectors.selectPickerState(state).searchQuery;
    },
    isPickerDropdownOpen(state) {
      return selectors.selectPickerState(state).isDropdownOpen;
    },
    selectRecentCarFiles(state) {
      return selectors.selectPickerState(state).recentCarFiles;
    },
  };

  global.LiveryLabAppStore = {
    createAppStore,
    DEFAULT_ACTIVE_TOOL,
    DEFAULT_PICKER_CATEGORY,
    normalizeActiveTool,
    normalizeExportSize,
    normalizePanelsState,
    registerHandlers,
    selectors,
  };
})(window);