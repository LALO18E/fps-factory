"""
FPS Factory — models/pedido.py
Queries de las tablas Pedido y Detalle_Pedido.

SOLID:
  SRP → solo accede a datos de pedidos.
"""

from __future__ import annotations
from decimal import Decimal
from flask import current_app
from db.connection import execute_query, get_db


# ─── Cálculo de importes ───────────────────────────────────

def calcular_totales(items: list[dict]) -> dict:
    """
    Calcula subtotal, IVA, costo de envío y total.

    Args:
        items: Lista de dicts con keys precio_unitario, cantidad, iva_unitario.

    Returns:
        dict con subtotal, iva, costo_envio, total.
    """
    subtotal = sum(
        float(i["precio_unitario"]) * int(i["cantidad"])
        for i in items
    )
    iva = sum(
        float(i["iva_unitario"]) * int(i["cantidad"])
        for i in items
    )
    total_con_iva  = subtotal + iva
    umbral         = float(current_app.config["ENVIO_GRATIS_UMBRAL"])
    costo_envio_std= float(current_app.config["COSTO_ENVIO_STD"])
    costo_envio    = 0.0 if total_con_iva >= umbral else costo_envio_std
    total          = total_con_iva + costo_envio

    return {
        "subtotal":    round(subtotal,    2),
        "iva":         round(iva,         2),
        "costo_envio": round(costo_envio, 2),
        "total":       round(total,       2),
    }


# ─── Creación de pedido ────────────────────────────────────

def crear_pedido(
    id_cliente:    int,
    datos_envio:   dict,
    datos_cfdi:    dict,
    items:         list[dict],
    metodo_pago:   str,
    notas_cliente: str | None = None,
) -> int:
    """
    Inserta el Pedido y sus Detalle_Pedido en una transacción atómica.

    Returns:
        id_pedido del nuevo pedido.

    Raises:
        Exception si algún INSERT falla (hace rollback).
    """
    totales = calcular_totales(items)
    conn    = get_db()
    cursor  = conn.cursor(dictionary=True)

    try:
        # ── Insertar cabecera ──────────────────────────────
        cursor.execute(
            """
            INSERT INTO Pedido (
                id_cliente,
                estado, subtotal, iva, costo_envio, total,
                metodo_pago, moneda,
                envio_nombre, envio_calle, envio_num_ext, envio_num_int,
                envio_colonia, envio_ciudad, envio_estado, envio_cp,
                envio_telefono,
                requiere_factura,
                cfdi_rfc, cfdi_razon_social, cfdi_regimen, cfdi_uso, cfdi_cp_fiscal,
                notas_cliente
            ) VALUES (
                %s,
                'pendiente_pago', %s, %s, %s, %s,
                %s, 'MXN',
                %s, %s, %s, %s,
                %s, %s, %s, %s,
                %s,
                %s,
                %s, %s, %s, %s, %s,
                %s
            )
            """,
            (
                id_cliente,
                totales["subtotal"], totales["iva"],
                totales["costo_envio"], totales["total"],
                metodo_pago,
                datos_envio["envio_nombre"],
                datos_envio["envio_calle"],
                datos_envio["envio_num_ext"],
                datos_envio.get("envio_num_int"),
                datos_envio["envio_colonia"],
                datos_envio["envio_ciudad"],
                datos_envio["envio_estado"],
                datos_envio["envio_cp"],
                datos_envio["envio_telefono"],
                1 if datos_cfdi.get("requiere_factura") else 0,
                datos_cfdi.get("cfdi_rfc"),
                datos_cfdi.get("cfdi_razon_social"),
                datos_cfdi.get("cfdi_regimen"),
                datos_cfdi.get("cfdi_uso"),
                datos_cfdi.get("cfdi_cp_fiscal"),
                notas_cliente,
            ),
        )

        cursor.execute("SELECT LAST_INSERT_ID() AS id")
        id_pedido = cursor.fetchone()["id"]

        # ── Insertar líneas de detalle ─────────────────────
        for item in items:
            cursor.execute(
                """
                INSERT INTO Detalle_Pedido
                    (id_pedido, id_producto, nombre_snapshot,
                     precio_unitario, cantidad, iva_unitario)
                VALUES (%s, %s, %s, %s, %s, %s)
                """,
                (
                    id_pedido,
                    item["id_producto"],
                    item["nombre_snapshot"],
                    item["precio_unitario"],
                    item["cantidad"],
                    item["iva_unitario"],
                ),
            )

        conn.commit()
        return id_pedido

    except Exception:
        conn.rollback()
        raise
    finally:
        cursor.close()


