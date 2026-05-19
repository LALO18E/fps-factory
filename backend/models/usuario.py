"""
FPS Factory — models/usuario.py
Queries de las tablas Usuario y Cliente.

SOLID:
  SRP → solo accede a datos. No hace hashing ni genera tokens.
  OCP → nuevas consultas = nuevas funciones, sin tocar las existentes.
"""

from __future__ import annotations
from db.connection import execute_query


# ─── Lectura ───────────────────────────────────────────────

def find_by_email(email: str) -> dict | None:
    """Busca un usuario por email (incluye password_hash para login)."""
    return execute_query(
        """
        SELECT id_usuario, email, password_hash, nombre, apellido,
               telefono, rol, activo
        FROM   Usuario
        WHERE  email = %s
        LIMIT  1
        """,
        (email,),
        fetch="one",
    )


def find_by_id(id_usuario: int) -> dict | None:
    """Busca un usuario por PK (sin password_hash)."""
    return execute_query(
        """
        SELECT id_usuario, email, nombre, apellido, telefono, rol, activo,
               fecha_registro, ultimo_acceso
        FROM   Usuario
        WHERE  id_usuario = %s
        LIMIT  1
        """,
        (id_usuario,),
        fetch="one",
    )


def get_cliente_perfil(id_usuario: int) -> dict | None:
    """Devuelve el perfil completo del cliente (Usuario + Cliente JOIN)."""
    return execute_query(
        """
        SELECT u.id_usuario, u.email, u.nombre, u.apellido, u.telefono,
               c.rfc, c.razon_social, c.regimen_fiscal,
               c.uso_cfdi_default, c.cp_fiscal,
               c.dir_calle, c.dir_num_ext, c.dir_num_int,
               c.dir_colonia, c.dir_ciudad, c.dir_estado,
               c.dir_cp, c.dir_referencia
        FROM   Usuario u
        JOIN   Cliente c ON c.id_cliente = u.id_usuario
        WHERE  u.id_usuario = %s
        LIMIT  1
        """,
        (id_usuario,),
        fetch="one",
    )


def email_exists(email: str) -> bool:
    """Verifica si un email ya está registrado."""
    row = execute_query(
        "SELECT 1 FROM Usuario WHERE email = %s LIMIT 1",
        (email,),
        fetch="one",
    )
    return row is not None


# ─── Escritura ─────────────────────────────────────────────

def create_usuario(
    email: str,
    password_hash: str,
    nombre: str,
    apellido: str,
    telefono: str | None = None,
    rol: str = "cliente",
) -> int:
    """
    Crea un nuevo Usuario y devuelve su id_usuario.
    """
    execute_query(
        """
        INSERT INTO Usuario (email, password_hash, nombre, apellido, telefono, rol)
        VALUES (%s, %s, %s, %s, %s, %s)
        """,
        (email, password_hash, nombre, apellido, telefono, rol),
        fetch="none",
        commit=True,
    )
    row = execute_query(
        "SELECT LAST_INSERT_ID() AS id", fetch="one"
    )
    return row["id"]


def create_cliente(id_usuario: int) -> None:
    """
    Crea la fila en Cliente para el usuario recién creado.
    (Los datos de dirección / CFDI se actualizan después.)
    """
    execute_query(
        "INSERT INTO Cliente (id_cliente) VALUES (%s)",
        (id_usuario,),
        fetch="none",
        commit=True,
    )


def update_ultimo_acceso(id_usuario: int) -> None:
    """Registra el momento del último login."""
    execute_query(
        "UPDATE Usuario SET ultimo_acceso = NOW() WHERE id_usuario = %s",
        (id_usuario,),
        fetch="none",
        commit=True,
    )


def update_direccion(
    id_usuario: int,
    calle: str,
    num_ext: str,
    num_int: str | None,
    colonia: str,
    ciudad: str,
    estado: str,
    cp: str,
    referencia: str | None = None,
) -> None:
    """Actualiza la dirección de entrega predeterminada del cliente."""
    execute_query(
        """
        UPDATE Cliente
        SET  dir_calle     = %s,
             dir_num_ext   = %s,
             dir_num_int   = %s,
             dir_colonia   = %s,
             dir_ciudad    = %s,
             dir_estado    = %s,
             dir_cp        = %s,
             dir_referencia= %s
        WHERE id_cliente = %s
        """,
        (calle, num_ext, num_int, colonia, ciudad, estado, cp, referencia, id_usuario),
        fetch="none",
        commit=True,
    )
