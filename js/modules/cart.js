/**
 * FPS Factory — Cart
 * Operaciones del carrito y renderizado del drawer.
 *
 * SOLID:
 *  - SRP: Solo gestiona el carrito. No sabe de auth ni de productos.
 *  - OCP: Nuevas reglas de negocio (ej: descuentos) se añaden
 *         sin modificar addToCart.
 */

import Store          from './store.js';
import EventBus       from './eventBus.js';
import { showToast }  from './toast.js';
import { formatMXN }  from './api.js';

const ENVIO_GRATIS_UMBRAL = 4000;   /* MXN con IVA */
const COSTO_ENVIO_STD     = 149;    /* MXN */

/* ─── Operaciones ─────────────────────────────────────── */

/**
 * Agrega un producto al carrito.
 * @param {Object} product
 * @param {number} [qty=1]
 */
export function addToCart(product, qty = 1) {
  const state    = Store.getState();
  const existing = state.cart.find(i => i.id === product.id_producto);
  const maxStock = product.stock_disponible;

  let updatedCart;

  if (existing) {
    const newQty = Math.min(existing.qty + qty, maxStock);
    if (newQty === existing.qty) {
      showToast('Has alcanzado el máximo de stock disponible.', 'warning');
      return;
    }
    updatedCart = state.cart.map(i =>
      i.id === product.id_producto ? { ...i, qty: newQty } : i
    );
  } else {
    const newItem = {
      id:         product.id_producto,
      nombre:     product.nombre,
      marca:      product.marca,
      categoria:  product.categoria,
      precio:     product.precio,
      precio_iva: product.precio_iva,
      imagen:     product.imagen_url,
      stock:      maxStock,
      qty:        Math.min(qty, maxStock),
    };
    updatedCart = [...state.cart, newItem];
  }

  Store.setState({ cart: updatedCart }, 'cart:updated');
  Store.persistCart();
  showToast(`"${product.nombre}" agregado al carrito.`, 'success');
}

/**
 * Elimina un ítem del carrito por ID de producto.
 * @param {number} productId
 */
export function removeFromCart(productId) {
  const state = Store.getState();
  const updatedCart = state.cart.filter(i => i.id !== productId);
  Store.setState({ cart: updatedCart }, 'cart:updated');
  Store.persistCart();
}

/**
 * Cambia la cantidad de un ítem.
 * @param {number} productId
 * @param {number} delta  (+1 o -1)
 */
export function changeQty(productId, delta) {
  const state = Store.getState();
  const updatedCart = state.cart.map(i => {
    if (i.id !== productId) return i;
    const newQty = Math.max(1, Math.min(i.qty + delta, i.stock));
    return { ...i, qty: newQty };
  });
  Store.setState({ cart: updatedCart }, 'cart:updated');
  Store.persistCart();
}

/* ─── Cálculos ────────────────────────────────────────── */

/**
 * Calcula los totales del carrito.
 * @param {CartItem[]} cart
 * @returns {{ subtotal, iva, totalConIva, envio, grand }}
 */
export function calcTotals(cart) {
  const subtotal    = cart.reduce((s, i) => s + i.precio * i.qty, 0);
  const iva         = subtotal * 0.16;
  const totalConIva = subtotal + iva;
  const envio       = totalConIva >= ENVIO_GRATIS_UMBRAL ? 0 : COSTO_ENVIO_STD;
  const grand       = totalConIva + envio;
  return { subtotal, iva, totalConIva, envio, grand };
}

/* ─── Drawer ──────────────────────────────────────────── */

export function openCart() {
  const drawer  = document.getElementById('cart-drawer');
  const overlay = document.getElementById('cart-overlay');
  if (!drawer || !overlay) return;

  drawer.setAttribute('aria-hidden', 'false');
  overlay.setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden';

  renderCartDrawer();

  /* Mover foco al botón de cerrar */
  const closeBtn = drawer.querySelector('.cart-close-btn');
  if (closeBtn) closeBtn.focus();
}

export function closeCart() {
  const drawer  = document.getElementById('cart-drawer');
  const overlay = document.getElementById('cart-overlay');
  if (!drawer || !overlay) return;

  drawer.setAttribute('aria-hidden', 'true');
  overlay.setAttribute('aria-hidden', 'true');
  document.body.style.overflow = '';
}

/* ─── Render ──────────────────────────────────────────── */

