/**
 * FPS Factory — Store
 * Estado centralizado de la aplicación (single source of truth).
 *
 * SOLID:
 *  - SRP: Solo gestiona el estado. No hace fetch ni renderiza.
 *  - OCP: Se extiende añadiendo nuevas claves al estado inicial,
 *         sin modificar setState.
 *
 * @typedef {Object}  Product
 * @typedef {Object}  CartItem
 * @typedef {Object|null} User
 */

import EventBus from './eventBus.js';

/** Estado inicial */
const initialState = {
  /** @type {Product[]} */
  allProducts: [],

  /** @type {Product[]} Resultado de filtros activos */
  filteredProducts: [],

  /** @type {CartItem[]} */
  cart: [],

  /** @type {User} */
  currentUser: null,

  /** @type {Product|null} Producto abierto en modal */
  activeProduct: null,

  /** @type {string} Modo de ordenamiento activo */
  sortMode: 'default',

  /** @type {{min: number|null, max: number|null}} */
  priceRange: { min: null, max: null },

  /** @type {string[]} Categorías seleccionadas en sidebar */
  selectedCategories: [],

  /** @type {boolean} */
  filterInStock: false,

  /** @type {boolean} */
  filterFeatured: false,

  /** @type {string} Texto de búsqueda */
  searchQuery: '',
};

const Store = (() => {
  let state = Object.assign({}, initialState);

  return {
    /**
     * Obtener una copia del estado actual.
     * @returns {typeof initialState}
     */
    getState() {
      return Object.assign({}, state);
    },

    /**
     * Actualizar parcialmente el estado y emitir evento.
     * @param {Partial<typeof initialState>} partial
     * @param {string} [eventName] - Evento a emitir (default: 'state:changed')
     */
    setState(partial, eventName = 'state:changed') {
      state = Object.assign({}, state, partial);
      EventBus.emit(eventName, state);
    },

    /**
     * Persistir y restaurar cart y user desde localStorage.
     */
    hydrate() {
      try {
        const savedCart = localStorage.getItem('fps_cart');
        const savedUser = localStorage.getItem('fps_user');

        if (savedCart) {
          state.cart = JSON.parse(savedCart);
        }
        if (savedUser) {
          state.currentUser = JSON.parse(savedUser);
        }
      } catch (e) {
        console.warn('[Store] Error al hidratar desde localStorage:', e);
      }
    },

    /**
     * Persistir el carrito en localStorage.
     */
    persistCart() {
      try {
        localStorage.setItem('fps_cart', JSON.stringify(state.cart));
      } catch (e) {
        console.warn('[Store] No se pudo guardar el carrito:', e);
      }
    },

    /**
     * Persistir el usuario en localStorage.
     */
    persistUser(user) {
      try {
        if (user) {
          localStorage.setItem('fps_user', JSON.stringify(user));
        } else {
          localStorage.removeItem('fps_user');
          localStorage.removeItem('fps_token');
        }
      } catch (e) {
        console.warn('[Store] No se pudo guardar el usuario:', e);
      }
    },
  };
})();

export default Store;
