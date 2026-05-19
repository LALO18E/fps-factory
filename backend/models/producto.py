"""
FPS Factory — models/producto.py
Queries de la tabla Producto y la vista v_catalogo_publico.

SOLID:
  SRP → solo accede a datos de productos.
"""

from __future__ import annotations
from db.connection import execute_query, call_procedure


# ─── Catálogo ──────────────────────────────────────────────

def get_catalogo(
    categoria: str | None = None,
    busqueda:  str | None = None,
    precio_min: float | None = None,
    precio_max: float | None = None,
    solo_stock: bool = False,
    solo_destacados: bool = False,
    orden: str = "default",
    limite: int = 100,
    offset: int = 0,
) -> list[dict]:
    """
    Devuelve el catálogo con filtros opcionales desde la vista pública.
    """
    conditions = ["1=1"]
    params: list = []

    if categoria:
        conditions.append("categoria = %s")
        params.append(categoria)

    if busqueda:
        conditions.append(
            "(MATCH(nombre, descripcion, marca) AGAINST (%s IN BOOLEAN MODE)"
            " OR nombre LIKE %s OR marca LIKE %s)"
        )
        term = f"%{busqueda}%"
        params += [busqueda, term, term]

    if precio_min is not None:
        conditions.append("precio_sin_iva >= %s")
        params.append(precio_min)

    if precio_max is not None:
        conditions.append("precio_sin_iva <= %s")
        params.append(precio_max)

    if solo_stock:
        conditions.append("stock_disponible > 0")

    if solo_destacados:
        conditions.append("destacado = 1")

    # Ordenamiento
    order_map = {
        "default":    "destacado DESC, fecha_actualizacion DESC",
        "price_asc":  "precio_sin_iva ASC",
        "price_desc": "precio_sin_iva DESC",
        "name_asc":   "nombre ASC",
        "featured":   "destacado DESC, precio_sin_iva DESC",
    }
    order_clause = order_map.get(orden, order_map["default"])

    sql = f"""
        SELECT *
        FROM   v_catalogo_publico
        WHERE  {" AND ".join(conditions)}
        ORDER  BY {order_clause}
        LIMIT  %s OFFSET %s
    """
    params += [limite, offset]

    return execute_query(sql, params, fetch="all") or []


def get_by_slug(slug: str) -> dict | None:
    """Devuelve un producto por su slug (URL-friendly)."""
    return execute_query(
        "SELECT * FROM v_catalogo_publico WHERE slug = %s LIMIT 1",
        (slug,),
        fetch="one",
    )


def get_by_id(id_producto: int) -> dict | None:
    """Devuelve un producto por PK (incluye datos de admin)."""
    return execute_query(
        """
        SELECT id_producto, slug, nombre, descripcion, marca, modelo,
               categoria, precio, precio_iva, stock, stock_reservado,
               (stock - stock_reservado) AS stock_disponible,
               imagen_url, imagenes_json, especificaciones,
               destacado, activo
        FROM   Producto
        WHERE  id_producto = %s
        LIMIT  1
        """,
        (id_producto,),
        fetch="one",
    )


def get_stock_disponible(id_producto: int) -> int:
    """Devuelve el stock disponible (stock - stock_reservado)."""
    row = execute_query(
        """
        SELECT (stock - stock_reservado) AS disponible
        FROM   Producto
        WHERE  id_producto = %s AND activo = 1
        LIMIT  1
        """,
        (id_producto,),
        fetch="one",
    )
    return row["disponible"] if row else 0


# ─── Reserva de stock ──────────────────────────────────────

def reservar_stock(
    id_producto:   int,
    id_usuario:    int,
    cantidad:      int,
    session_token: str,
    ttl_min:       int = 20,
) -> bool:
    """
    Llama al stored procedure sp_reservar_stock.

    Returns:
        True si la reserva fue exitosa, False si no hay stock suficiente.
    """
    args = [id_producto, id_usuario, cantidad, session_token, ttl_min, 0]
    result = call_procedure("sp_reservar_stock", args)
    # El último argumento OUT (índice 5) es p_resultado: 1=éxito, 0=sin stock
    return result[5] == 1


def liberar_reservas_expiradas() -> None:
    """Llama al stored procedure que limpia reservas vencidas."""
    call_procedure("sp_liberar_reservas_expiradas", [])


def descontar_stock(id_producto: int, cantidad: int) -> None:
    """
    Descuenta stock definitivamente al confirmar el pago.
    Reduce tanto stock como stock_reservado.
    """
    execute_query(
        """
        UPDATE Producto
        SET  stock          = stock          - %s,
             stock_reservado= stock_reservado - %s
        WHERE id_producto   = %s
          AND stock         >= %s
        """,
        (cantidad, cantidad, id_producto, cantidad),
        fetch="none",
        commit=True,
    )


def restaurar_reserva(id_producto: int, cantidad: int) -> None:
    """
    Libera una reserva cuando el pago falla.
    Solo reduce stock_reservado (el stock físico no cambia).
    """
    execute_query(
        """
        UPDATE Producto
        SET  stock_reservado = GREATEST(0, stock_reservado - %s)
        WHERE id_producto    = %s
        """,
        (cantidad, id_producto),
        fetch="none",
        commit=True,
    )
