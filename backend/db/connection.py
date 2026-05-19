"""
FPS Factory — db/connection.py
Gestión del pool de conexiones a MySQL.

SOLID:
  SRP → solo gestiona conexiones. No ejecuta lógica de negocio.
  DIP → las capas superiores reciben una conexión; no saben
        cómo se obtuvo.

Uso:
    from db.connection import get_db, close_db

    conn = get_db()
    cursor = conn.cursor(dictionary=True)
    cursor.execute("SELECT ...")
    # La conexión se devuelve al pool automáticamente
    # al terminar el contexto de solicitud de Flask.
"""

from __future__ import annotations

import mysql.connector
from mysql.connector.pooling import MySQLConnectionPool
from flask import g, current_app
import logging

logger = logging.getLogger(__name__)

# El pool se crea UNA vez al iniciar la app (init_db_pool)
_pool: MySQLConnectionPool | None = None


def init_db_pool(app) -> None:
    """
    Inicializa el pool de conexiones usando la configuración de Flask.
    Debe llamarse desde el factory de la app (app.py).
    """
    global _pool

    cfg = app.config

    _pool = MySQLConnectionPool(
        pool_name="fps_pool",
        pool_size=cfg["DB_POOL_SIZE"],
        pool_reset_session=True,
        host=cfg["DB_HOST"],
        port=cfg["DB_PORT"],
        database=cfg["DB_NAME"],
        user=cfg["DB_USER"],
        password=cfg["DB_PASSWORD"],
        charset="utf8mb4",
        collation="utf8mb4_unicode_ci",
        time_zone="-06:00",          # México Centro
        autocommit=False,
        connection_timeout=cfg["DB_POOL_TIMEOUT"],
    )

    logger.info(
        "[DB] Pool inicializado: %s:%s/%s (size=%s)",
        cfg["DB_HOST"], cfg["DB_PORT"], cfg["DB_NAME"], cfg["DB_POOL_SIZE"],
    )


def get_db() -> mysql.connector.MySQLConnection:
    """
    Obtiene una conexión del pool para la solicitud actual.
    Se almacena en el contexto de solicitud de Flask (g)
    para reutilizarla dentro del mismo request.
    """
    if "db" not in g:
        if _pool is None:
            raise RuntimeError("El pool de BD no ha sido inicializado. Llama a init_db_pool().")
        g.db = _pool.get_connection()
    return g.db


def close_db(e=None) -> None:
    """
    Devuelve la conexión al pool al terminar la solicitud.
    Se registra con app.teardown_appcontext en app.py.
    """
    db = g.pop("db", None)
    if db is not None and db.is_connected():
        db.close()


def execute_query(
    sql: str,
    params: tuple | dict = (),
    *,
    fetch: str = "all",       # "all" | "one" | "none"
    commit: bool = False,
) -> list[dict] | dict | None:
    """
    Ejecuta una query y devuelve resultados como dicts.

    Args:
        sql:    Sentencia SQL con placeholders %s o %(nombre)s
        params: Parámetros posicionales o por nombre
        fetch:  "all" → lista, "one" → dict, "none" → None
        commit: Si True, hace commit tras la ejecución

    Returns:
        Lista de filas, una fila, o None según `fetch`.

    Raises:
        mysql.connector.Error en caso de fallo.
    """
    conn   = get_db()
    cursor = conn.cursor(dictionary=True)

    try:
        cursor.execute(sql, params)

        if commit:
            conn.commit()

        if fetch == "all":
            return cursor.fetchall()
        if fetch == "one":
            return cursor.fetchone()
        return None

    except mysql.connector.Error:
        if commit:
            conn.rollback()
        raise
    finally:
        cursor.close()


def call_procedure(
    proc_name: str,
    args: list,
    *,
    commit: bool = True,
) -> list:
    """
    Llama a un stored procedure y devuelve sus parámetros OUT.

    Args:
        proc_name: Nombre del procedure (ej: 'sp_reservar_stock')
        args:      Lista de argumentos IN/OUT.
                   Los OUT deben ser variables; se pasan como None
                   y se recuperan del result set.
        commit:    Si True, hace commit tras la llamada.

    Returns:
        args actualizados con los valores OUT.
    """
    conn   = get_db()
    cursor = conn.cursor()

    try:
        result_args = cursor.callproc(proc_name, args)
        if commit:
            conn.commit()
        return list(result_args)
    except mysql.connector.Error:
        if commit:
            conn.rollback()
        raise
    finally:
        cursor.close()
