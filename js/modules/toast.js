/**
 * FPS Factory — Toast
 * Gestiona las notificaciones tipo toast.
 *
 * SOLID:
 *  - SRP: Solo crea, muestra y elimina toasts. Nada más.
 *  - OCP: Nuevos tipos se añaden al mapa de iconos sin tocar la lógica.
 */

const ICON_MAP = {
  success: 'check-circle',
  error:   'x-circle',
  info:    'info',
  warning: 'alert-triangle',
};

const DURATION_MS = 4000;

/**
 * Muestra una notificación toast.
 * @param {string} message
 * @param {'success'|'error'|'info'|'warning'} [type='info']
 */
export function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const icon = ICON_MAP[type] || ICON_MAP.info;

  const toast = document.createElement('div');
  toast.className = `toast toast--${type}`;
  toast.setAttribute('role', 'alert');
  toast.setAttribute('aria-live', 'assertive');
  toast.setAttribute('aria-atomic', 'true');

  toast.innerHTML = `
    <span class="toast-icon toast-icon--${type}" aria-hidden="true">
      <i data-lucide="${icon}" width="16" height="16"></i>
    </span>
    <span class="toast-msg">${message}</span>
  `;

  container.appendChild(toast);

  /* Renderizar icono de Lucide */
  if (window.lucide) {
    window.lucide.createIcons({ nodes: [toast] });
  }

  /* Auto-dismiss */
  const dismiss = () => {
    toast.classList.add('removing');
    toast.addEventListener('animationend', () => toast.remove(), { once: true });
    /* Fallback por si animationend no dispara */
    setTimeout(() => toast.remove(), 400);
  };

  setTimeout(dismiss, DURATION_MS);

  /* Dismiss al hacer click */
  toast.addEventListener('click', dismiss);
}
