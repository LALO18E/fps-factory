/**
 * FPS Factory — checkout.js
 * Lógica completa del proceso de pago.
 *
 * Módulos internos (IIFE pattern, sin bundler):
 *  - CartReader    → lee el carrito de localStorage (SRP)
 *  - Validator     → validación de campos (SRP)
 *  - ShippingCalc  → regla de negocio de envío (SRP)
 *  - OrderSummary  → renderiza el resumen lateral (SRP)
 *  - StepManager   → controla el avance entre pasos (SRP)
 *  - PaymentHandler→ orquesta Stripe/PayPal (SRP)
 *  - SuccessModal  → muestra la confirmación (SRP)
 *  - Toast         → notificaciones (SRP)
 *
 * SOLID aplicado:
 *  OCP  → añadir nuevo método de pago = añadir un handler, no modificar los existentes
 *  LSP  → Validator.validate() acepta cualquier configuración de campos
 *  ISP  → cada módulo expone solo lo que necesita el exterior
 *  DIP  → PaymentHandler depende de interfaces (stripe/paypal), no de SDKs directamente
 */

'use strict';

/* ═══════════════════════════════════════════════════════════
   CONSTANTES DE NEGOCIO
══════════════════════════════════════════════════════════ */
const ENVIO_GRATIS_UMBRAL = 4000;   // MXN (con IVA)
const COSTO_ENVIO_STD    = 149;     // MXN
const API_BASE           = 'http://localhost:5000/api';

/* ═══════════════════════════════════════════════════════════
   MÓDULO: CartReader
   Lee y parsea el carrito guardado en localStorage.
══════════════════════════════════════════════════════════ */
const CartReader = (() => {
  function getCart() {
    try {
      return JSON.parse(localStorage.getItem('fps_cart') || '[]');
    } catch {
      return [];
    }
  }

  function getUser() {
    try {
      return JSON.parse(localStorage.getItem('fps_user') || 'null');
    } catch {
      return null;
    }
  }

  /** @returns {{ subtotal, iva, totalConIva, envio, grand }} */
  function calcTotals(cart) {
    const subtotal    = cart.reduce((s, i) => s + i.precio * i.qty, 0);
    const iva         = subtotal * 0.16;
    const totalConIva = subtotal + iva;
    const envio       = totalConIva >= ENVIO_GRATIS_UMBRAL ? 0 : COSTO_ENVIO_STD;
    const grand       = totalConIva + envio;
    return { subtotal, iva, totalConIva, envio, grand };
  }

  return { getCart, getUser, calcTotals };
})();


/* ═══════════════════════════════════════════════════════════
   MÓDULO: Formatter
══════════════════════════════════════════════════════════ */
const Formatter = (() => {
  const fmt = new Intl.NumberFormat('es-MX', {
    style: 'currency', currency: 'MXN', minimumFractionDigits: 2,
  });
  return {
    mxn: (n) => fmt.format(n),
    orderNum: () => `FPS-${Date.now().toString(36).toUpperCase()}`,
  };
})();


/* ═══════════════════════════════════════════════════════════
   MÓDULO: Toast
══════════════════════════════════════════════════════════ */
const Toast = (() => {
  const icons = {
    success: 'check-circle',
    error:   'x-circle',
    info:    'info',
    warning: 'alert-triangle',
  };

  function show(msg, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const el = document.createElement('div');
    el.className = `toast toast--${type}`;
    el.setAttribute('role', 'alert');
    el.innerHTML = `
      <span class="toast-icon toast-icon--${type}" aria-hidden="true">
        <i data-lucide="${icons[type] || 'info'}" width="16" height="16"></i>
      </span>
      <span class="toast-msg">${msg}</span>`;
    container.appendChild(el);
    if (window.lucide) window.lucide.createIcons({ nodes: [el] });
    const dismiss = () => {
      el.classList.add('removing');
      setTimeout(() => el.remove(), 320);
    };
    setTimeout(dismiss, 4500);
    el.addEventListener('click', dismiss);
  }

  return { show };
})();


