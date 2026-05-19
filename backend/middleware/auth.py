"""
FPS Factory — middleware/auth.py
Decoradores de autenticación y autorización por rol.

SOLID:
  SRP → solo verifica identidad. No toca la BD.
  OCP → añadir un rol nuevo = añadir un decorador, sin tocar los existentes.

Uso:
    @require_auth          → cualquier usuario autenticado
    @require_role("admin") → solo admins
"""

from __future__ import annotations

from functools import wraps
from flask import request, g
import jwt

from utils.security import decode_token
from utils.responses import unauthorized, forbidden


def require_auth(f):
    """
    Verifica que la solicitud incluya un JWT válido en el header:
        Authorization: Bearer <token>

    Si es válido, almacena el payload en `g.current_user`.
    """
    @wraps(f)
    def decorated(*args, **kwargs):
        auth_header = request.headers.get("Authorization", "")

        if not auth_header.startswith("Bearer "):
            return unauthorized("Token de acceso requerido.")

        token = auth_header.split(" ", 1)[1].strip()

        try:
            payload = decode_token(token)
        except jwt.ExpiredSignatureError:
            return unauthorized("Tu sesión ha expirado. Inicia sesión nuevamente.")
        except jwt.InvalidTokenError:
            return unauthorized("Token inválido.")

        g.current_user = payload
        return f(*args, **kwargs)

    return decorated


def require_role(*roles: str):
    """
    Fábrica de decoradores que verifica que el usuario tenga
    uno de los roles indicados.

    Uso:
        @require_role("admin")
        @require_role("admin", "supervisor")
    """
    def decorator(f):
        @wraps(f)
        @require_auth       # Primero verificar que haya sesión
        def decorated(*args, **kwargs):
            user_role = g.current_user.get("rol", "")
            if user_role not in roles:
                return forbidden(
                    f"Solo los roles {roles} pueden acceder a este recurso."
                )
            return f(*args, **kwargs)
        return decorated
    return decorator
