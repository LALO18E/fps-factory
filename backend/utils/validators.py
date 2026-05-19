"""
FPS Factory — utils/validators.py
Esquemas de validación de entrada con marshmallow.

SOLID:
  OCP → añadir un endpoint = añadir un Schema, sin tocar los existentes.
  SRP → solo valida estructura y tipos; no toca la BD.
"""

from marshmallow import (
    Schema, fields, validate, validates, validates_schema,
    ValidationError, pre_load,
)
import re


# ─── Helpers de validación ─────────────────────────────────

CP_RE  = re.compile(r"^\d{5}$")
RFC_RE = re.compile(r"^[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}$", re.IGNORECASE)


def validate_cp(value: str):
    if not CP_RE.match(str(value)):
        raise ValidationError("El código postal debe tener exactamente 5 dígitos.")


def validate_rfc(value: str):
    if not RFC_RE.match(value.upper()):
        raise ValidationError("RFC con formato inválido (ej: XAXX010101000).")


# ─── Auth ──────────────────────────────────────────────────

class LoginSchema(Schema):
    email    = fields.Email(required=True, error_messages={"required": "El correo es obligatorio."})
    password = fields.Str(
        required=True,
        validate=validate.Length(min=1),
        error_messages={"required": "La contraseña es obligatoria."},
    )


class RegisterSchema(Schema):
    nombre   = fields.Str(required=True, validate=validate.Length(min=2, max=80))
    apellido = fields.Str(required=True, validate=validate.Length(min=2, max=80))
    email    = fields.Email(required=True)
    telefono = fields.Str(load_default=None, validate=validate.Length(max=20))
    password = fields.Str(
        required=True,
        validate=validate.Length(min=8, error="La contraseña debe tener mínimo 8 caracteres."),
    )

    @pre_load
    def strip_strings(self, data, **kwargs):
        return {k: v.strip() if isinstance(v, str) else v for k, v in data.items()}


# ─── Checkout / Pedido ─────────────────────────────────────

class DireccionEnvioSchema(Schema):
    envio_nombre    = fields.Str(required=True, validate=validate.Length(min=3, max=160))
    envio_telefono  = fields.Str(required=True, validate=validate.Length(min=7, max=20))
    envio_calle     = fields.Str(required=True, validate=validate.Length(min=2, max=200))
    envio_num_ext   = fields.Str(required=True, validate=validate.Length(min=1, max=20))
    envio_num_int   = fields.Str(load_default=None)
    envio_colonia   = fields.Str(required=True, validate=validate.Length(min=2, max=100))
    envio_cp        = fields.Str(required=True, validate=validate_cp)
    envio_ciudad    = fields.Str(required=True, validate=validate.Length(min=2, max=100))
    envio_estado    = fields.Str(required=True, validate=validate.Length(min=2, max=80))
    envio_referencia= fields.Str(load_default=None, validate=validate.Length(max=255))


class CFDISchema(Schema):
    """Solo se valida si requiere_factura es True."""
    cfdi_rfc         = fields.Str(required=True, validate=validate_rfc)
    cfdi_razon_social= fields.Str(required=True, validate=validate.Length(min=2, max=200))
    cfdi_regimen     = fields.Str(required=True, validate=validate.Length(max=100))
    cfdi_uso         = fields.Str(required=True, validate=validate.Length(max=10))
    cfdi_cp_fiscal   = fields.Str(required=True, validate=validate_cp)


class ItemPedidoSchema(Schema):
    id_producto      = fields.Int(required=True, validate=validate.Range(min=1))
    nombre_snapshot  = fields.Str(required=True)
    precio_unitario  = fields.Float(required=True, validate=validate.Range(min=0.01))
    cantidad         = fields.Int(required=True,  validate=validate.Range(min=1))
    iva_unitario     = fields.Float(required=True, validate=validate.Range(min=0))


class CrearPedidoSchema(Schema):
    metodo_pago      = fields.Str(
        required=True,
        validate=validate.OneOf(["stripe", "paypal"]),
    )
    notas_cliente    = fields.Str(load_default=None, validate=validate.Length(max=500))
    requiere_factura = fields.Bool(load_default=False)
    items            = fields.List(fields.Nested(ItemPedidoSchema), required=True, validate=validate.Length(min=1))

    # Dirección de envío (inlined)
    envio_nombre     = fields.Str(required=True)
    envio_telefono   = fields.Str(required=True)
    envio_calle      = fields.Str(required=True)
    envio_num_ext    = fields.Str(required=True)
    envio_num_int    = fields.Str(load_default=None)
    envio_colonia    = fields.Str(required=True)
    envio_cp         = fields.Str(required=True, validate=validate_cp)
    envio_ciudad     = fields.Str(required=True)
    envio_estado     = fields.Str(required=True)
    envio_referencia = fields.Str(load_default=None)

    # CFDI (opcionales, requeridos si requiere_factura=True)
    cfdi_rfc          = fields.Str(load_default=None)
    cfdi_razon_social = fields.Str(load_default=None)
    cfdi_regimen      = fields.Str(load_default=None)
    cfdi_uso          = fields.Str(load_default=None)
    cfdi_cp_fiscal    = fields.Str(load_default=None)

    @validates_schema
    def validate_cfdi(self, data, **kwargs):
        if data.get("requiere_factura"):
            missing = [
                f for f in ["cfdi_rfc", "cfdi_razon_social", "cfdi_regimen", "cfdi_uso", "cfdi_cp_fiscal"]
                if not data.get(f)
            ]
            if missing:
                raise ValidationError(
                    {f: ["Campo requerido para facturación."] for f in missing}
                )


# ─── Reserva de stock ──────────────────────────────────────

class ReservaStockSchema(Schema):
    id_producto   = fields.Int(required=True, validate=validate.Range(min=1))
    cantidad      = fields.Int(required=True, validate=validate.Range(min=1))
    session_token = fields.Str(required=True, validate=validate.Length(min=10, max=128))


# ─── Función helper ────────────────────────────────────────

def validate_input(schema_class: type[Schema], data: dict) -> tuple[dict, dict]:
    """
    Valida `data` con el esquema dado.

    Returns:
        (datos_limpios, errores)
        Si hay errores, datos_limpios es {} y errores es un dict.
        Si todo está bien, errores es {}.
    """
    try:
        clean = schema_class().load(data)
        return clean, {}
    except ValidationError as ve:
        return {}, ve.messages