/* ═══════════════════════════════════════════════════════════
   MÓDULO: Validator
   Valida grupos de campos según reglas declarativas.
══════════════════════════════════════════════════════════ */
const Validator = (() => {
  /**
   * @typedef {{ id: string, label: string, rules: string[] }} FieldRule
   * rules: 'required' | 'email' | 'cp' | 'rfc' | 'tel' | 'minlen:N'
   */

  const PATTERNS = {
    email: /^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/,
    cp:    /^[0-9]{5}$/,
    rfc:   /^[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}$/i,
    tel:   /^[\d\s()+\-]{7,15}$/,
  };

  function getVal(id) {
    const el = document.getElementById(id);
    return el ? el.value.trim() : '';
  }

  function setInvalid(id, msg) {
    const el  = document.getElementById(id);
    const err = document.getElementById(`err-${id}`);
    if (el)  el.setAttribute('aria-invalid', 'true');
    if (err) { err.textContent = msg; err.classList.add('visible'); }
  }

  function clearField(id) {
    const el  = document.getElementById(id);
    const err = document.getElementById(`err-${id}`);
    if (el)  el.setAttribute('aria-invalid', 'false');
    if (err) { err.textContent = ''; err.classList.remove('visible'); }
  }

  /**
   * Valida un array de reglas de campo.
   * @param {FieldRule[]} fields
   * @returns {boolean} true = todo válido
   */
  function validate(fields) {
    let valid = true;

    fields.forEach(({ id, label, rules }) => {
      clearField(id);
      const val = getVal(id);

      for (const rule of rules) {
        if (rule === 'required' && !val) {
          setInvalid(id, `${label} es obligatorio.`);
          valid = false;
          break;
        }
        if (rule === 'email' && val && !PATTERNS.email.test(val)) {
          setInvalid(id, 'Ingresa un correo válido.');
          valid = false;
          break;
        }
        if (rule === 'cp' && val && !PATTERNS.cp.test(val)) {
          setInvalid(id, 'El C.P. debe tener 5 dígitos.');
          valid = false;
          break;
        }
        if (rule === 'rfc' && val && !PATTERNS.rfc.test(val)) {
          setInvalid(id, 'RFC con formato inválido.');
          valid = false;
          break;
        }
        if (rule === 'tel' && val && !PATTERNS.tel.test(val)) {
          setInvalid(id, 'Ingresa un teléfono válido.');
          valid = false;
          break;
        }
        if (rule.startsWith('minlen:')) {
          const min = parseInt(rule.split(':')[1], 10);
          if (val && val.length < min) {
            setInvalid(id, `Mínimo ${min} caracteres.`);
            valid = false;
            break;
          }
        }
      }
    });

    /* Scroll al primer campo inválido */
    if (!valid) {
      const firstInvalid = document.querySelector('[aria-invalid="true"]');
      firstInvalid?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      firstInvalid?.focus();
    }

    return valid;
  }

  return { validate, getVal };
})();


/* ═══════════════════════════════════════════════════════════
   MÓDULO: OrderSummary
   Renderiza el resumen lateral del pedido.
══════════════════════════════════════════════════════════ */
const OrderSummary = (() => {
  function render() {
    const cart                  = CartReader.getCart();
    const { subtotal, iva, envio, grand, totalConIva } = CartReader.calcTotals(cart);

    /* Items */
    const itemsEl = document.getElementById('summary-items');
    if (itemsEl) {
      if (cart.length === 0) {
        itemsEl.innerHTML = `<p style="padding:12px;color:var(--text-muted);font-size:0.85rem">
          Tu carrito está vacío.</p>`;
      } else {
        itemsEl.innerHTML = cart.map(item => `
          <div class="summary-item">
            <img class="summary-item-img"
                 src="${item.imagen || ''}"
                 alt="${item.nombre}"
                 width="48" height="48"
                 onerror="this.src='https://placehold.co/48/0f1623/00d2ff?text=FPS'">
            <p class="summary-item-name">${item.nombre}</p>
            <span class="summary-item-qty">×${item.qty}</span>
            <span class="summary-item-price">
              ${Formatter.mxn(item.precio_iva * item.qty)}
            </span>
          </div>`).join('');
      }
    }

    /* Totales */
    _setText('sum-subtotal', Formatter.mxn(subtotal));
    _setText('sum-iva',      Formatter.mxn(iva));
    _setText('sum-envio',    envio === 0 ? '🚚 Gratis' : Formatter.mxn(envio));
    _setText('sum-total',    Formatter.mxn(grand));

    /* Shipping badge */
    const badge = document.getElementById('shipping-badge');
    if (badge) {
      if (envio === 0) {
        badge.innerHTML = `🚚 <span class="free">¡Envío gratis!</span> Tu pedido supera los $4,000 MXN`;
      } else {
        const faltante = ENVIO_GRATIS_UMBRAL - totalConIva;
        badge.innerHTML = `Agrega ${Formatter.mxn(faltante)} más para <span class="free">envío gratis</span>`;
      }
    }
  }

  return { render };
})();


