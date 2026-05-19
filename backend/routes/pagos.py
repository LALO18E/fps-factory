"""
FPS Factory — routes/pagos.py
Endpoints de procesamiento de pagos.

    POST /api/pagos/stripe/crear-intent    → crea un PaymentIntent
    POST /api/pagos/stripe/webhook         → webhook de eventos Stripe
    POST /api/pagos/paypal/crear-orden     → crea una orden PayPal
    POST /api/pagos/paypal/capturar        → captura el pago aprobado

Regla de negocio crítica:
  - El stock se descuenta DEFINITIVAMENTE solo cuando el pago se confirma.
  - Si falla, se llama a restaurar_reserva() para liberar el stock.
  - Nunca se guardan datos bancarios.
"""

from __future__ import annotations

import hmac
import hashlib
import json
import logging
import urllib.request
import urllib.parse
import base64

import stripe
from flask import Blueprint, request, g, current_app

from models           import pedido   as PedidoModel
from models           import producto as ProductoModel
from utils.responses  import success, error, server_error
from middleware.auth  import require_auth

pagos_bp = Blueprint("pagos", __name__, url_prefix="/api/pagos")
logger   = logging.getLogger(__name__)


# ════════════════════════════════════════════════════════════
#  STRIPE
# ════════════════════════════════════════════════════════════

# ─── POST /api/pagos/stripe/crear-intent ──────────────────
@pagos_bp.route("/stripe/crear-intent", methods=["POST"])
@require_auth
def stripe_crear_intent():
    """
    Crea un PaymentIntent de Stripe para el pedido dado.

    Body JSON:
        { "id_pedido": 42 }

    Flujo:
      1. Verificar que el pedido pertenece al cliente y está pendiente.
      2. Crear PaymentIntent en Stripe con el monto exacto.
      3. Devolver el client_secret al front-end para que confirme el pago.

    El front-end usa:
        stripe.confirmCardPayment(client_secret, { payment_method: {...} })
    """
    body      = request.get_json(silent=True) or {}
    id_pedido = body.get("id_pedido")

    if not id_pedido:
        return error("id_pedido es requerido.", 400)

    id_cliente = g.current_user["id_usuario"]
    pedido     = PedidoModel.get_pedido_detalle(int(id_pedido), id_cliente)

    if not pedido:
        return error("Pedido no encontrado.", 404)
    if pedido["estado"] != "pendiente_pago":
        return error(f"El pedido ya está en estado '{pedido['estado']}'.", 409)
    if pedido["metodo_pago"] != "stripe":
        return error("Este pedido no está configurado para pago con Stripe.", 400)

    stripe.api_key = current_app.config["STRIPE_SECRET_KEY"]

    # Stripe maneja centavos (MXN × 100)
    monto_centavos = int(round(float(pedido["total"]) * 100))

    try:
        intent = stripe.PaymentIntent.create(
            amount              = monto_centavos,
            currency            = "mxn",
            metadata            = {
                "id_pedido":  str(id_pedido),
                "id_cliente": str(id_cliente),
            },
            automatic_payment_methods = {"enabled": True},
        )
    except stripe.error.StripeError as e:
        logger.error("[Stripe] Error creando intent: %s", e)
        return server_error("Error al procesar el pago con Stripe.")

    return success(data={
        "client_secret": intent.client_secret,
        "intent_id":     intent.id,
        "monto":         pedido["total"],
    })


# ─── POST /api/pagos/stripe/webhook ───────────────────────
@pagos_bp.route("/stripe/webhook", methods=["POST"])
def stripe_webhook():
    """
    Webhook de Stripe. Recibe eventos y actualiza el estado del pedido.

    Eventos manejados:
      - payment_intent.succeeded    → confirmar pago, descontar stock
      - payment_intent.payment_failed → cancelar pedido, restaurar stock

    Verificación de firma con STRIPE_WEBHOOK_SECRET.
    """
    payload    = request.get_data()
    sig_header = request.headers.get("Stripe-Signature", "")
    webhook_secret = current_app.config["STRIPE_WEBHOOK_SECRET"]

    stripe.api_key = current_app.config["STRIPE_SECRET_KEY"]

    try:
        event = stripe.Webhook.construct_event(payload, sig_header, webhook_secret)
    except stripe.error.SignatureVerificationError:
        logger.warning("[Stripe Webhook] Firma inválida.")
        return error("Firma inválida.", 400)
    except Exception as e:
        logger.error("[Stripe Webhook] Error: %s", e)
        return error("Error procesando webhook.", 400)

    intent      = event["data"]["object"]
    id_pedido   = int(intent["metadata"].get("id_pedido", 0))

    if event["type"] == "payment_intent.succeeded":
        _confirmar_pago_stripe(id_pedido, intent["id"])

    elif event["type"] == "payment_intent.payment_failed":
        _fallar_pago(id_pedido, f"Stripe: {intent.get('last_payment_error', {}).get('message', 'desconocido')}")

    return success(mensaje="Webhook procesado.")


