"""
FPS Factory — utils/responses.py
Helpers para construir respuestas JSON consistentes.

Todos los endpoints devuelven el mismo envelope:
  {
    "ok":      true | false,
    "data":    <payload> | null,
    "mensaje": "..." | null,
    "codigo":  <http_status>
  }
"""

from flask import jsonify
from typing import Any


def success(data: Any = None, mensaje: str | None = None, status: int = 200):
    """Respuesta exitosa."""
    return jsonify({
        "ok":      True,
        "data":    data,
        "mensaje": mensaje,
        "codigo":  status,
    }), status


def error(mensaje: str, status: int = 400, data: Any = None):
    """Respuesta de error."""
    return jsonify({
        "ok":      False,
        "data":    data,
        "mensaje": mensaje,
        "codigo":  status,
    }), status


def not_found(recurso: str = "Recurso"):
    return error(f"{recurso} no encontrado.", 404)


def unauthorized(mensaje: str = "No autorizado."):
    return error(mensaje, 401)


def forbidden(mensaje: str = "Acceso denegado."):
    return error(mensaje, 403)


def server_error(mensaje: str = "Error interno del servidor."):
    return error(mensaje, 500)


def validation_error(errores: dict):
    """Errores de validación de campos (422)."""
    return jsonify({
        "ok":      False,
        "data":    errores,
        "mensaje": "Error de validación.",
        "codigo":  422,
    }), 422
