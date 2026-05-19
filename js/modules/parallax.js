/**
 * FPS Factory — Parallax
 * Efecto parallax en el hero usando GSAP + ScrollTrigger.
 *
 * SOLID:
 *  - SRP: Solo gestiona animaciones de scroll del hero.
 *  - OCP: Añadir una capa nueva = añadir una entrada a LAYERS.
 *
 * Capas (de más lenta a más rápida al hacer scroll):
 *  1. .hero-layer-bg          → velocidad 0.15  (casi estática)
 *  2. .hero-layer-glow        → velocidad 0.30
 *  3. .hero-layer-glow-secondary → velocidad 0.40
 *  4. .hero-featured          → velocidad 0.55  (se mueve más)
 *  5. .hero-content           → velocidad 0.70  (la más rápida)
 *
 * Si el usuario prefiere reducción de movimiento o GSAP
 * no está disponible, el módulo se cancela silenciosamente.
 */

/** @typedef {{ selector: string, speed: number }} ParallaxLayer */

const LAYERS = [
  { selector: '.hero-layer-bg',            speed: 0.15 },
  { selector: '.hero-layer-glow',          speed: 0.30 },
  { selector: '.hero-layer-glow-secondary',speed: 0.40 },
  { selector: '.hero-featured',            speed: 0.55 },
  { selector: '.hero-content',             speed: 0.70 },
];

/* ─── Detección de preferencias de movimiento ─────────── */
const prefersReducedMotion = window.matchMedia(
  '(prefers-reduced-motion: reduce)'
).matches;

/**
 * Inicializa el parallax del hero.
 * Se llama desde el orquestador después de que el DOM esté listo.
 */
export function initParallax() {
  if (prefersReducedMotion) return;

  /* Verificar que GSAP esté disponible */
  if (typeof window.gsap === 'undefined') {
    console.warn('[Parallax] GSAP no está cargado. Parallax desactivado.');
    return;
  }

  const { gsap } = window;

  /* Registrar ScrollTrigger si está disponible */
  if (typeof window.ScrollTrigger !== 'undefined') {
    gsap.registerPlugin(window.ScrollTrigger);
    _initWithScrollTrigger(gsap);
  } else {
    /* Fallback: parallax manual con scroll event */
    _initManualParallax(gsap);
  }
}

/* ─── Implementación con ScrollTrigger (preferida) ────── */
function _initWithScrollTrigger(gsap) {
  const hero = document.getElementById('hero');
  if (!hero) return;

  LAYERS.forEach(({ selector, speed }) => {
    const el = hero.querySelector(selector);
    if (!el) return;

    gsap.to(el, {
      yPercent: speed * 60,      /* Desplazamiento máximo en % */
      ease: 'none',
      scrollTrigger: {
        trigger: hero,
        start: 'top top',
        end: 'bottom top',
        scrub: true,             /* Sincroniza con el scroll */
      },
    });
  });

  /* Animación de entrada del hero al cargar */
  _animateHeroEntrance(gsap);
}

/* ─── Fallback: scroll manual ─────────────────────────── */
function _initManualParallax(gsap) {
  const hero = document.getElementById('hero');
  if (!hero) return;

  /* Caché de elementos para no hacer querySelector en cada frame */
  const layerEls = LAYERS.map(({ selector, speed }) => ({
    el: hero.querySelector(selector),
    speed,
  })).filter(({ el }) => el !== null);

  const heroBottom = hero.getBoundingClientRect().bottom + window.scrollY;
  let ticking = false;

  function onScroll() {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      const scrollY = window.scrollY || window.pageYOffset;

      /* Solo aplicar mientras el hero esté visible */
      if (scrollY > heroBottom) {
        ticking = false;
        return;
      }

      layerEls.forEach(({ el, speed }) => {
        const y = scrollY * speed;
        gsap.set(el, { y });
      });

      ticking = false;
    });
  }

  const eventOptions = window.FPSSupport?.passiveEvents
    ? { passive: true }
    : false;

  window.addEventListener('scroll', onScroll, eventOptions);

  /* Limpiar al desmontar (aunque en MPA no aplica directamente) */
  window._parallaxCleanup = () =>
    window.removeEventListener('scroll', onScroll, eventOptions);

  _animateHeroEntrance(gsap);
}

/* ─── Animación de entrada ────────────────────────────── */
function _animateHeroEntrance(gsap) {
  const tl = gsap.timeline({ defaults: { ease: 'power3.out' } });

  /* Elementos del hero content */
  tl.fromTo(
    '.hero-tag',
    { opacity: 0, y: 20 },
    { opacity: 1, y: 0, duration: 0.6 }
  )
  .fromTo(
    '.hero-title',
    { opacity: 0, y: 30 },
    { opacity: 1, y: 0, duration: 0.7 },
    '-=0.4'
  )
  .fromTo(
    '.hero-subtitle',
    { opacity: 0, y: 20 },
    { opacity: 1, y: 0, duration: 0.6 },
    '-=0.4'
  )
  .fromTo(
    '.hero-cta',
    { opacity: 0, y: 16 },
    { opacity: 1, y: 0, duration: 0.5 },
    '-=0.3'
  )
  .fromTo(
    '.hero-stats',
    { opacity: 0 },
    { opacity: 1, duration: 0.5 },
    '-=0.2'
  )
  .fromTo(
    '.hero-featured',
    { opacity: 0, x: 40, scale: 0.96 },
    { opacity: 1, x: 0, scale: 1, duration: 0.8 },
    '-=0.6'
  );

  /* Float continuo de la tarjeta destacada (reemplaza la animación CSS) */
  gsap.to('.hero-featured', {
    y: -12,
    duration: 3,
    ease: 'sine.inOut',
    yoyo: true,
    repeat: -1,
    delay: 1,
  });
}

/**
 * Destruye el parallax (útil en SPA o cuando el hero
 * deja de estar en el DOM).
 */
export function destroyParallax() {
  if (typeof window.ScrollTrigger !== 'undefined') {
    window.ScrollTrigger.getAll().forEach(st => st.kill());
  }

  if (typeof window._parallaxCleanup === 'function') {
    window._parallaxCleanup();
  }
}
