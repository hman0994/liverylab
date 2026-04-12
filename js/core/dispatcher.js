(function attachLiveryLabDispatcher(global) {
  function createDispatcher() {
    const handlersByType = new Map();

    function register(type, handler) {
      if (!type || typeof handler !== 'function') {
        throw new Error('Dispatcher.register requires a command type and handler.');
      }

      const handlers = handlersByType.get(type) || [];
      handlers.push(handler);
      handlersByType.set(type, handlers);

      return () => {
        const nextHandlers = (handlersByType.get(type) || []).filter((candidate) => candidate !== handler);

        if (nextHandlers.length) {
          handlersByType.set(type, nextHandlers);
          return;
        }

        handlersByType.delete(type);
      };
    }

    async function dispatch(type, payload = {}) {
      const handlers = handlersByType.get(type) || [];
      const event = { type, payload };
      const results = [];

      for (const handler of handlers) {
        results.push(await handler(event));
      }

      return results;
    }

    return {
      register,
      dispatch,
    };
  }

  global.LiveryLabDispatcher = {
    createDispatcher,
  };
})(window);