# ─── Actualización de estado y pago ───────────────────────

def confirmar_pago(id_pedido: int, referencia_pago: str) -> None:
    """
    Marca el pedido como pagado y registra la referencia de Stripe/PayPal.
    """
    execute_query(
        """
        UPDATE Pedido
        SET  estado          = 'pagado',
             referencia_pago = %s,
             fecha_pago      = NOW()
        WHERE id_pedido = %s
          AND estado    = 'pendiente_pago'
        """,
        (referencia_pago, id_pedido),
        fetch="none",
        commit=True,
    )


def cancelar_pedido(id_pedido: int, notas: str | None = None) -> None:
    """Cancela un pedido en estado pendiente_pago."""
    execute_query(
        """
        UPDATE Pedido
        SET  estado         = 'cancelado',
             notas_internas = CONCAT_WS(' | ', notas_internas, %s)
        WHERE id_pedido     = %s
          AND estado        = 'pendiente_pago'
        """,
        (notas, id_pedido),
        fetch="none",
        commit=True,
    )


def actualizar_guia(id_pedido: int, numero_guia: str, paqueteria: str) -> None:
    execute_query(
        """
        UPDATE Pedido
        SET  numero_guia = %s,
             paqueteria  = %s,
             estado      = 'enviado',
             fecha_envio = NOW()
        WHERE id_pedido = %s
        """,
        (numero_guia, paqueteria, id_pedido),
        fetch="none",
        commit=True,
    )


# ─── Consultas ─────────────────────────────────────────────

def get_pedidos_cliente(id_cliente: int) -> list[dict]:
    """Historial de pedidos de un cliente."""
    return execute_query(
        """
        SELECT id_pedido, estado, fecha_pedido, total,
               metodo_pago, numero_guia, paqueteria, requiere_factura
        FROM   Pedido
        WHERE  id_cliente = %s
        ORDER  BY fecha_pedido DESC
        """,
        (id_cliente,),
        fetch="all",
    ) or []


def get_pedido_detalle(id_pedido: int, id_cliente: int | None = None) -> dict | None:
    """
    Devuelve el pedido con sus líneas.
    Si id_cliente se especifica, solo devuelve el pedido si le pertenece.
    """
    conditions = "p.id_pedido = %s"
    params: list = [id_pedido]

    if id_cliente is not None:
        conditions += " AND p.id_cliente = %s"
        params.append(id_cliente)

    pedido = execute_query(
        f"""
        SELECT p.*,
               u.email, u.nombre, u.apellido, u.telefono
        FROM   Pedido  p
        JOIN   Cliente c ON c.id_cliente = p.id_cliente
        JOIN   Usuario u ON u.id_usuario = c.id_cliente
        WHERE  {conditions}
        LIMIT  1
        """,
        params,
        fetch="one",
    )

    if not pedido:
        return None

    # Cargar líneas de detalle
    pedido["items"] = execute_query(
        """
        SELECT dp.*, p.imagen_url
        FROM   Detalle_Pedido dp
        JOIN   Producto       p  ON p.id_producto = dp.id_producto
        WHERE  dp.id_pedido = %s
        ORDER  BY dp.id_detalle
        """,
        (id_pedido,),
        fetch="all",
    ) or []

    return pedido


def get_todos_pedidos(
    estado: str | None = None,
    limite: int = 50,
    offset: int = 0,
) -> list[dict]:
    """Panel de admin: todos los pedidos con resumen."""
    conditions = "1=1"
    params: list = []

    if estado:
        conditions = "estado = %s"
        params.append(estado)

    return execute_query(
        f"""
        SELECT *
        FROM   v_pedidos_resumen
        WHERE  {conditions}
        ORDER  BY fecha_pedido DESC
        LIMIT  %s OFFSET %s
        """,
        [*params, limite, offset],
        fetch="all",
    ) or []
