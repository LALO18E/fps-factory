"""
FPS Factory — middleware/errors.py
Manejadores globales de errores HTTP y excepciones de MySQL.

Se registran en el factory de la app (app.py).
"""

import logging
import mysql.connector
from flask import jsonify

logger = logging.getLogger(__name__)


def register_error_handlers(app) -> None:
    """Registra todos los manejadores en la instancia de Flask."""

    @app.errorhandler(400)
    def bad_request(e):
        return _json_error("Solicitud malformada.", 400)

    @app.errorhandler(401)
    def unauthorized(e):
        return _json_error("No autorizado.", 401)

    @app.errorhandler(403)
    def forbidden(e):
        return _json_error("Acceso denegado.", 403)

    @app.errorhandler(404)
    def not_found(e):
        return _json_error("Recurso no encontrado.", 404)

    @app.errorhandler(405)
    def method_not_allowed(e):
        return _json_error("Método HTTP no permitido.", 405)

    @app.errorhandler(422)
    def unprocessable(e):
        return _json_error("Error de validación.", 422)

    @app.errorhandler(429)
    def too_many_requests(e):
        return _json_error("Demasiadas solicitudes. Intenta más tarde.", 429)

    @app.errorhandler(500)
    def internal_error(e):
        logger.exception("[500] Error interno:")
        return _json_error("Error interno del servidor.", 500)

    @app.errorhandler(mysql.connector.Error)
    def handle_db_error(e):
        logger.exception("[DB] Error de base de datos:")
        # No exponer detalles de MySQL al cliente
        return _json_error("Error de base de datos.", 500)

    @app.errorhandler(Exception)
    def handle_generic(e):
        logger.exception("[UNHANDLED] Excepción no manejada:")
        return _json_error("Error inesperado.", 500)


def _json_error(mensaje: str, status: int):
    return jsonify({
        "ok":      False,
        "data":    None,
        "mensaje": mensaje,
        "codigo":  status,
    }), status