/* ═══════════════════════════════════════════════════════════
   MÓDULO: StepManager
   Controla la activación/desactivación de los pasos del checkout.
══════════════════════════════════════════════════════════ */
const StepManager = (() => {
  let currentStep = 1;

  const CRUMB_IDS  = ['crumb-1', 'crumb-2', 'crumb-3'];
  const SECTION_IDS= ['section-envio', 'section-pago'];

  function goTo(step) {
    currentStep = step;

    /* Breadcrumb */
    CRUMB_IDS.forEach((id, i) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.classList.remove('active', 'done');
      if (i + 1 < step) el.classList.add('done');
      if (i + 1 === step) el.classList.add('active');
    });

    /* Secciones */
    SECTION_IDS.forEach((id, i) => {
      const el = document.getElementById(id);
      if (!el) return;
      if (i + 1 <= step) {
        el.classList.remove('locked');
        el.removeAttribute('aria-disabled');
      } else {
        el.classList.add('locked');
        el.setAttribute('aria-disabled', 'true');
      }
    });

    /* Scroll suave a la sección activa */
    const activeSection = document.getElementById(SECTION_IDS[step - 1]);
    activeSection?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function getCurrent() { return currentStep; }

  return { goTo, getCurrent };
})();


/* ═══════════════════════════════════════════════════════════
   MÓDULO: CFDIPanel
   Gestiona la visibilidad y validación del panel de facturación.
══════════════════════════════════════════════════════════ */
const CFDIPanel = (() => {
  function toggle() {
    const checked = document.getElementById('check-cfdi')?.checked;
    const panel   = document.getElementById('cfdi-panel');
    if (!panel) return;
    panel.classList.toggle('visible', checked);
    panel.setAttribute('aria-hidden', String(!checked));
  }

  /**
   * Valida los campos de CFDI si fue marcado.
   * @returns {boolean}
   */
  function validate() {
    const checked = document.getElementById('check-cfdi')?.checked;
    if (!checked) return true;

    return Validator.validate([
      { id: 'cfdi-rfc',    label: 'RFC',          rules: ['required', 'rfc'] },
      { id: 'cfdi-cp',     label: 'C.P. Fiscal',   rules: ['required', 'cp'] },
      { id: 'cfdi-razon',  label: 'Razón Social',  rules: ['required'] },
      { id: 'cfdi-regimen',label: 'Régimen Fiscal', rules: ['required'] },
      { id: 'cfdi-uso',    label: 'Uso del CFDI',  rules: ['required'] },
    ]);
  }

  function getData() {
    const checked = document.getElementById('check-cfdi')?.checked;
    if (!checked) return null;
    return {
      requiere_factura: true,
      cfdi_rfc:         Validator.getVal('cfdi-rfc'),
      cfdi_razon_social:Validator.getVal('cfdi-razon'),
      cfdi_regimen:     Validator.getVal('cfdi-regimen'),
      cfdi_uso:         Validator.getVal('cfdi-uso'),
      cfdi_cp_fiscal:   Validator.getVal('cfdi-cp'),
    };
  }

  return { toggle, validate, getData };
})();


/* ═══════════════════════════════════════════════════════════
   MÓDULO: ShippingForm
   Valida y extrae el formulario de envío.
══════════════════════════════════════════════════════════ */
const ShippingForm = (() => {
  const FIELDS = [
    { id: 'env-nombre',   label: 'Nombre completo',       rules: ['required'] },
    { id: 'env-telefono', label: 'Teléfono',               rules: ['required', 'tel'] },
    { id: 'env-calle',    label: 'Calle',                  rules: ['required'] },
    { id: 'env-num-ext',  label: 'Número exterior',        rules: ['required'] },
    { id: 'env-colonia',  label: 'Colonia',                rules: ['required'] },
    { id: 'env-cp',       label: 'Código Postal',          rules: ['required', 'cp'] },
    { id: 'env-ciudad',   label: 'Ciudad',                 rules: ['required'] },
    { id: 'env-estado',   label: 'Estado',                 rules: ['required'] },
  ];

  function validate() {
    return Validator.validate(FIELDS);
  }

  function getData() {
    return {
      envio_nombre:   Validator.getVal('env-nombre'),
      envio_telefono: Validator.getVal('env-telefono'),
      envio_calle:    Validator.getVal('env-calle'),
      envio_num_ext:  Validator.getVal('env-num-ext'),
      envio_num_int:  Validator.getVal('env-num-int'),
      envio_colonia:  Validator.getVal('env-colonia'),
      envio_cp:       Validator.getVal('env-cp'),
      envio_ciudad:   Validator.getVal('env-ciudad'),
      envio_estado:   Validator.getVal('env-estado'),
      envio_referencia:Validator.getVal('env-referencia'),
      notas_cliente:  document.getElementById('notas-cliente')?.value.trim() || '',
    };
  }

  return { validate, getData };
})();


