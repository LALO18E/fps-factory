/**
 * FPS Factory — Auth
 * Gestión de sesión: login, registro, logout, UI de usuario.
 *
 * SOLID:
 *  - SRP: Solo gestiona la identidad del usuario.
 *  - DIP: Usa Api y Store como abstracciones, no implementaciones concretas.
 */

import Store         from './store.js';
import EventBus      from './eventBus.js';
import { login, register } from './api.js';
import { showToast } from './toast.js';
import { openModal, closeModal } from './modal.js';

/* ─── Modal helpers ───────────────────────────────────── */

/**
 * Abre el modal de autenticación en la pestaña indicada.
 * @param {'login'|'register'} [tab='login']
 */
export function openAuthModal(tab = 'login') {
  openModal('modal-auth');
  switchTab(tab);
}

export function closeAuthModal() {
  closeModal('modal-auth');
}

/**
 * Cambia la pestaña activa dentro del modal de auth.
 * @param {'login'|'register'} tab
 */
export function switchTab(tab) {
  const tabs   = document.querySelectorAll('.auth-tab');
  const panels = document.querySelectorAll('.auth-panel');

  tabs.forEach(t => {
    const isActive = t.dataset.tab === tab;
    t.setAttribute('aria-selected', String(isActive));
    t.setAttribute('tabindex', isActive ? '0' : '-1');
  });

  panels.forEach(p => {
    p.setAttribute('aria-hidden', String(p.id !== `panel-${tab}`));
  });

  const titleEl = document.getElementById('auth-modal-title');
  const subEl   = document.getElementById('auth-modal-sub');

  if (tab === 'login') {
    if (titleEl) titleEl.textContent = 'Bienvenido de vuelta';
    if (subEl)   subEl.textContent   = 'Inicia sesión para continuar comprando';
  } else {
    if (titleEl) titleEl.textContent = 'Crear una cuenta';
    if (subEl)   subEl.textContent   = 'Es gratis y solo toma un minuto';
  }

  /* Limpiar errores al cambiar pestaña */
  _clearErrors();
}

/* ─── Formularios ─────────────────────────────────────── */

export async function submitLogin() {
  _clearErrors();
  const email = _val('login-email');
  const pass  = _val('login-password');

  if (!email || !pass) {
    _showError('login-error', 'Completa todos los campos.');
    _markInvalid('login-email', !email);
    _markInvalid('login-password', !pass);
    return;
  }

  const btn = document.getElementById('btn-login');
  _setLoading(btn, true, 'Iniciando sesión…');

  try {
    const { usuario, token } = await login(email, pass);
    localStorage.setItem('fps_token', token);
    _onAuthSuccess(usuario);
  } catch (e) {
    _showError('login-error', e.message);
  } finally {
    _setLoading(btn, false, 'Iniciar sesión');
  }
}

export async function submitRegister() {
  _clearErrors();
  const nombre   = _val('reg-nombre');
  const apellido = _val('reg-apellido');
  const email    = _val('reg-email');
  const telefono = _val('reg-telefono');
  const pass     = _val('reg-password');
  const pass2    = _val('reg-password2');

  const errors = [];
  if (!nombre)         errors.push('reg-nombre');
  if (!apellido)       errors.push('reg-apellido');
  if (!email)          errors.push('reg-email');
  if (!pass)           errors.push('reg-password');
  if (pass !== pass2)  errors.push('reg-password2');

  if (errors.length) {
    errors.forEach(id => _markInvalid(id, true));
    _showError('register-error',
      pass !== pass2 ? 'Las contraseñas no coinciden.' : 'Completa los campos obligatorios.'
    );
    return;
  }

  if (pass.length < 8) {
    _showError('register-error', 'La contraseña debe tener mínimo 8 caracteres.');
    _markInvalid('reg-password', true);
    return;
  }

  const btn = document.getElementById('btn-register');
  _setLoading(btn, true, 'Creando cuenta…');

  try {
    const { usuario, token } = await register({ nombre, apellido, email, telefono, password: pass });
    localStorage.setItem('fps_token', token);
    _onAuthSuccess(usuario);
  } catch (e) {
    _showError('register-error', e.message);
  } finally {
    _setLoading(btn, false, 'Crear cuenta');
  }
}

/* ─── Sesión ──────────────────────────────────────────── */

function _onAuthSuccess(user) {
  Store.setState({ currentUser: user }, 'auth:login');
  Store.persistUser(user);
  closeAuthModal();
  _renderUserUI(user);
  showToast(`¡Bienvenido, ${user.nombre}!`, 'success');
}

export function logout() {
  const { currentUser } = Store.getState();
  if (!currentUser) return;

  if (!confirm(`¿Cerrar sesión de ${currentUser.nombre}?`)) return;

  Store.setState({ currentUser: null }, 'auth:logout');
  Store.persistUser(null);
  _renderUserUI(null);
  showToast('Sesión cerrada correctamente.', 'info');
}

/**
 * Restaura la sesión desde el Store (ya hidratado).
 */
export function restoreSession() {
  const { currentUser } = Store.getState();
  _renderUserUI(currentUser);
}

/* ─── UI ──────────────────────────────────────────────── */

function _renderUserUI(user) {
  const btnLogin     = document.getElementById('btn-open-auth');
  const btnRegister  = document.getElementById('btn-open-register');
  const userPill     = document.getElementById('user-pill');
  const avatarEl     = document.getElementById('user-avatar-initial');
  const nameEl       = document.getElementById('user-display-name');

  if (!btnLogin || !userPill) return;

  if (user) {
    btnLogin.hidden    = true;
    btnRegister.hidden = true;
    userPill.hidden    = false;
    if (avatarEl) avatarEl.textContent = user.nombre.charAt(0).toUpperCase();
    if (nameEl)   nameEl.textContent   = user.nombre;
  } else {
    btnLogin.hidden    = false;
    btnRegister.hidden = false;
    userPill.hidden    = true;
  }
}

/* ─── Helpers privados ────────────────────────────────── */

function _val(id) {
  const el = document.getElementById(id);
  return el ? el.value.trim() : '';
}

function _showError(id, msg) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = msg;
  el.setAttribute('aria-hidden', 'false');
}

function _clearErrors() {
  document.querySelectorAll('.form-error').forEach(el => {
    el.textContent = '';
    el.setAttribute('aria-hidden', 'true');
  });
  document.querySelectorAll('[aria-invalid]').forEach(el => {
    el.setAttribute('aria-invalid', 'false');
  });
}

function _markInvalid(id, invalid) {
  const el = document.getElementById(id);
  if (el) el.setAttribute('aria-invalid', String(invalid));
}

function _setLoading(btn, loading, label) {
  if (!btn) return;
  btn.disabled    = loading;
  btn.textContent = label;
}
