(function attachLiveryLabAppStore(global) {
  const VALID_EXPORT_SIZES = new Set([1024, 2048]);

  function normalizeExportSize(value) {
    const parsed = Number.parseInt(value, 10);
    return VALID_EXPORT_SIZES.has(parsed) ? parsed : 2048;
  }

  function createInitialState(initialState = {}) {
    return {
      shell: {
        modal: {
          activeModal: initialState.activeModal || null,
        },
        preferences: {
          exportSize: normalizeExportSize(initialState.exportSize),
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
  };

  global.LiveryLabAppStore = {
    createAppStore,
    normalizeExportSize,
    registerHandlers,
    selectors,
  };
})(window);