/* ═══════════════════════════════════════════════════════════
   MÓDULO: PaymentHandler
   Maneja Stripe y PayPal de forma intercambiable (OCP).
══════════════════════════════════════════════════════════ */
const PaymentHandler = (() => {
  let selectedMethod = null;

  function selectMethod(method) {
    selectedMethod = method;

    /* Mostrar/ocultar paneles */
    ['stripe', 'paypal'].forEach(m => {
      document.getElementById(`panel-${m}`)?.classList.toggle('visible', m === method);
    });

    /* Mostrar botón de pago Stripe */
    const stripeAction = document.getElementById('stripe-action');
    if (stripeAction) stripeAction.style.display = method === 'stripe' ? 'flex' : 'none';
  }

  /** Construye el payload del pedido para el back-end */
  function _buildPayload(method) {
    const cart = CartReader.getCart();
    const { subtotal, iva, envio, grand } = CartReader.calcTotals(cart);
    const shipping = ShippingForm.getData();
    const cfdi     = CFDIPanel.getData();
    const user     = CartReader.getUser();

    return {
      id_cliente:     user?.id,
      metodo_pago:    method,
      subtotal,
      iva,
      costo_envio:    envio,
      total:          grand,
      items: cart.map(i => ({
        id_producto:     i.id,
        nombre_snapshot: i.nombre,
        precio_unitario: i.precio,
        cantidad:        i.qty,
        iva_unitario:    parseFloat((i.precio * 0.16).toFixed(2)),
      })),
      ...shipping,
      ...(cfdi || { requiere_factura: false }),
    };
  }

  /* ── Stripe ─────────────────────────────────────────── */
  async function handleStripe() {
    const btn   = document.getElementById('btn-pay-stripe');
    const label = document.getElementById('btn-pay-label');

    if (btn) { btn.disabled = true; btn.classList.add('loading'); }
    if (label) label.textContent = 'Procesando…';

    try {
      const payload = _buildPayload('stripe');

      /*
       * ★ PRODUCCIÓN: crear PaymentIntent en el back-end y confirmar con Stripe.js
       *
       * const res      = await fetch(`${API_BASE}/pagos/stripe/crear-intent`, {
       *   method: 'POST',
       *   headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
       *   body: JSON.stringify(payload),
       * });
       * const { client_secret, id_pedido } = await res.json();
       *
       * const stripe    = Stripe('pk_test_TU_CLAVE_PUBLICA');
       * const { error } = await stripe.confirmCardPayment(client_secret, {
       *   payment_method: { card: cardElement },
       * });
       * if (error) throw new Error(error.message);
       *
       * _onPaymentSuccess(id_pedido, 'stripe', payload.requiere_factura);
       */

      /* Simulación de pago exitoso (2s de delay) */
      await new Promise(r => setTimeout(r, 2000));
      const fakeOrderId = Formatter.orderNum();
      _onPaymentSuccess(fakeOrderId, 'Stripe', payload.requiere_factura);

    } catch (err) {
      const errEl = document.getElementById('stripe-errors');
      if (errEl) { errEl.textContent = err.message; errEl.classList.add('visible'); }
      Toast.show(err.message, 'error');
    } finally {
      if (btn)   { btn.disabled = false; btn.classList.remove('loading'); }
      if (label) label.textContent = 'Pagar ahora';
    }
  }

  /* ── PayPal ─────────────────────────────────────────── */
  async function handlePayPal() {
    try {
      const payload = _buildPayload('paypal');

      /*
       * ★ PRODUCCIÓN: crear orden PayPal en el back-end y redirigir.
       *
       * const res    = await fetch(`${API_BASE}/pagos/paypal/crear-orden`, {
       *   method: 'POST',
       *   headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
       *   body: JSON.stringify(payload),
       * });
       * const { approval_url, id_pedido } = await res.json();
       * sessionStorage.setItem('fps_pending_order', id_pedido);
       * window.location.href = approval_url;
       */

      /* Simulación */
      Toast.show('Redirigiendo a PayPal…', 'info');
      await new Promise(r => setTimeout(r, 1500));
      const fakeOrderId = Formatter.orderNum();
      _onPaymentSuccess(fakeOrderId, 'PayPal', payload.requiere_factura);

    } catch (err) {
      Toast.show(err.message, 'error');
    }
  }

  function getSelectedMethod() { return selectedMethod; }

  return { selectMethod, handleStripe, handlePayPal, getSelectedMethod };
})();


