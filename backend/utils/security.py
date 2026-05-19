"""
FPS Factory — utils/security.py
Hashing de contraseñas con bcrypt y tokens JWT.

SOLID:
  SRP → solo se ocupa de criptografía / tokens.
  DIP → las rutas llaman funciones; no saben si es bcrypt o argon2.
"""

from __future__ import annotations

import bcrypt
import jwt
from datetime import datetime, timedelta, timezone
from flask import current_app
import logging

logger = logging.getLogger(__name__)


# ─── Passwords ────────────────────────────────────────────

def hash_password(plain: str) -> str:
    """
    Genera un hash bcrypt de la contraseña.
    Cost factor 12 (recomendado para producción).
    """
    salt   = bcrypt.gensalt(rounds=12)
    hashed = bcrypt.hashpw(plain.encode("utf-8"), salt)
    return hashed.decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    """
    Verifica una contraseña contra su hash almacenado.
    Usa comparación en tiempo constante para evitar timing attacks.
    """
    try:
        return bcrypt.checkpw(
            plain.encode("utf-8"),
            hashed.encode("utf-8"),
        )
    except Exception:
        return False


# ─── JWT ──────────────────────────────────────────────────

def generate_token(payload: dict) -> str:
    """
    Genera un JWT firmado con el secreto de la app.

    Args:
        payload: Datos a incluir en el token (sin 'exp', se añade aquí).

    Returns:
        Token JWT como string.
    """
    expiry_hours = current_app.config["JWT_EXPIRY_HOURS"]
    secret       = current_app.config["JWT_SECRET"]

    data = {
        **payload,
        "iat": datetime.now(timezone.utc),
        "exp": datetime.now(timezone.utc) + timedelta(hours=expiry_hours),
    }

    return jwt.encode(data, secret, algorithm="HS256")


def decode_token(token: str) -> dict:
    """
    Decodifica y verifica un JWT.

    Returns:
        Payload decodificado.

    Raises:
        jwt.ExpiredSignatureError  → token expirado
        jwt.InvalidTokenError      → token inválido
    """
    secret = current_app.config["JWT_SECRET"]
    return jwt.decode(token, secret, algorithms=["HS256"])
