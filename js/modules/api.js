/**
 * FPS Factory — Api
 * Capa de acceso a datos. Solo hace fetch/transforma datos.
 *
 * SOLID:
 *  - SRP: Solo obtiene datos externos. No toca el DOM ni el Store.
 *  - OCP: Añadir un endpoint = añadir una función, no modificar las existentes.
 *  - DIP: Exporta funciones puras que cualquier consumidor puede usar.
 */

const API_BASE = 'http://localhost:5000/api';

/* ─── Mock data (reemplazar con fetch real cuando el back-end esté listo) ── */
const MOCK_PRODUCTS = [
  {
    id_producto: 1,
    slug: 'amd-ryzen-9-9950x',
    nombre: 'AMD Ryzen 9 9950X',
    marca: 'AMD', categoria: 'CPU',
    precio: 12999, precio_iva: 15078.84, stock_disponible: 15,
    imagen_url: 'https://images.unsplash.com/photo-1591799264318-7e6ef8ddb7ea?w=500',
    imagenes_extra: [
      'https://images.unsplash.com/photo-1555617778-02518510b9d5?w=500',
      'https://images.unsplash.com/photo-1518770660439-4636190af475?w=500',
    ],
    destacado: 1,
    descripcion: 'El procesador más potente de la arquitectura Zen 5. 16 núcleos, 32 hilos, boost hasta 5.7 GHz.',
    especificaciones: { Núcleos: '16', Hilos: '32', Boost: '5.7 GHz', TDP: '170W', Socket: 'AM5', PCIe: '5.0' },
  },
  {
    id_producto: 2,
    slug: 'nvidia-rtx-5090-fe',
    nombre: 'NVIDIA GeForce RTX 5090 FE',
    marca: 'NVIDIA', categoria: 'GPU',
    precio: 47999, precio_iva: 55678.84, stock_disponible: 7,
    imagen_url: 'https://images.unsplash.com/photo-1587202372775-e229f172b9d7?w=500',
    imagenes_extra: [
      'https://images.unsplash.com/photo-1593640408182-31c228d1f3c0?w=500',
      'https://images.unsplash.com/photo-1622151834677-70f982c9adef?w=500',
    ],
    destacado: 1,
    descripcion: 'GPU Blackwell, 32 GB GDDR7, DLSS 4 y ray tracing de cuarta generación.',
    especificaciones: { VRAM: '32 GB GDDR7', Bus: '512-bit', Boost: '2407 MHz', TDP: '575W', DLSS: '4', PCIe: '5.0' },
  },
  {
    id_producto: 3,
    slug: 'corsair-dominator-titanium-ddr5',
    nombre: 'Corsair Dominator Titanium DDR5 64 GB',
    marca: 'Corsair', categoria: 'RAM',
    precio: 6499, precio_iva: 7538.84, stock_disponible: 25,
    imagen_url: 'https://images.unsplash.com/photo-1562976540-1502c2145186?w=500',
    imagenes_extra: [
      'https://images.unsplash.com/photo-1591799264318-7e6ef8ddb7ea?w=500',
    ],
    destacado: 0,
    descripcion: 'Kit DDR5 2×32 GB a 6400 MT/s, XMP 3.0, iCUE ARGB.',
    especificaciones: { Capacidad: '64 GB', 'Vel. XMP': '6400 MT/s', Latencia: 'CL32', Voltaje: '1.40V', RGB: 'iCUE ARGB' },
  },
  {
    id_producto: 4,
    slug: 'samsung-990-pro-2tb',
    nombre: 'Samsung 990 Pro NVMe 2 TB',
    marca: 'Samsung', categoria: 'Almacenamiento',
    precio: 3499, precio_iva: 4058.84, stock_disponible: 30,
    imagen_url: 'https://images.unsplash.com/photo-1601737487795-dab272f52420?w=500',
    imagenes_extra: [],
    destacado: 0,
    descripcion: 'SSD PCIe 4.0, lecturas hasta 7450 MB/s.',
    especificaciones: { Capacidad: '2 TB', Interfaz: 'PCIe 4.0 ×4', Lectura: '7450 MB/s', Escritura: '6900 MB/s' },
  },
  {
    id_producto: 5,
    slug: 'asus-rog-maximus-z890-apex',
    nombre: 'ASUS ROG Maximus Z890 APEX',
    marca: 'ASUS', categoria: 'Motherboard',
    precio: 18999, precio_iva: 22038.84, stock_disponible: 5,
    imagen_url: 'https://images.unsplash.com/photo-1518770660439-4636190af475?w=500',
    imagenes_extra: [
      'https://images.unsplash.com/photo-1555617778-02518510b9d5?w=500',
    ],
    destacado: 0,
    descripcion: 'Motherboard ATX tope de gama LGA1851. VRM 26+1+2 fases, Wi-Fi 7.',
    especificaciones: { Socket: 'LGA1851', 'Form Factor': 'ATX', VRM: '26+1+2 fases', WiFi: '7 (802.11be)' },
  },
  {
    id_producto: 6,
    slug: 'be-quiet-dark-power-13-1000w',
    nombre: 'be quiet! Dark Power 13 1000W',
    marca: 'be quiet!', categoria: 'Fuente de Poder',
    precio: 5999, precio_iva: 6958.84, stock_disponible: 12,
    imagen_url: 'https://images.unsplash.com/photo-1591488320449-011701bb6704?w=500',
    imagenes_extra: [],
    destacado: 0,
    descripcion: 'Fuente 80 PLUS Titanium, modular completa, garantía 10 años.',
    especificaciones: { Potencia: '1000W', Cert: '80 PLUS Titanium', Modular: 'Sí', ATX: '3.1', Garantía: '10 años' },
  },
];