def _confirmar_pago_stripe(id_pedido: int, intent_id: str) -> None:
    """Confirma el pago y descuenta stock de forma atómica."""
    if not id_pedido:
        return

    pedido = PedidoModel.get_pedido_detalle(id_pedido)
    if not pedido or pedido["estado"] != "pendiente_pago":
        return

    try:
        PedidoModel.confirmar_pago(id_pedido, intent_id)
        for item in pedido.get("items", []):
            ProductoModel.descontar_stock(item["id_producto"], item["cantidad"])
        logger.info("[Stripe] Pedido #%s confirmado.", id_pedido)
    except Exception as e:
        logger.exception("[Stripe] Error confirmando pedido #%s: %s", id_pedido, e)


def _fallar_pago(id_pedido: int, motivo: str) -> None:
    """Cancela el pedido y restaura el stock reservado."""
    if not id_pedido:
        return

    pedido = PedidoModel.get_pedido_detalle(id_pedido)
    if not pedido or pedido["estado"] != "pendiente_pago":
        return

    try:
        PedidoModel.cancelar_pedido(id_pedido, motivo)
        for item in pedido.get("items", []):
            ProductoModel.restaurar_reserva(item["id_producto"], item["cantidad"])
        logger.info("[Pago] Pedido #%s cancelado. Motivo: %s", id_pedido, motivo)
    except Exception as e:
        logger.exception("[Pago] Error cancelando pedido #%s: %s", id_pedido, e)


# ════════════════════════════════════════════════════════════
#  PAYPAL
# ════════════════════════════════════════════════════════════

def _paypal_base_url() -> str:
    mode = current_app.config["PAYPAL_MODE"]
    return (
        "https://api-m.sandbox.paypal.com"
        if mode == "sandbox"
        else "https://api-m.paypal.com"
    )


def _paypal_access_token() -> str:
    """Obtiene un access token de PayPal via OAuth2 client_credentials."""
    client_id     = current_app.config["PAYPAL_CLIENT_ID"]
    client_secret = current_app.config["PAYPAL_CLIENT_SECRET"]
    base          = _paypal_base_url()

    credentials = base64.b64encode(
        f"{client_id}:{client_secret}".encode()
    ).decode()

    data = urllib.parse.urlencode({"grant_type": "client_credentials"}).encode()
    req  = urllib.request.Request(
        f"{base}/v1/oauth2/token",
        data    = data,
        headers = {
            "Authorization": f"Basic {credentials}",
            "Content-Type":  "application/x-www-form-urlencoded",
        },
    )

    with urllib.request.urlopen(req) as resp:
        body = json.loads(resp.read())

    return body["access_token"]


def _paypal_request(method: str, path: str, body: dict | None = None) -> dict:
    """Helper para llamadas a la API REST de PayPal."""
    token   = _paypal_access_token()
    base    = _paypal_base_url()
    payload = json.dumps(body).encode() if body else None

    req = urllib.request.Request(
        f"{base}{path}",
        data    = payload,
        method  = method,
        headers = {
            "Authorization":  f"Bearer {token}",
            "Content-Type":   "application/json",
            "Accept":         "application/json",
        },
    )

    with urllib.request.urlopen(req) as resp:
        return json.loads(resp.read())


