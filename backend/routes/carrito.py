"""
FPS Factory — routes/carrito.py
Endpoints de reserva de stock durante el checkout.

    POST /api/carrito/reservar      → reservar N unidades
    POST /api/carrito/liberar       → liberar reserva (pago fallido / cancelación)
    POST /api/carrito/limpiar       → liberar todas las reservas expiradas (cron)
    GET  /api/carrito/disponible/<id> → stock disponible de un producto
"""

from flask import Blueprint, request, g

from models           import producto as ProductoModel
from utils.validators import validate_input, ReservaStockSchema
from utils.responses  import success, error, validation_error
from middleware.auth  import require_auth
from flask            import current_app

carrito_bp = Blueprint("carrito", __name__, url_prefix="/api/carrito")


# ─── POST /api/carrito/reservar ────────────────────────────
@carrito_bp.route("/reservar", methods=["POST"])
@require_auth
def reservar():
    """
    Reserva N unidades de un producto para el checkout activo.

    Body JSON:
        {
          "id_producto":   1,
          "cantidad":      2,
          "session_token": "abc123..."   ← token de sesión del checkout
        }

    Returns 200:
        { "ok": true, "data": { "reservado": true } }

    Returns 409:
        { "ok": false, "mensaje": "Stock insuficiente." }
    """
    data, errors = validate_input(ReservaStockSchema, request.get_json(silent=True) or {})
    if errors:
        return validation_error(errors)

    id_usuario    = g.current_user["id_usuario"]
    ttl           = current_app.config["STOCK_RESERVA_TTL_MIN"]

    reservado = ProductoModel.reservar_stock(
        id_producto   = data["id_producto"],
        id_usuario    = id_usuario,
        cantidad      = data["cantidad"],
        session_token = data["session_token"],
        ttl_min       = ttl,
    )

    if not reservado:
        return error(
            "Stock insuficiente para la cantidad solicitada.",
            409,
            data={"stock_disponible": ProductoModel.get_stock_disponible(data["id_producto"])},
        )

    return success(
        data={"reservado": True},
        mensaje=f"Se reservaron {data['cantidad']} unidad(es) durante {ttl} minutos.",
    )


# ─── POST /api/carrito/liberar ─────────────────────────────
@carrito_bp.route("/liberar", methods=["POST"])
@require_auth
def liberar():
    """
    Libera la reserva de stock cuando el pago falla o el usuario
    abandona el checkout.

    Body JSON:
        {
          "id_producto": 1,
          "cantidad":    2
        }
    """
    body = request.get_json(silent=True) or {}
    id_producto = body.get("id_producto")
    cantidad    = body.get("cantidad")

    if not id_producto or not cantidad:
        return error("id_producto y cantidad son requeridos.", 400)

    try:
        id_producto = int(id_producto)
        cantidad    = int(cantidad)
        if id_producto < 1 or cantidad < 1:
            raise ValueError
    except (ValueError, TypeError):
        return error("id_producto y cantidad deben ser enteros positivos.", 400)

    ProductoModel.restaurar_reserva(id_producto, cantidad)

    return success(mensaje=f"Reserva de {cantidad} unidad(es) liberada.")


# ─── POST /api/carrito/limpiar ─────────────────────────────
@carrito_bp.route("/limpiar", methods=["POST"])
def limpiar():
    """
    Libera todas las reservas expiradas (llama al stored procedure).
    Este endpoint debe ser llamado por un cron job o task scheduler.

    Protección básica: requiere un header interno X-Cron-Key
    (en producción usar una clave más robusta o restricción de IP).
    """
    cron_key     = request.headers.get("X-Cron-Key", "")
    expected_key = current_app.config.get("SECRET_KEY", "")

    if not cron_key or cron_key != expected_key:
        return error("No autorizado.", 401)

    ProductoModel.liberar_reservas_expiradas()
    return success(mensaje="Reservas expiradas liberadas.")


# ─── GET /api/carrito/disponible/<id_producto> ─────────────
@carrito_bp.route("/disponible/<int:id_producto>", methods=["GET"])
@require_auth
def stock_disponible(id_producto: int):
    """
    Devuelve el stock disponible en tiempo real de un producto.
    Útil para validar en el cliente antes de proceder al pago.
    """
    disponible = ProductoModel.get_stock_disponible(id_producto)
    return success(data={"id_producto": id_producto, "stock_disponible": disponible})
