/**
 * FPS Factory — Filters
 * Lógica de filtrado y ordenamiento del catálogo.
 *
 * SOLID:
 *  - SRP: Solo calcula qué productos deben mostrarse.
 *  - OCP: Añadir un nuevo filtro = añadir una función de predicado.
 *  - ISP: Exporta funciones independientes; el consumidor usa las que necesita.
 */

import Store    from './store.js';
import EventBus from './eventBus.js';

/* ─── Predicados de filtro (funciones puras) ─────────── */

const byCategory = (cats) => (p) =>
  cats.length === 0 || cats.includes(p.categoria);

const bySearch = (query) => (p) =>
  !query ||
  `${p.nombre} ${p.marca} ${p.categoria}`.toLowerCase().includes(query);

const byPriceMin = (min) => (p) =>
  min === null || p.precio >= min;

const byPriceMax = (max) => (p) =>
  max === null || p.precio <= max;

const byStock = (onlyInStock) => (p) =>
  !onlyInStock || p.stock_disponible > 0;

const byFeatured = (onlyFeatured) => (p) =>
  !onlyFeatured || Boolean(p.destacado);

/* ─── Comparadores de ordenamiento ──────────────────── */

const SORTERS = {
  'default':    () => 0,
  'price-asc':  (a, b) => a.precio - b.precio,
  'price-desc': (a, b) => b.precio - a.precio,
  'name-asc':   (a, b) => a.nombre.localeCompare(b.nombre, 'es'),
  'featured':   (a, b) => (b.destacado || 0) - (a.destacado || 0),
};

/* ─── Función principal ──────────────────────────────── */

/**
 * Lee el estado actual del Store, aplica todos los filtros
 * activos y emite 'filters:applied' con los resultados.
 */
export function applyFilters() {
  const {
    allProducts,
    selectedCategories,
    searchQuery,
    priceRange,
    filterInStock,
    filterFeatured,
    sortMode,
  } = Store.getState();

  const predicates = [
    byCategory(selectedCategories),
    bySearch(searchQuery),
    byPriceMin(priceRange.min),
    byPriceMax(priceRange.max),
    byStock(filterInStock),
    byFeatured(filterFeatured),
  ];

  const filtered = allProducts.filter(p =>
    predicates.every(pred => pred(p))
  );

  const sorter   = SORTERS[sortMode] || SORTERS['default'];
  const sorted   = [...filtered].sort(sorter);

  Store.setState({ filteredProducts: sorted }, 'filters:applied');
}

/* ─── Handlers para eventos del DOM ──────────────────── */

export function onCategoryChange() {
  const checked = Array.from(
    document.querySelectorAll('[data-filter-cat]:checked')
  ).map(cb => cb.dataset.filterCat);

  Store.setState({ selectedCategories: checked });
  applyFilters();
}

export function onSearchInput(e) {
  Store.setState({ searchQuery: e.target.value.toLowerCase().trim() });
  applyFilters();
}

export function onSortChange(e) {
  Store.setState({ sortMode: e.target.value });
  applyFilters();
}

export function onPriceApply() {
  const minEl = document.getElementById('price-min');
  const maxEl = document.getElementById('price-max');

  const min = minEl && minEl.value !== '' ? parseFloat(minEl.value) : null;
  const max = maxEl && maxEl.value !== '' ? parseFloat(maxEl.value) : null;

  Store.setState({ priceRange: { min, max } });
  applyFilters();
}

export function onStockChange(e) {
  Store.setState({ filterInStock: e.target.checked });
  applyFilters();
}

export function onFeaturedChange(e) {
  Store.setState({ filterFeatured: e.target.checked });
  applyFilters();
}

/* ─── Actualizar contadores del sidebar ──────────────── */

/**
 * Actualiza los contadores de categoría en el sidebar.
 * Se llama una sola vez al cargar el catálogo.
 * @param {Product[]} allProducts
 */
export function updateCategoryCounts(allProducts) {
  const countMap = allProducts.reduce((acc, p) => {
    acc[p.categoria] = (acc[p.categoria] || 0) + 1;
    return acc;
  }, {});

  document.querySelectorAll('[data-filter-cat]').forEach(cb => {
    const cat    = cb.dataset.filterCat;
    const countEl = document.getElementById(`fc-${cat.replace(/\s+/g, '-')}`);
    if (countEl) countEl.textContent = countMap[cat] || 0;
  });

  /* Fallback para "Fuente de Poder" cuyo id tiene guión */
  const fuelEl = document.getElementById('fc-Fuente-de-Poder');
  if (fuelEl) fuelEl.textContent = countMap['Fuente de Poder'] || 0;
}
