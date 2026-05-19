"""
FPS Factory — routes/pedidos.py
Endpoints de gestión de pedidos.

    POST /api/pedidos                        → crear pedido (cliente)
    GET  /api/pedidos                        → historial del cliente autenticado
    GET  /api/pedidos/<id_pedido>            → detalle de un pedido
    GET  /api/pedidos/admin/todos            → todos los pedidos (solo admin)
    PATCH /api/pedidos/<id_pedido>/guia      → registrar guía de envío (admin)
    PATCH /api/pedidos/<id_pedido>/cancelar  → cancelar pedido (cliente/admin)
"""

from flask import Blueprint, request, g

from models           import pedido   as PedidoModel
from models           import producto as ProductoModel
from utils.validators import validate_input, CrearPedidoSchema
from utils.responses  import success, error, not_found, validation_error, forbidden
from middleware.auth  import require_auth, require_role

pedidos_bp = Blueprint("pedidos", __name__, url_prefix="/api/pedidos")


# ─── POST /api/pedidos ─────────────────────────────────────
@pedidos_bp.route("", methods=["POST"])
@require_auth
def crear_pedido():
    """
    Crea un pedido nuevo.

    Flujo:
      1. Validar entrada (marshmallow)
      2. Verificar que el usuario sea cliente
      3. Verificar stock en tiempo real para cada item
      4. Calcular totales
      5. Insertar Pedido + Detalle_Pedido (transacción)

    Body JSON: ver CrearPedidoSchema en validators.py
    """
    if g.current_user.get("rol") != "cliente":
        return forbidden("Solo los clientes pueden crear pedidos.")

    data, errors = validate_input(CrearPedidoSchema, request.get_json(silent=True) or {})
    if errors:
        return validation_error(errors)

    id_cliente = g.current_user["id_usuario"]
    items      = data["items"]

    # ── Verificar stock en tiempo real ────────────────────
    sin_stock = []
    for item in items:
        disponible = ProductoModel.get_stock_disponible(item["id_producto"])
        if disponible < item["cantidad"]:
            sin_stock.append({
                "id_producto":   item["id_producto"],
                "nombre":        item["nombre_snapshot"],
                "solicitado":    item["cantidad"],
                "disponible":    disponible,
            })

    if sin_stock:
        return error(
            "Uno o más productos no tienen suficiente stock.",
            409,
            data={"sin_stock": sin_stock},
        )

    # ── Separar datos ─────────────────────────────────────
    datos_envio = {k: v for k, v in data.items() if k.startswith("envio_")}
    datos_cfdi  = {
        "requiere_factura": data.get("requiere_factura", False),
        **{k: v for k, v in data.items() if k.startswith("cfdi_")},
    }

    # ── Crear el pedido (transacción atómica) ─────────────
    id_pedido = PedidoModel.crear_pedido(
        id_cliente    = id_cliente,
        datos_envio   = datos_envio,
        datos_cfdi    = datos_cfdi,
        items         = items,
        metodo_pago   = data["metodo_pago"],
        notas_cliente = data.get("notas_cliente"),
    )

    return success(
        data={"id_pedido": id_pedido},
        mensaje="Pedido creado. Procede con el pago.",
        status=201,
    )


# ─── GET /api/pedidos ──────────────────────────────────────
@pedidos_bp.route("", methods=["GET"])
@require_auth
def listar_pedidos():
    """Devuelve el historial de pedidos del cliente autenticado."""
    if g.current_user.get("rol") != "cliente":
        return forbidden("Solo los clientes pueden ver su historial.")

    pedidos = PedidoModel.get_pedidos_cliente(g.current_user["id_usuario"])
    return success(data={"pedidos": pedidos, "total": len(pedidos)})


