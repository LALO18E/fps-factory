"""
FPS Factory — routes/auth.py
Endpoints de autenticación.

    POST /api/auth/login
    POST /api/auth/registro
    GET  /api/auth/me          (requiere token)
    POST /api/auth/logout      (cliente invalida su token)
"""

from flask import Blueprint, request, g

from models    import usuario as UsuarioModel
from utils.security   import hash_password, verify_password, generate_token
from utils.validators import validate_input, LoginSchema, RegisterSchema
from utils.responses  import success, error, unauthorized, validation_error
from middleware.auth  import require_auth

auth_bp = Blueprint("auth", __name__, url_prefix="/api/auth")


# ─── POST /api/auth/login ──────────────────────────────────
@auth_bp.route("/login", methods=["POST"])
def login():
    """
    Inicia sesión y devuelve un JWT.

    Body JSON:
        { "email": "...", "password": "..." }

    Returns 200:
        { "ok": true, "data": { "token": "...", "usuario": {...} } }
    """
    data, errors = validate_input(LoginSchema, request.get_json(silent=True) or {})
    if errors:
        return validation_error(errors)

    usuario = UsuarioModel.find_by_email(data["email"])

    # Mismo mensaje para email o contraseña incorrectos (evitar user enumeration)
    if not usuario or not verify_password(data["password"], usuario["password_hash"]):
        return unauthorized("Correo o contraseña incorrectos.")

    if not usuario["activo"]:
        return error("Cuenta suspendida. Contacta a soporte.", 403)

    # Actualizar último acceso
    UsuarioModel.update_ultimo_acceso(usuario["id_usuario"])

    token = generate_token({
        "id_usuario": usuario["id_usuario"],
        "email":      usuario["email"],
        "rol":        usuario["rol"],
    })

    return success(
        data={
            "token": token,
            "usuario": {
                "id_usuario": usuario["id_usuario"],
                "nombre":     usuario["nombre"],
                "apellido":   usuario["apellido"],
                "email":      usuario["email"],
                "rol":        usuario["rol"],
            },
        },
        mensaje="Sesión iniciada correctamente.",
    )


# ─── POST /api/auth/registro ───────────────────────────────
@auth_bp.route("/registro", methods=["POST"])
def registro():
    """
    Registra un nuevo cliente y devuelve un JWT.

    Body JSON:
        { "nombre", "apellido", "email", "password", "telefono"? }
    """
    data, errors = validate_input(RegisterSchema, request.get_json(silent=True) or {})
    if errors:
        return validation_error(errors)

    if UsuarioModel.email_exists(data["email"]):
        return error("Este correo ya está registrado.", 409)

    password_hash = hash_password(data["password"])

    id_usuario = UsuarioModel.create_usuario(
        email         = data["email"],
        password_hash = password_hash,
        nombre        = data["nombre"],
        apellido      = data["apellido"],
        telefono      = data.get("telefono"),
        rol           = "cliente",
    )

    # Crear fila en Cliente (herencia 1-a-1)
    UsuarioModel.create_cliente(id_usuario)

    token = generate_token({
        "id_usuario": id_usuario,
        "email":      data["email"],
        "rol":        "cliente",
    })

    return success(
        data={
            "token": token,
            "usuario": {
                "id_usuario": id_usuario,
                "nombre":     data["nombre"],
                "apellido":   data["apellido"],
                "email":      data["email"],
                "rol":        "cliente",
            },
        },
        mensaje="Cuenta creada exitosamente.",
        status=201,
    )


# ─── GET /api/auth/me ──────────────────────────────────────
@auth_bp.route("/me", methods=["GET"])
@require_auth
def me():
    """Devuelve el perfil del usuario autenticado."""
    id_usuario = g.current_user["id_usuario"]
    rol        = g.current_user["rol"]

    if rol == "cliente":
        perfil = UsuarioModel.get_cliente_perfil(id_usuario)
    else:
        perfil = UsuarioModel.find_by_id(id_usuario)

    if not perfil:
        return error("Usuario no encontrado.", 404)

    # Nunca exponer el hash
    perfil.pop("password_hash", None)

    return success(data=perfil)


# ─── POST /api/auth/logout ─────────────────────────────────
@auth_bp.route("/logout", methods=["POST"])
@require_auth
def logout():
    """
    El cliente descarta su token.
    En una implementación con blacklist de JWTs, aquí se añadiría
    el jti (JWT ID) a Redis con TTL igual al tiempo restante del token.
    Por ahora el logout es stateless (el cliente borra el token).
    """
    return success(mensaje="Sesión cerrada.")
