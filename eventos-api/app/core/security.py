import hmac
from datetime import datetime, timedelta, timezone
from uuid import UUID

import bcrypt
import jwt

from app.core.config import settings


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(password: str, password_hash: str) -> bool:
    try:
        return bcrypt.checkpw(password.encode("utf-8"), password_hash.encode("utf-8"))
    except ValueError:
        return False


def create_access_token(user_id: UUID, tenant_id: UUID) -> str:
    expire = datetime.now(timezone.utc) + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    payload = {"sub": str(user_id), "tenant_id": str(tenant_id), "exp": expire}
    return jwt.encode(payload, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM)


ADMIN_SUBJECT = "master-admin"
ADMIN_ROLE = "master"


def is_admin_identifier(email: str) -> bool:
    return email.strip().lower() == settings.ADMIN_EMAIL.strip().lower()


def verify_admin_credentials(email: str, password: str) -> bool:
    """Compara en tiempo constante contra las credenciales del administrador maestro."""
    email_ok = hmac.compare_digest(email.strip().lower().encode(), settings.ADMIN_EMAIL.strip().lower().encode())
    password_ok = hmac.compare_digest(password.encode(), settings.ADMIN_PASSWORD.encode())
    return email_ok and password_ok


def create_admin_token() -> str:
    expire = datetime.now(timezone.utc) + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    payload = {"sub": ADMIN_SUBJECT, "role": ADMIN_ROLE, "exp": expire}
    return jwt.encode(payload, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM)


def decode_access_token(token: str) -> dict:
    return jwt.decode(token, settings.JWT_SECRET, algorithms=[settings.JWT_ALGORITHM])
