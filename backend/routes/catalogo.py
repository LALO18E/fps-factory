"""
FPS Factory — routes/catalogo.py
Endpoints públicos del catálogo de productos.

    GET /api/catalogo                  → listado con filtros
    GET /api/catalogo/<slug>           → detalle por slug
    GET /api/catalogo/id/<id_producto> → detalle por ID (admin/interno)
"""

from flask import Blueprint, request
from models    import producto as ProductoModel
from utils.responses import success, not_found, error

catalogo_bp = Blueprint("catalogo", __name__, url_prefix="/api/catalogo")

# Categorías válidas (según el ENUM de la BD)
CATEGORIAS_VALIDAS = {
    "CPU", "GPU", "RAM", "Almacenamiento", "Motherboard",
    "Fuente de Poder", "Enfriamiento", "Gabinete", "Monitor",
    "Periféricos", "Otros",
}

ORDENES_VALIDOS = {"default", "price_asc", "price_desc", "name_asc", "featured"}


# ─── GET /api/catalogo ─────────────────────────────────────
@catalogo_bp.route("", methods=["GET"])
def listar():
    """
    Devuelve el catálogo con filtros opcionales por querystring.

    Query params:
        categoria   : str   → filtrar por categoría exacta
        busqueda    : str   → búsqueda full-text
        precio_min  : float → precio mínimo sin IVA
        precio_max  : float → precio máximo sin IVA
        solo_stock  : bool  → solo con stock > 0  (1 | true)
        destacados  : bool  → solo destacados     (1 | true)
        orden       : str   → default | price_asc | price_desc | name_asc | featured
        limite      : int   → máx resultados (default 48, máx 100)
        offset      : int   → paginación (default 0)
    """
    args = request.args

    # ── Categoría ────────────────────────────────────────
    categoria = args.get("categoria", "").strip() or None
    if categoria and categoria not in CATEGORIAS_VALIDAS:
        return error(
            f"Categoría inválida. Válidas: {', '.join(sorted(CATEGORIAS_VALIDAS))}",
            400,
        )

    # ── Búsqueda ─────────────────────────────────────────
    busqueda = args.get("busqueda", "").strip() or None

    # ── Precio ───────────────────────────────────────────
    precio_min = precio_max = None
    try:
        if args.get("precio_min"):
            precio_min = float(args["precio_min"])
        if args.get("precio_max"):
            precio_max = float(args["precio_max"])
    except ValueError:
        return error("precio_min y precio_max deben ser números.", 400)

    if precio_min is not None and precio_max is not None and precio_min > precio_max:
        return error("precio_min no puede ser mayor que precio_max.", 400)

    # ── Booleanos ─────────────────────────────────────────
    def _bool(key: str) -> bool:
        return args.get(key, "").lower() in ("1", "true", "yes")

    solo_stock      = _bool("solo_stock")
    solo_destacados = _bool("destacados")

    # ── Ordenamiento ─────────────────────────────────────
    orden = args.get("orden", "default")
    if orden not in ORDENES_VALIDOS:
        orden = "default"

    # ── Paginación ────────────────────────────────────────
    try:
        limite = min(int(args.get("limite", 48)), 100)
        offset = max(int(args.get("offset", 0)), 0)
    except ValueError:
        limite, offset = 48, 0

    productos = ProductoModel.get_catalogo(
        categoria       = categoria,
        busqueda        = busqueda,
        precio_min      = precio_min,
        precio_max      = precio_max,
        solo_stock      = solo_stock,
        solo_destacados = solo_destacados,
        orden           = orden,
        limite          = limite,
        offset          = offset,
    )

    return success(
        data={
            "productos": productos,
            "total":     len(productos),
            "limite":    limite,
            "offset":    offset,
        }
    )


# ─── GET /api/catalogo/<slug> ──────────────────────────────
@catalogo_bp.route("/<string:slug>", methods=["GET"])
def detalle_por_slug(slug: str):
    """
    Devuelve el detalle de un producto por su slug.

    Ejemplo: GET /api/catalogo/amd-ryzen-9-9950x
    """
    producto = ProductoModel.get_by_slug(slug)
    if not producto:
        return not_found("Producto")
    return success(data=producto)


# ─── GET /api/catalogo/id/<id> ─────────────────────────────
@catalogo_bp.route("/id/<int:id_producto>", methods=["GET"])
def detalle_por_id(id_producto: int):
    """
    Devuelve el detalle de un producto por su ID.
    Incluye datos de administración (stock total, stock_reservado).
    """
    producto = ProductoModel.get_by_id(id_producto)
    if not producto:
        return not_found("Producto")
    return success(data=producto)
