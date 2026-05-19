/**
 * FPS Factory — EventBus
 * Implementación de patrón pub/sub para desacoplar módulos.
 *
 * SOLID:
 *  - SRP: Solo gestiona suscripciones y emisión de eventos.
 *  - DIP: Los módulos dependen de esta abstracción, no entre sí.
 *
 * Uso:
 *   import EventBus from './eventBus.js';
 *   EventBus.on('cart:updated', handler);
 *   EventBus.emit('cart:updated', { items: [] });
 *   EventBus.off('cart:updated', handler);
 */

const EventBus = (() => {
  /** @type {Map<string, Set<Function>>} */
  const listeners = new Map();

  return {
    /**
     * Suscribirse a un evento.
     * @param {string}   event  - Nombre del evento
     * @param {Function} handler - Callback a ejecutar
     */
    on(event, handler) {
      if (!listeners.has(event)) {
        listeners.set(event, new Set());
      }
      listeners.get(event).add(handler);
    },

    /**
     * Desuscribirse de un evento.
     * @param {string}   event
     * @param {Function} handler
     */
    off(event, handler) {
      if (listeners.has(event)) {
        listeners.get(event).delete(handler);
      }
    },

    /**
     * Emitir un evento con datos opcionales.
     * @param {string} event
     * @param {*}      [data]
     */
    emit(event, data) {
      if (listeners.has(event)) {
        listeners.get(event).forEach(handler => {
          try {
            handler(data);
          } catch (err) {
            console.error(`[EventBus] Error en handler de "${event}":`, err);
          }
        });
      }
    },

    /**
     * Suscribirse una sola vez.
     * @param {string}   event
     * @param {Function} handler
     */
    once(event, handler) {
      const wrapper = (data) => {
        handler(data);
        this.off(event, wrapper);
      };
      this.on(event, wrapper);
    },
  };
})();

export default EventBus;