# ─── POST /api/pagos/paypal/crear-orden ───────────────────
@pagos_bp.route("/paypal/crear-orden", methods=["POST"])
@require_auth
def paypal_crear_orden():
    """
    Crea una orden en PayPal y devuelve la URL de aprobación.

    Body JSON:
        { "id_pedido": 42 }

    El front-end redirige al usuario a approval_url.
    Tras aprobar, PayPal redirige a PAYPAL_RETURN_URL con el token.
    """
    body      = request.get_json(silent=True) or {}
    id_pedido = body.get("id_pedido")

    if not id_pedido:
        return error("id_pedido es requerido.", 400)

    id_cliente = g.current_user["id_usuario"]
    pedido     = PedidoModel.get_pedido_detalle(int(id_pedido), id_cliente)

    if not pedido:
        return error("Pedido no encontrado.", 404)
    if pedido["estado"] != "pendiente_pago":
        return error(f"El pedido ya está en estado '{pedido['estado']}'.", 409)
    if pedido["metodo_pago"] != "paypal":
        return error("Este pedido no está configurado para pago con PayPal.", 400)

    try:
        order = _paypal_request("POST", "/v2/checkout/orders", {
            "intent": "CAPTURE",
            "purchase_units": [{
                "reference_id": str(id_pedido),
                "amount": {
                    "currency_code": "MXN",
                    "value": str(round(float(pedido["total"]), 2)),
                },
                "description": f"FPS Factory — Pedido #{id_pedido}",
            }],
            "application_context": {
                "return_url": f"{current_app.config.get('FRONTEND_URL', 'http://localhost:8080')}/checkout.html?paypal=ok&pedido={id_pedido}",
                "cancel_url": f"{current_app.config.get('FRONTEND_URL', 'http://localhost:8080')}/checkout.html?paypal=cancel",
                "brand_name": "FPS Factory",
                "landing_page": "BILLING",
                "user_action": "PAY_NOW",
            },
        })
    except Exception as e:
        logger.error("[PayPal] Error creando orden: %s", e)
        return server_error("Error al crear la orden en PayPal.")

    approval_url = next(
        (link["href"] for link in order.get("links", []) if link["rel"] == "approve"),
        None,
    )

    if not approval_url:
        return server_error("No se pudo obtener la URL de aprobación de PayPal.")

    return success(data={
        "order_id":     order["id"],
        "approval_url": approval_url,
        "id_pedido":    id_pedido,
    })


# ─── POST /api/pagos/paypal/capturar ──────────────────────
@pagos_bp.route("/paypal/capturar", methods=["POST"])
@require_auth
def paypal_capturar():
    """
    Captura el pago de PayPal tras la aprobación del usuario.

    Body JSON:
        { "order_id": "...", "id_pedido": 42 }
    """
    body      = request.get_json(silent=True) or {}
    order_id  = body.get("order_id")
    id_pedido = body.get("id_pedido")

    if not order_id or not id_pedido:
        return error("order_id e id_pedido son requeridos.", 400)

    id_cliente = g.current_user["id_usuario"]
    pedido     = PedidoModel.get_pedido_detalle(int(id_pedido), id_cliente)

    if not pedido:
        return error("Pedido no encontrado.", 404)
    if pedido["estado"] != "pendiente_pago":
        return error(f"El pedido ya está en estado '{pedido['estado']}'.", 409)

    try:
        capture = _paypal_request(
            "POST",
            f"/v2/checkout/orders/{order_id}/capture",
        )
    except Exception as e:
        logger.error("[PayPal] Error capturando pago: %s", e)
        _fallar_pago(int(id_pedido), f"PayPal capture error: {e}")
        return server_error("Error al capturar el pago en PayPal.")

    capture_status = capture.get("status")

    if capture_status != "COMPLETED":
        _fallar_pago(int(id_pedido), f"PayPal status: {capture_status}")
        return error(f"Pago no completado en PayPal. Estado: {capture_status}", 402)

    # Obtener el capture_id para la referencia
    capture_id = (
        capture.get("purchase_units", [{}])[0]
               .get("payments", {})
               .get("captures", [{}])[0]
               .get("id", order_id)
    )

    # Confirmar en nuestra BD y descontar stock
    PedidoModel.confirmar_pago(int(id_pedido), capture_id)
    for item in pedido.get("items", []):
        ProductoModel.descontar_stock(item["id_producto"], item["cantidad"])

    logger.info("[PayPal] Pedido #%s confirmado. Capture: %s", id_pedido, capture_id)

    return success(
        data={"capture_id": capture_id, "id_pedido": id_pedido},
        mensaje="Pago confirmado exitosamente.",
    )
