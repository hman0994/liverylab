(function (global) {
  const OPERATION_TYPES = Object.freeze({
    STROKE_COMMIT: 'document.stroke.commit',
    FILL_APPLY: 'document.fill.apply',
    LAYER_ADD: 'document.layer.add',
    LAYER_REMOVE: 'document.layer.remove',
    LAYER_VISIBILITY_SET: 'document.layer.visibility.set',
    LAYER_OPACITY_SET: 'document.layer.opacity.set',
    LAYER_ORDER_SET: 'document.layer.order.set',
    OBJECT_PROPERTIES_SET: 'document.object.properties.set',
    OBJECT_TRANSFORM_SET: 'document.object.transform.set',
    TEMPLATE_LOAD: 'document.template.load',
    TEMPLATE_OPACITY_SET: 'document.template.opacity.set',
    ARTBOARD_RESIZE: 'document.artboard.resize',
    DOCUMENT_LOAD: 'io.project.load.commit',
    PSD_IMPORT: 'io.psd.import.commit',
  });

  const REVERSIBILITY = Object.freeze({
    REVERSIBLE: 'reversible',
    CHECKPOINT_ONLY: 'checkpoint-only',
    REPLAY_ONLY: 'replay-only',
  });

  const CHECKPOINT_BOUNDARIES = Object.freeze({
    PER_OPERATION: 'per-operation',
    TRANSACTION_IDLE: 'transaction-idle',
    DOCUMENT_LOAD: 'document-load',
    IMPORT_LOAD: 'import-load',
  });

  function cloneJson(value) {
    return value == null ? value : JSON.parse(JSON.stringify(value));
  }

  function buildCommittedEntry(transactionState, context = {}) {
    const committedAt = Date.now();

    return {
      transactionId: transactionState.transactionId,
      name: transactionState.name,
      label: transactionState.label,
      coalesceKey: transactionState.coalesceKey,
      reversibility: transactionState.reversibility,
      checkpointBoundary: transactionState.checkpointBoundary,
      renderInvalidation: cloneJson(transactionState.renderInvalidation),
      checkpointMetadata: cloneJson(transactionState.checkpointMetadata) || null,
      operations: cloneJson(transactionState.operations) || [],
      operationCount: Array.isArray(transactionState.operations) ? transactionState.operations.length : 0,
      beforeSnapshot: transactionState.beforeSnapshot || null,
      afterSnapshot: context.afterSnapshot || null,
      beforeSelectedObjectId: transactionState.beforeSelectedObjectId || null,
      afterSelectedObjectId: context.afterSelectedObjectId || null,
      beforeActiveLayerId: transactionState.beforeActiveLayerId || null,
      afterActiveLayerId: context.afterActiveLayerId || null,
      startedAt: transactionState.startedAt,
      committedAt,
      commitReason: context.commitReason || 'explicit',
      snapshotBoundary: 'transitional-fabric-json',
    };
  }

  function createHistorySession(options = {}) {
    const maxEntries = Number.isFinite(Number(options.maxEntries)) ? Number(options.maxEntries) : 50;
    const coalesceWindowMs = Number.isFinite(Number(options.coalesceWindowMs)) ? Number(options.coalesceWindowMs) : 250;

    let activeTransaction = null;
    let nextTransactionId = 1;
    const committedTransactions = [];

    function trimCommittedTransactions() {
      if (committedTransactions.length <= maxEntries) return;
      committedTransactions.splice(0, committedTransactions.length - maxEntries);
    }

    function hasActiveTransaction() {
      return !!activeTransaction;
    }

    function canExtendActiveTransaction(meta) {
      if (!activeTransaction || !meta) return false;

      const coalesceWindowMsOverride = Number.isFinite(Number(meta.coalesceWindowMs))
        ? Number(meta.coalesceWindowMs)
        : activeTransaction.coalesceWindowMs;

      return activeTransaction.name === meta.name
        && activeTransaction.coalesceKey === meta.coalesceKey
        && (coalesceWindowMsOverride < 0 || (Date.now() - activeTransaction.lastTouchedAt) <= coalesceWindowMsOverride);
    }

    function openTransaction(meta) {
      if (!meta || typeof meta.name !== 'string') {
        throw new Error('History transactions require a stable operation name.');
      }

      activeTransaction = {
        transactionId: nextTransactionId++,
        name: meta.name,
        label: typeof meta.label === 'string' ? meta.label : meta.name,
        coalesceKey: typeof meta.coalesceKey === 'string' ? meta.coalesceKey : meta.name,
        reversibility: meta.reversibility || REVERSIBILITY.REVERSIBLE,
        checkpointBoundary: meta.checkpointBoundary || CHECKPOINT_BOUNDARIES.PER_OPERATION,
        coalesceWindowMs: Number.isFinite(Number(meta.coalesceWindowMs)) ? Number(meta.coalesceWindowMs) : coalesceWindowMs,
        beforeSnapshot: meta.beforeSnapshot || null,
        beforeSelectedObjectId: meta.beforeSelectedObjectId || null,
        beforeActiveLayerId: meta.beforeActiveLayerId || null,
        renderInvalidation: cloneJson(meta.renderInvalidation) || null,
        checkpointMetadata: cloneJson(meta.checkpointMetadata) || null,
        operations: [],
        startedAt: Date.now(),
        lastTouchedAt: Date.now(),
      };

      return cloneJson(activeTransaction);
    }

    function recordOperation(operation) {
      if (!activeTransaction) {
        throw new Error('Cannot record a history operation without an active transaction.');
      }

      activeTransaction.operations.push(cloneJson(operation));
      activeTransaction.lastTouchedAt = Date.now();
      return activeTransaction.operations.length;
    }

    function commitActiveTransaction(context = {}) {
      if (!activeTransaction) return null;

      const entry = buildCommittedEntry(activeTransaction, context);

      activeTransaction = null;

      if (!entry.beforeSnapshot || !entry.afterSnapshot || entry.beforeSnapshot === entry.afterSnapshot) {
        return null;
      }

      committedTransactions.push(entry);
      trimCommittedTransactions();
      return cloneJson(entry);
    }

    function recordCheckpoint(meta = {}, context = {}) {
      if (activeTransaction) {
        throw new Error('Cannot record a checkpoint entry while a history transaction is active.');
      }

      if (!meta || typeof meta.name !== 'string') {
        throw new Error('Checkpoint entries require a stable operation name.');
      }

      const startedAt = Date.now();
      const entry = buildCommittedEntry({
        transactionId: nextTransactionId++,
        name: meta.name,
        label: typeof meta.label === 'string' ? meta.label : meta.name,
        coalesceKey: typeof meta.coalesceKey === 'string' ? meta.coalesceKey : meta.name,
        reversibility: meta.reversibility || REVERSIBILITY.CHECKPOINT_ONLY,
        checkpointBoundary: meta.checkpointBoundary || CHECKPOINT_BOUNDARIES.PER_OPERATION,
        beforeSnapshot: meta.beforeSnapshot || null,
        beforeSelectedObjectId: meta.beforeSelectedObjectId || null,
        beforeActiveLayerId: meta.beforeActiveLayerId || null,
        renderInvalidation: cloneJson(meta.renderInvalidation) || null,
        checkpointMetadata: cloneJson(meta.checkpointMetadata) || null,
        operations: [],
        startedAt,
      }, context);

      if (!entry.afterSnapshot) {
        return null;
      }

      committedTransactions.push(entry);
      trimCommittedTransactions();
      return cloneJson(entry);
    }

    function cancelActiveTransaction(reason = 'cancelled') {
      if (!activeTransaction) return null;

      const cancelled = {
        transactionId: activeTransaction.transactionId,
        name: activeTransaction.name,
        label: activeTransaction.label,
        reason,
      };

      activeTransaction = null;
      return cancelled;
    }

    function reset() {
      activeTransaction = null;
      committedTransactions.length = 0;
    }

    function getDebugState() {
      return {
        coalesceWindowMs,
        maxEntries,
        activeTransaction: cloneJson(activeTransaction),
        committedTransactions: cloneJson(committedTransactions),
      };
    }

    return {
      hasActiveTransaction,
      canExtendActiveTransaction,
      openTransaction,
      recordOperation,
      commitActiveTransaction,
      recordCheckpoint,
      cancelActiveTransaction,
      reset,
      getDebugState,
    };
  }

  global.LiveryLabHistory = {
    OPERATION_TYPES,
    REVERSIBILITY,
    CHECKPOINT_BOUNDARIES,
    createHistorySession,
  };
})(window);