/**
 * Obtener catálogo de productos.
 * @returns {Promise<Product[]>}
 */
export async function fetchCatalog() {
  // ★ Descomentar cuando el back-end esté activo:
  // try {
  //   const res = await fetch(`${API_BASE}/catalogo`, {
  //     headers: { 'Accept': 'application/json' },
  //   });
  //   if (!res.ok) throw new Error(`HTTP ${res.status}`);
  //   return await res.json();
  // } catch (err) {
  //   console.warn('[Api] fetchCatalog falló, usando mock:', err);
  //   return MOCK_PRODUCTS;
  // }
  return MOCK_PRODUCTS;
}

/**
 * Login de usuario.
 * @param {string} email
 * @param {string} password
 * @returns {Promise<{usuario: User, token: string}>}
 */
export async function login(email, password) {
  // ★ Descomentar en producción:
  // const res = await fetch(`${API_BASE}/auth/login`, {
  //   method: 'POST',
  //   headers: { 'Content-Type': 'application/json' },
  //   body: JSON.stringify({ email, password }),
  // });
  // const data = await res.json();
  // if (!res.ok) throw new Error(data.mensaje || 'Credenciales incorrectas');
  // return data;

  /* Simulación */
  await new Promise(r => setTimeout(r, 600));
  if (email === 'demo@fpsfactory.mx' && password === 'Test@1234') {
    return { usuario: { id: 2, nombre: 'Juan', apellido: 'Pérez', email }, token: 'mock-token' };
  }
  throw new Error('Correo o contraseña incorrectos.');
}

/**
 * Registro de usuario.
 * @param {{ nombre, apellido, email, telefono, password }} data
 * @returns {Promise<{usuario: User, token: string}>}
 */
export async function register(data) {
  // ★ Descomentar en producción:
  // const res = await fetch(`${API_BASE}/auth/registro`, {
  //   method: 'POST',
  //   headers: { 'Content-Type': 'application/json' },
  //   body: JSON.stringify(data),
  // });
  // const body = await res.json();
  // if (!res.ok) throw new Error(body.mensaje || 'Error al registrar');
  // return body;

  /* Simulación */
  await new Promise(r => setTimeout(r, 800));
  return {
    usuario: { id: 99, nombre: data.nombre, apellido: data.apellido, email: data.email },
    token: 'mock-token-new',
  };
}

/**
 * Formatea un número como moneda MXN.
 * @param {number} amount
 * @returns {string}
 */
export function formatMXN(amount) {
  return new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: 'MXN',
    minimumFractionDigits: 2,
  }).format(amount);
}

/**
 * Debounce genérico.
 * @param {Function} fn
 * @param {number}   delay
 */
export function debounce(fn, delay) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}