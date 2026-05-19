"""
FPS Factory — app.py
Factory de la aplicación Flask.

SOLID:
  SRP → create_app() solo ensambla la app. La lógica está en los módulos.
  OCP → registrar un nuevo Blueprint = una línea, sin modificar el factory.

Uso:
    # Desarrollo
    python app.py

    # Producción (con gunicorn)
    gunicorn "app:create_app()" -w 4 -b 0.0.0.0:5000
"""

from __future__ import annotations

import logging
import os

from flask      import Flask
from flask_cors import CORS

from config           import get_config
from db.connection    import init_db_pool, close_db
from middleware.errors import register_error_handlers

# ─── Blueprints ────────────────────────────────────────────
from routes.auth     import auth_bp
from routes.catalogo import catalogo_bp
from routes.carrito  import carrito_bp
from routes.pedidos  import pedidos_bp
from routes.pagos    import pagos_bp


def create_app() -> Flask:
    """
    Crea y configura la instancia de Flask.

    Returns:
        app: Instancia configurada de Flask.
    """
    app = Flask(__name__)

    # ── Configuración ──────────────────────────────────────
    app.config.from_object(get_config())

    # ── Logging ────────────────────────────────────────────
    _configure_logging(app)

    # ── CORS ───────────────────────────────────────────────
    CORS(
        app,
        origins     = app.config["CORS_ORIGINS"],
        methods     = ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
        allow_headers = ["Content-Type", "Authorization", "X-Cron-Key"],
        supports_credentials = False,
    )

    # ── Pool de MySQL ──────────────────────────────────────
    init_db_pool(app)
    app.teardown_appcontext(close_db)

    # ── Manejadores de error globales ──────────────────────
    register_error_handlers(app)

    # ── Blueprints (prefijo /api ya incluido en cada Blueprint) ──
    app.register_blueprint(auth_bp)
    app.register_blueprint(catalogo_bp)
    app.register_blueprint(carrito_bp)
    app.register_blueprint(pedidos_bp)
    app.register_blueprint(pagos_bp)

    # ── Health check ───────────────────────────────────────
    @app.get("/api/health")
    def health():
        return {"ok": True, "servicio": "FPS Factory API", "version": "1.0.0"}

    app.logger.info(
        "[APP] FPS Factory iniciada en modo '%s'",
        os.getenv("FLASK_ENV", "development"),
    )

    return app


# ─── Logging helper ───────────────────────────────────────
def _configure_logging(app: Flask) -> None:
    level = logging.DEBUG if app.config.get("DEBUG") else logging.INFO
    logging.basicConfig(
        level  = level,
        format = "%(asctime)s [%(levelname)s] %(name)s: %(message)s",
        datefmt= "%Y-%m-%d %H:%M:%S",
    )


# ─── Punto de entrada para desarrollo ─────────────────────
if __name__ == "__main__":
    application = create_app()
    application.run(
        host  = "0.0.0.0",
        port  = int(os.getenv("PORT", 5000)),
        debug = application.config.get("DEBUG", False),
    )