# ─── GET /api/pedidos/<id_pedido> ──────────────────────────
@pedidos_bp.route("/<int:id_pedido>", methods=["GET"])
@require_auth
def detalle_pedido(id_pedido: int):
    """
    Devuelve el detalle completo de un pedido.
    Los clientes solo pueden ver sus propios pedidos.
    Los admins pueden ver cualquiera.
    """
    rol = g.current_user.get("rol")

    id_cliente_filtro = (
        g.current_user["id_usuario"] if rol == "cliente" else None
    )

    pedido = PedidoModel.get_pedido_detalle(id_pedido, id_cliente_filtro)

    if not pedido:
        return not_found("Pedido")

    return success(data=pedido)


# ─── GET /api/pedidos/admin/todos ──────────────────────────
@pedidos_bp.route("/admin/todos", methods=["GET"])
@require_role("admin")
def admin_todos():
    """
    Panel de administración: lista todos los pedidos.
    Query params: estado, limite, offset.
    """
    estado = request.args.get("estado") or None
    try:
        limite = min(int(request.args.get("limite", 50)), 200)
        offset = max(int(request.args.get("offset", 0)), 0)
    except ValueError:
        limite, offset = 50, 0

    ESTADOS_VALIDOS = {
        "pendiente_pago", "pagado", "en_preparacion",
        "enviado", "entregado", "cancelado",
    }
    if estado and estado not in ESTADOS_VALIDOS:
        return error(f"Estado inválido. Válidos: {', '.join(ESTADOS_VALIDOS)}", 400)

    pedidos = PedidoModel.get_todos_pedidos(estado, limite, offset)
    return success(data={"pedidos": pedidos, "total": len(pedidos)})


# ─── PATCH /api/pedidos/<id>/guia ──────────────────────────
@pedidos_bp.route("/<int:id_pedido>/guia", methods=["PATCH"])
@require_role("admin")
def registrar_guia(id_pedido: int):
    """
    Registra la guía de envío y cambia el estado a 'enviado'.

    Body JSON:
        { "numero_guia": "...", "paqueteria": "..." }
    """
    body = request.get_json(silent=True) or {}
    numero_guia = (body.get("numero_guia") or "").strip()
    paqueteria  = (body.get("paqueteria")  or "").strip()

    if not numero_guia or not paqueteria:
        return error("numero_guia y paqueteria son requeridos.", 400)

    pedido = PedidoModel.get_pedido_detalle(id_pedido)
    if not pedido:
        return not_found("Pedido")
    if pedido["estado"] not in ("pagado", "en_preparacion"):
        return error(
            f"No se puede asignar guía a un pedido en estado '{pedido['estado']}'.",
            409,
        )

    PedidoModel.actualizar_guia(id_pedido, numero_guia, paqueteria)
    return success(mensaje="Guía de envío registrada.")


# ─── PATCH /api/pedidos/<id>/cancelar ──────────────────────
@pedidos_bp.route("/<int:id_pedido>/cancelar", methods=["PATCH"])
@require_auth
def cancelar_pedido(id_pedido: int):
    """
    Cancela un pedido en estado pendiente_pago.
    El cliente solo puede cancelar sus propios pedidos.
    """
    rol = g.current_user.get("rol")
    id_cliente_filtro = g.current_user["id_usuario"] if rol == "cliente" else None

    pedido = PedidoModel.get_pedido_detalle(id_pedido, id_cliente_filtro)
    if not pedido:
        return not_found("Pedido")

    if pedido["estado"] != "pendiente_pago":
        return error(
            f"Solo se pueden cancelar pedidos en estado 'pendiente_pago'. "
            f"Estado actual: '{pedido['estado']}'.",
            409,
        )

    body  = request.get_json(silent=True) or {}
    notas = body.get("notas", "Cancelado por el cliente.")

    PedidoModel.cancelar_pedido(id_pedido, notas)

    # Restaurar reservas de stock por cada línea
    for item in pedido.get("items", []):
        ProductoModel.restaurar_reserva(item["id_producto"], item["cantidad"])

    return success(mensaje="Pedido cancelado y stock restaurado.")