/* ═══════════════════════════════════════════════════════════
   MÓDULO: SuccessModal
══════════════════════════════════════════════════════════ */
function _onPaymentSuccess(orderId, method, requiresCFDI) {
  /* Limpiar carrito */
  localStorage.removeItem('fps_cart');

  /* Avanzar breadcrumb al paso 3 */
  StepManager.goTo(3);

  /* Actualizar modal */
  document.getElementById('success-order-id').textContent = orderId;

  const details = document.getElementById('success-details');
  if (details) {
    const { grand } = CartReader.calcTotals([]);  /* Carrito ya vacío */
    details.innerHTML = `
      <strong style="color:var(--text-primary)">Método de pago:</strong> ${method}<br>
      <strong style="color:var(--text-primary)">Número de pedido:</strong> ${orderId}`;
  }

  const cfdiMsg = document.getElementById('success-cfdi-msg');
  if (cfdiMsg) cfdiMsg.style.display = requiresCFDI ? 'inline-flex' : 'none';

  /* Mostrar modal */
  const overlay = document.getElementById('modal-success');
  if (overlay) {
    overlay.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
    /* Foco en el título */
    setTimeout(() => {
      overlay.querySelector('.success-title')?.focus?.();
    }, 100);
  }
}


/* ═══════════════════════════════════════════════════════════
   FUNCIONES GLOBALES (llamadas desde el HTML con onclick)
   Exponemos solo las imprescindibles en window.
══════════════════════════════════════════════════════════ */

/** Paso 1 → 2: validar envío y CFDI, avanzar al método de pago */
window.goToPayment = function () {
  const shippingOk = ShippingForm.validate();
  const cfdiOk     = CFDIPanel.validate();

  if (!shippingOk || !cfdiOk) {
    Toast.show('Revisa los campos marcados en rojo.', 'error');
    return;
  }

  StepManager.goTo(2);
  Toast.show('Dirección guardada. Selecciona tu método de pago.', 'info');
};

/** Toggle del panel CFDI */
window.toggleCFDI = function () {
  CFDIPanel.toggle();
};

/** Seleccionar método de pago */
window.selectPaymentMethod = function (method) {
  PaymentHandler.selectMethod(method);
};

/** Pagar con Stripe */
window.submitStripe = async function () {
  await PaymentHandler.handleStripe();
};

/** Pagar con PayPal */
window.submitPayPal = async function () {
  await PaymentHandler.handlePayPal();
};


/* ═══════════════════════════════════════════════════════════
   GUARDS DE ACCESO
══════════════════════════════════════════════════════════ */
function _guardAccess() {
  const user = CartReader.getUser();
  const cart = CartReader.getCart();

  if (!user) {
    Toast.show('Debes iniciar sesión para acceder al checkout.', 'warning');
    setTimeout(() => { window.location.href = 'index.html'; }, 2000);
    return false;
  }

  if (cart.length === 0) {
    Toast.show('Tu carrito está vacío.', 'warning');
    setTimeout(() => { window.location.href = 'index.html'; }, 2000);
    return false;
  }

  return true;
}


/* ═══════════════════════════════════════════════════════════
   BOOTSTRAP
══════════════════════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', () => {
  /* Verificar acceso */
  if (!_guardAccess()) return;

  /* Renderizar resumen */
  OrderSummary.render();

  /* Estado inicial: paso 1 activo, paso 2 bloqueado */
  StepManager.goTo(1);

  /* Pre-rellenar nombre desde la sesión del usuario */
  const user = CartReader.getUser();
  if (user) {
    const nombreInput = document.getElementById('env-nombre');
    if (nombreInput && !nombreInput.value) {
      nombreInput.value = `${user.nombre} ${user.apellido || ''}`.trim();
    }
  }

  /* Inicializar Lucide */
  if (window.lucide) window.lucide.createIcons();

  /* Panel CFDI oculto por defecto */
  const cfdiPanel = document.getElementById('cfdi-panel');
  if (cfdiPanel) cfdiPanel.setAttribute('aria-hidden', 'true');
});