export function renderCartDrawer() {
  const list   = document.getElementById('cart-items-list');
  const footer = document.getElementById('cart-footer');
  if (!list || !footer) return;

  const { cart } = Store.getState();

  if (cart.length === 0) {
    list.innerHTML = `
      <div class="cart-empty-state" role="status">
        <div class="cart-empty-icon" aria-hidden="true">
          <i data-lucide="shopping-cart" width="52" height="52"></i>
        </div>
        <p class="cart-empty-title">Tu carrito está vacío</p>
        <p style="font-size:0.8rem;margin-top:6px;color:var(--text-muted)">
          Agrega productos para comenzar
        </p>
      </div>`;
    footer.hidden = true;
    if (window.lucide) window.lucide.createIcons({ nodes: [list] });
    return;
  }

  footer.hidden = false;

  list.innerHTML = cart.map(item => `
    <article class="cart-item" aria-label="${item.nombre}">
      <img class="cart-item-img"
           src="${item.imagen || ''}"
           alt="${item.nombre}"
           width="64" height="64"
           loading="lazy"
           onerror="this.src='https://placehold.co/64/0f1623/00d2ff?text=FPS'">
      <div class="cart-item-body">
        <p class="cart-item-name" title="${item.nombre}">${item.nombre}</p>
        <p class="cart-item-cat">${item.categoria}</p>
        <div class="cart-item-controls">
          <button class="cart-qty-btn"
                  aria-label="Disminuir cantidad de ${item.nombre}"
                  data-action="dec"
                  data-id="${item.id}">−</button>
          <span class="cart-qty-val" aria-label="Cantidad: ${item.qty}">${item.qty}</span>
          <button class="cart-qty-btn"
                  aria-label="Aumentar cantidad de ${item.nombre}"
                  data-action="inc"
                  data-id="${item.id}">+</button>
          <span class="cart-item-price">${formatMXN(item.precio_iva * item.qty)}</span>
        </div>
      </div>
      <button class="cart-item-remove"
              aria-label="Eliminar ${item.nombre} del carrito"
              data-action="remove"
              data-id="${item.id}">
        <i data-lucide="x" width="14" height="14" aria-hidden="true"></i>
      </button>
    </article>
  `).join('');

  /* Totales */
  const { subtotal, iva, envio, grand } = calcTotals(cart);

  document.getElementById('cart-subtotal').textContent = formatMXN(subtotal);
  document.getElementById('cart-iva').textContent      = formatMXN(iva);
  document.getElementById('cart-total').textContent    = formatMXN(grand);

  const note = document.getElementById('cart-shipping-note');
  if (note) {
    const totalConIva = subtotal + iva;
    if (envio === 0) {
      note.innerHTML = `🚚 <span class="cart-shipping-free">¡Envío gratis!</span> Tu pedido supera los $4,000 MXN`;
    } else {
      const faltante = ENVIO_GRATIS_UMBRAL - totalConIva;
      note.innerHTML = `Agrega ${formatMXN(faltante)} más para <span class="cart-shipping-free">envío gratis</span>`;
    }
  }

  if (window.lucide) window.lucide.createIcons({ nodes: [list] });

  /* Delegación de eventos en la lista */
  _bindCartListEvents(list);
}

/* ─── Delegación de eventos del drawer ───────────────── */
function _bindCartListEvents(list) {
  /* Limpiar listeners previos clonando el nodo */
  const fresh = list.cloneNode(true);
  list.parentNode.replaceChild(fresh, list);

  /* Re-renderizar iconos en el nodo fresco */
  if (window.lucide) window.lucide.createIcons({ nodes: [fresh] });

  fresh.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;

    const id     = parseInt(btn.dataset.id, 10);
    const action = btn.dataset.action;

    if (action === 'inc')    changeQty(id, 1);
    if (action === 'dec')    changeQty(id, -1);
    if (action === 'remove') removeFromCart(id);

    renderCartDrawer();
  });
}

/* ─── Badge ───────────────────────────────────────────── */
export function updateCartBadge() {
  const badge = document.getElementById('cart-badge');
  if (!badge) return;

  const { cart } = Store.getState();
  const total = cart.reduce((s, i) => s + i.qty, 0);

  badge.textContent = total;
  badge.dataset.visible = total > 0 ? 'true' : 'false';

  if (total > 0) {
    badge.classList.remove('bounce');
    /* Forzar reflow para reiniciar la animación */
    void badge.offsetWidth;
    badge.classList.add('bounce');
  }
}

/* ─── Checkout gate ───────────────────────────────────── */
export function goToCheckout() {
  const { currentUser, cart } = Store.getState();

  if (cart.length === 0) {
    showToast('Tu carrito está vacío.', 'warning');
    return;
  }

  if (!currentUser) {
    closeCart();
    /* Importación dinámica para evitar ciclos */
    import('./auth.js').then(({ openAuthModal }) => openAuthModal('login'));
    showToast('Inicia sesión para continuar con tu compra.', 'info');
    return;
  }

  window.location.href = 'checkout.html';
}
