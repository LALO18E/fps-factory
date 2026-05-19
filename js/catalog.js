/**
 * FPS Factory — catalog.js
 * Orquestador / Entry point.
 *
 * SOLID:
 *  - SRP: Solo conecta módulos. No contiene lógica de negocio.
 *  - DIP: Depende de abstracciones (módulos), no de implementaciones concretas.
 *
 * Este archivo es el único <script type="module"> del HTML.
 * support.js se carga antes de forma síncrona (no-module).
 */

import Store               from './modules/store.js';
import EventBus            from './modules/eventBus.js';
import { fetchCatalog, debounce } from './modules/api.js';
import { showToast }       from './modules/toast.js';
import { initModalListeners } from './modules/modal.js';
import {
  openCart, closeCart,
  renderCartDrawer, updateCartBadge, goToCheckout,
}                          from './modules/cart.js';
import {
  openAuthModal, switchTab,
  submitLogin, submitRegister, logout, restoreSession,
}                          from './modules/auth.js';
import {
  applyFilters, onCategoryChange, onSearchInput,
  onSortChange, onPriceApply, onStockChange,
  onFeaturedChange, updateCategoryCounts,
}                          from './modules/filters.js';
import {
  renderProductGrid, renderHeroFeatured, renderSkeletons,
  changeModalQty, addToCartFromModal,
}                          from './modules/render.js';
import { initParallax }    from './modules/parallax.js';

/* ═══════════════════════════════════════════════════════════
   BOOTSTRAP
══════════════════════════════════════════════════════════ */
window.addEventListener('DOMContentLoaded', async () => {

  /* 1. Hidratar store desde localStorage */
  Store.hydrate();

  /* 2. Skeletons mientras carga la API */
  renderSkeletons(6);

  /* 3. Cargar catálogo */
  let products = [];
  try {
    products = await fetchCatalog();
  } catch {
    showToast('No se pudo cargar el catálogo.', 'error');
  }

  Store.setState({ allProducts: products, filteredProducts: products });

  /* 4. Renderizar UI inicial */
  renderProductGrid(products);
  renderHeroFeatured(products);
  updateCategoryCounts(products);

  /* 5. Restaurar sesión y badge del carrito */
  restoreSession();
  updateCartBadge();

  /* 6. Inicializar sistemas */
  initModalListeners();
  initParallax();
  _initNavbarScroll();
  _initEventBusSubscriptions();
  _bindDOMEvents();

  /* 7. Ocultar loading screen */
  document.getElementById('loading-screen')?.classList.add('hidden');
});

/* ═══════════════════════════════════════════════════════════
   EVENT BUS — reacciones a cambios de estado
══════════════════════════════════════════════════════════ */
function _initEventBusSubscriptions() {
  EventBus.on('filters:applied', (state) => {
    renderProductGrid(state.filteredProducts);
  });

  EventBus.on('cart:updated', () => {
    updateCartBadge();
    const drawer = document.getElementById('cart-drawer');
    if (drawer?.getAttribute('aria-hidden') === 'false') {
      renderCartDrawer();
    }
  });
}

/* ═══════════════════════════════════════════════════════════
   DOM EVENT BINDING
══════════════════════════════════════════════════════════ */
function _bindDOMEvents() {

  /* Navbar */
  document.getElementById('btn-open-auth')
    ?.addEventListener('click', () => openAuthModal('login'));
  document.getElementById('btn-open-register')
    ?.addEventListener('click', () => openAuthModal('register'));
  document.getElementById('user-pill')
    ?.addEventListener('click', logout);
  document.getElementById('cart-btn')
    ?.addEventListener('click', openCart);
  document.getElementById('cart-overlay')
    ?.addEventListener('click', closeCart);

  /* Búsqueda */
  document.getElementById('search-input')
    ?.addEventListener('input', debounce(onSearchInput, 250));

  /* Ordenamiento */
  document.getElementById('sort-select')
    ?.addEventListener('change', onSortChange);

  /* Filtros sidebar */
  document.querySelectorAll('[data-filter-cat]')
    .forEach(cb => cb.addEventListener('change', onCategoryChange));
  document.getElementById('filter-in-stock')
    ?.addEventListener('change', onStockChange);
  document.getElementById('filter-featured')
    ?.addEventListener('change', onFeaturedChange);
  document.getElementById('btn-apply-price')
    ?.addEventListener('click', onPriceApply);
  ['price-min', 'price-max'].forEach(id =>
    document.getElementById(id)
      ?.addEventListener('keydown', e => { if (e.key === 'Enter') onPriceApply(); })
  );

  /* Cart drawer */
  document.getElementById('cart-close-btn')
    ?.addEventListener('click', closeCart);
  document.getElementById('btn-checkout')
    ?.addEventListener('click', goToCheckout);

  /* Auth modal */
  document.getElementById('tab-login')
    ?.addEventListener('click', () => switchTab('login'));
  document.getElementById('tab-register')
    ?.addEventListener('click', () => switchTab('register'));
  document.getElementById('btn-login')
    ?.addEventListener('click', submitLogin);
  document.getElementById('btn-register')
    ?.addEventListener('click', submitRegister);
  document.getElementById('panel-login')
    ?.addEventListener('keydown', e => { if (e.key === 'Enter') submitLogin(); });
  document.getElementById('panel-register')
    ?.addEventListener('keydown', e => { if (e.key === 'Enter') submitRegister(); });

  /* Cerrar modales con sus propios botones */
  document.getElementById('close-modal-product')
    ?.addEventListener('click', () => closeModal('modal-product'));
  document.getElementById('close-modal-auth')
    ?.addEventListener('click', () => closeModal('modal-auth'));

  /* Product modal */
  document.getElementById('btn-modal-add-cart')
    ?.addEventListener('click', addToCartFromModal);
  document.getElementById('qty-dec')
    ?.addEventListener('click', () => changeModalQty(-1));
  document.getElementById('qty-inc')
    ?.addEventListener('click', () => changeModalQty(1));

  /* Hero CTAs */
  document.getElementById('btn-hero-catalog')
    ?.addEventListener('click', () =>
      document.getElementById('main-layout')
        ?.scrollIntoView({ behavior: 'smooth' })
    );
  document.getElementById('btn-hero-register')
    ?.addEventListener('click', () => openAuthModal('register'));
}

/* ═══════════════════════════════════════════════════════════
   NAVBAR SCROLL EFFECT
══════════════════════════════════════════════════════════ */
function _initNavbarScroll() {
  const navbar   = document.getElementById('navbar');
  if (!navbar) return;
  const opts     = window.FPSSupport?.passiveEvents ? { passive: true } : false;
  window.addEventListener('scroll', () =>
    navbar.classList.toggle('scrolled', window.scrollY > 10), opts);
}
