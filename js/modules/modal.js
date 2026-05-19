/**
 * FPS Factory — Modal
 * Abre/cierra modales con gestión de foco y atributos ARIA.
 *
 * SOLID:
 *  - SRP: Solo gestiona el ciclo de vida de los modales.
 *  - LSP: Cualquier elemento con .modal-overlay puede ser gestionado.
 */

/** @type {HTMLElement|null} Elemento que tenía el foco antes de abrir el modal */
let previouslyFocused = null;

/** Todos los selectores de elementos enfocables dentro de un modal */
const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ');

/**
 * Abre un modal por su ID.
 * @param {string} modalId
 */
export function openModal(modalId) {
  const overlay = document.getElementById(modalId);
  if (!overlay) return;

  previouslyFocused = document.activeElement;

  overlay.setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden';

  /* Mover foco al primer elemento enfocable dentro del modal */
  requestAnimationFrame(() => {
    const firstFocusable = overlay.querySelector(FOCUSABLE);
    if (firstFocusable) firstFocusable.focus();
  });

  /* Trap de foco */
  overlay._focusTrapHandler = (e) => _trapFocus(e, overlay);
  overlay.addEventListener('keydown', overlay._focusTrapHandler);
}

/**
 * Cierra un modal por su ID.
 * @param {string} modalId
 */
export function closeModal(modalId) {
  const overlay = document.getElementById(modalId);
  if (!overlay) return;

  overlay.setAttribute('aria-hidden', 'true');
  document.body.style.overflow = '';

  /* Limpiar trap */
  if (overlay._focusTrapHandler) {
    overlay.removeEventListener('keydown', overlay._focusTrapHandler);
    delete overlay._focusTrapHandler;
  }

  /* Restaurar foco */
  if (previouslyFocused && typeof previouslyFocused.focus === 'function') {
    previouslyFocused.focus();
    previouslyFocused = null;
  }
}

/**
 * Cierra el modal si se hizo click en el overlay (fondo).
 * @param {MouseEvent} e
 */
export function closeModalOnOverlayClick(e) {
  if (e.target === e.currentTarget) {
    closeModal(e.currentTarget.id);
  }
}

/**
 * Inicializa listeners globales de teclado (Escape) y overlay click.
 * Se llama una sola vez desde el orquestador.
 */
export function initModalListeners() {
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    /* Cerrar cualquier modal abierto */
    document.querySelectorAll('.modal-overlay[aria-hidden="false"]').forEach(m => {
      closeModal(m.id);
    });
    /* Cerrar cart drawer */
    const cart = document.getElementById('cart-drawer');
    if (cart && cart.getAttribute('aria-hidden') === 'false') {
      import('./cart.js').then(({ closeCart }) => closeCart());
    }
  });

  /* Click en overlay */
  document.querySelectorAll('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', closeModalOnOverlayClick);
  });
}

/* ─── Focus trap interno ──────────────────────────────── */
function _trapFocus(e, container) {
  if (e.key !== 'Tab') return;

  const focusables = Array.from(container.querySelectorAll(FOCUSABLE));
  if (focusables.length === 0) return;

  const first = focusables[0];
  const last  = focusables[focusables.length - 1];

  if (e.shiftKey) {
    /* Shift+Tab: si estamos en el primero, saltar al último */
    if (document.activeElement === first) {
      e.preventDefault();
      last.focus();
    }
  } else {
    /* Tab: si estamos en el último, saltar al primero */
    if (document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }
}
