/**
 * FPS Factory — support.js
 * Detección de capacidades del browser y aplicación de polyfills.
 * Este archivo NO es un ES Module. Se carga de forma sincrónica
 * como el primer <script> del documento, antes que cualquier
 * module, para que las decisiones de compatibilidad estén
 * disponibles desde el arranque.
 *
 * Principio: SRP — solo detecta features y aplica polyfills/warnings.
 */

(function () {
  'use strict';

  /* ─── Feature detection ──────────────────────────────── */
  var FPSSupport = {
    cssCustomProperties: (function () {
      try {
        return window.CSS && window.CSS.supports('color', 'var(--t)');
      } catch (e) {
        return false;
      }
    })(),

    cssGrid: (function () {
      try {
        return window.CSS && window.CSS.supports('display', 'grid');
      } catch (e) {
        return false;
      }
    })(),

    backdropFilter: (function () {
      try {
        return (
          window.CSS &&
          (window.CSS.supports('backdrop-filter', 'blur(1px)') ||
            window.CSS.supports('-webkit-backdrop-filter', 'blur(1px)'))
        );
      } catch (e) {
        return false;
      }
    })(),

    esModules: (function () {
      try {
        return 'noModule' in HTMLScriptElement.prototype;
      } catch (e) {
        return false;
      }
    })(),

    intersectionObserver: typeof IntersectionObserver !== 'undefined',

    smoothScroll: 'scrollBehavior' in document.documentElement.style,

    localStorage: (function () {
      try {
        localStorage.setItem('__test__', '1');
        localStorage.removeItem('__test__');
        return true;
      } catch (e) {
        return false;
      }
    })(),

    fetch: typeof window.fetch === 'function',

    promises: typeof Promise !== 'undefined',

    customElements: typeof customElements !== 'undefined',

    passiveEvents: (function () {
      var supported = false;
      try {
        var opts = Object.defineProperty({}, 'passive', {
          get: function () { supported = true; return false; }
        });
        window.addEventListener('testPassive', null, opts);
        window.removeEventListener('testPassive', null, opts);
      } catch (e) {}
      return supported;
    })(),
  };

  /* Exponer globalmente para uso en módulos */
  window.FPSSupport = FPSSupport;

  /* ─── Browser muy obsoleto ───────────────────────────── */
  var isObsolete = !FPSSupport.promises || !FPSSupport.esModules;

  if (isObsolete) {
    document.addEventListener('DOMContentLoaded', function () {
      var warning = document.getElementById('browser-warning');
      if (warning) {
        warning.classList.add('visible');
      }
    });
  }

  /* ─── Clases CSS en <html> para feature flags ────────── */
  var html = document.documentElement;

  if (!FPSSupport.cssGrid)          html.classList.add('no-css-grid');
  if (!FPSSupport.backdropFilter)   html.classList.add('no-backdrop-filter');
  if (!FPSSupport.cssCustomProperties) html.classList.add('no-css-vars');
  if (!FPSSupport.intersectionObserver) html.classList.add('no-intersection-observer');
  if (FPSSupport.passiveEvents)     html.classList.add('has-passive-events');


  /* ─── Polyfill: smooth scroll ────────────────────────── */
  if (!FPSSupport.smoothScroll) {
    /* Polyfill minimalista para scrollIntoView con behavior:'smooth' */
    var easeInOutQuad = function (t) {
      return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
    };

    window.smoothScrollTo = function (targetY, duration) {
      var startY  = window.scrollY || window.pageYOffset;
      var diff    = targetY - startY;
      var startTime;
      duration = duration || 600;

      function step(timestamp) {
        if (!startTime) startTime = timestamp;
        var progress = Math.min((timestamp - startTime) / duration, 1);
        window.scrollTo(0, startY + diff * easeInOutQuad(progress));
        if (progress < 1) requestAnimationFrame(step);
      }

      requestAnimationFrame(step);
    };
  }


  /* ─── Polyfill: IntersectionObserver (stub) ──────────── */
  if (!FPSSupport.intersectionObserver) {
    /* Stub: ejecuta el callback inmediatamente con isIntersecting=true */
    window.IntersectionObserver = function (callback) {
      return {
        observe: function (el) {
          callback([{ isIntersecting: true, target: el }]);
        },
        unobserve: function () {},
        disconnect: function () {},
      };
    };
  }


  /* ─── Polyfill: Element.closest ─────────────────────── */
  if (!Element.prototype.closest) {
    Element.prototype.closest = function (selector) {
      var el = this;
      while (el && el.nodeType === 1) {
        if (el.matches(selector)) return el;
        el = el.parentElement || el.parentNode;
      }
      return null;
    };
  }

  /* ─── Polyfill: Element.matches ──────────────────────── */
  if (!Element.prototype.matches) {
    Element.prototype.matches =
      Element.prototype.msMatchesSelector ||
      Element.prototype.webkitMatchesSelector;
  }


  /* ─── Polyfill: Array.from ───────────────────────────── */
  if (!Array.from) {
    Array.from = function (arrayLike) {
      return Array.prototype.slice.call(arrayLike);
    };
  }


  /* ─── Polyfill: Object.assign ────────────────────────── */
  if (!Object.assign) {
    Object.assign = function (target) {
      for (var i = 1; i < arguments.length; i++) {
        var source = arguments[i];
        if (source) {
          for (var key in source) {
            if (Object.prototype.hasOwnProperty.call(source, key)) {
              target[key] = source[key];
            }
          }
        }
      }
      return target;
    };
  }


  /* ─── LocalStorage fallback ──────────────────────────── */
  if (!FPSSupport.localStorage) {
    /* Stub en memoria para que el código no rompa */
    var memStore = {};
    window.localStorage = {
      setItem:    function (k, v) { memStore[k] = String(v); },
      getItem:    function (k)    { return k in memStore ? memStore[k] : null; },
      removeItem: function (k)    { delete memStore[k]; },
      clear:      function ()     { memStore = {}; },
    };
  }


  /* ─── requestAnimationFrame ──────────────────────────── */
  window.requestAnimationFrame =
    window.requestAnimationFrame       ||
    window.webkitRequestAnimationFrame ||
    window.mozRequestAnimationFrame    ||
    function (cb) { return setTimeout(cb, 16); };

  window.cancelAnimationFrame =
    window.cancelAnimationFrame       ||
    window.webkitCancelAnimationFrame ||
    window.mozCancelAnimationFrame    ||
    clearTimeout;


  /* ─── Console stub ───────────────────────────────────── */
  if (!window.console) {
    window.console = {
      log:   function () {},
      warn:  function () {},
      error: function () {},
    };
  }

})();
