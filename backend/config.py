"""
FPS Factory — config.py
Clases de configuración para los entornos de Flask.

SOLID:
  OCP → añadir un entorno (staging, test) = añadir una clase,
        sin modificar las existentes.
"""

import os
from dotenv import load_dotenv

load_dotenv()


class BaseConfig:
    """Configuración compartida por todos los entornos."""

    # Flask
    SECRET_KEY: str = os.getenv("SECRET_KEY", "dev-secret-fallback")

    # JWT
    JWT_SECRET: str          = os.getenv("JWT_SECRET", "jwt-dev-secret")
    JWT_EXPIRY_HOURS: int    = int(os.getenv("JWT_EXPIRY_HOURS", 24))

    # MySQL
    DB_HOST: str     = os.getenv("DB_HOST",     "localhost")
    DB_PORT: int     = int(os.getenv("DB_PORT",  3306))
    DB_NAME: str     = os.getenv("DB_NAME",     "fps_factory")
    DB_USER: str     = os.getenv("DB_USER",     "root")
    DB_PASSWORD: str = os.getenv("DB_PASSWORD", "")
    DB_POOL_SIZE: int    = int(os.getenv("DB_POOL_SIZE",    5))
    DB_POOL_TIMEOUT: int = int(os.getenv("DB_POOL_TIMEOUT", 30))

    # Stripe
    STRIPE_SECRET_KEY:      str = os.getenv("STRIPE_SECRET_KEY",      "")
    STRIPE_WEBHOOK_SECRET:  str = os.getenv("STRIPE_WEBHOOK_SECRET",  "")

    # PayPal
    PAYPAL_CLIENT_ID:     str = os.getenv("PAYPAL_CLIENT_ID",     "")
    PAYPAL_CLIENT_SECRET: str = os.getenv("PAYPAL_CLIENT_SECRET", "")
    PAYPAL_MODE:          str = os.getenv("PAYPAL_MODE",          "sandbox")

    # CORS
    CORS_ORIGINS: list[str] = [
        o.strip()
        for o in os.getenv("CORS_ORIGINS", "http://localhost:8080").split(",")
    ]

    # Reglas de negocio
    ENVIO_GRATIS_UMBRAL: float = float(os.getenv("ENVIO_GRATIS_UMBRAL", 4000))
    COSTO_ENVIO_STD:     float = float(os.getenv("COSTO_ENVIO_STD",      149))
    STOCK_RESERVA_TTL_MIN: int = int(os.getenv("STOCK_RESERVA_TTL_MIN",  20))


class DevelopmentConfig(BaseConfig):
    DEBUG        = True
    TESTING      = False
    JSON_SORT_KEYS = False


class ProductionConfig(BaseConfig):
    DEBUG   = False
    TESTING = False


# Mapa para seleccionar la config por nombre
CONFIG_MAP = {
    "development": DevelopmentConfig,
    "production":  ProductionConfig,
}


def get_config() -> type[BaseConfig]:
    env = os.getenv("FLASK_ENV", "development")
    return CONFIG_MAP.get(env, DevelopmentConfig)
