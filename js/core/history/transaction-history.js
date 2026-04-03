(function (global) {
  const OPERATION_TYPES = Object.freeze({
    STROKE_COMMIT: 'document.stroke.commit',
    FILL_APPLY: 'document.fill.apply',
    LAYER_ADD: 'document.layer.add',
    LAYER_REMOVE: 'document.layer.remove',
    LAYER_VISIBILITY_SET: 'document.layer.visibility.set',
    LAYER_OPACITY_SET: 'document.layer.opacity.set',
    LAYER_ORDER_SET: 'document.layer.order.set',
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

      return activeTransaction.name === meta.name
        && activeTransaction.coalesceKey === meta.coalesceKey
        && (Date.now() - activeTransaction.lastTouchedAt) <= coalesceWindowMs;
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
        beforeSnapshot: meta.beforeSnapshot || null,
        beforeSelectedObjectId: meta.beforeSelectedObjectId || null,
        beforeActiveLayerId: meta.beforeActiveLayerId || null,
        renderInvalidation: cloneJson(meta.renderInvalidation) || null,
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

      const committedAt = Date.now();
      const entry = {
        transactionId: activeTransaction.transactionId,
        name: activeTransaction.name,
        label: activeTransaction.label,
        coalesceKey: activeTransaction.coalesceKey,
        reversibility: activeTransaction.reversibility,
        checkpointBoundary: activeTransaction.checkpointBoundary,
        renderInvalidation: cloneJson(activeTransaction.renderInvalidation),
        operations: cloneJson(activeTransaction.operations),
        operationCount: activeTransaction.operations.length,
        beforeSnapshot: activeTransaction.beforeSnapshot,
        afterSnapshot: context.afterSnapshot || null,
        beforeSelectedObjectId: activeTransaction.beforeSelectedObjectId,
        afterSelectedObjectId: context.afterSelectedObjectId || null,
        beforeActiveLayerId: activeTransaction.beforeActiveLayerId,
        afterActiveLayerId: context.afterActiveLayerId || null,
        startedAt: activeTransaction.startedAt,
        committedAt,
        commitReason: context.commitReason || 'explicit',
        snapshotBoundary: 'transitional-fabric-json',
      };

      activeTransaction = null;

      if (!entry.beforeSnapshot || !entry.afterSnapshot || entry.beforeSnapshot === entry.afterSnapshot) {
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