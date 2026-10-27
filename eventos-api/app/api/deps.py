"""
Aislamiento multi-tenant en SQL Server (shared database / shared schema).

SQL Server no usa aqui Row-Level Security: el tenant sale SIEMPRE del JWT
(nunca del body ni de la URL) y cada consulta filtra por Events.TenantId.
Cualquier endpoint nuevo debe recibir `CurrentUser` y filtrar con
`user.tenant_id`.
"""

import uuid
from collections.abc import Generator
from dataclasses import dataclass

import jwt
from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core import activity
from app.core.security import ADMIN_ROLE, decode_access_token
from app.db.session import SessionLocal
from app.models import TenantUser, User

bearer_scheme = HTTPBearer(auto_error=False)


def get_db() -> Generator[Session, None, None]:
    with SessionLocal() as session:
        yield session


@dataclass(frozen=True)
class CurrentUser:
    user_id: uuid.UUID
    tenant_id: uuid.UUID


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
) -> CurrentUser:
    unauthorized = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid or missing token",
        headers={"WWW-Authenticate": "Bearer"},
    )
    if credentials is None:
        raise unauthorized
    try:
        payload = decode_access_token(credentials.credentials)
        return CurrentUser(
            user_id=uuid.UUID(payload["sub"]),
            tenant_id=uuid.UUID(payload["tenant_id"]),
        )
    except (jwt.PyJWTError, KeyError, ValueError):
        raise unauthorized


WRITER_ROLES = ("owner", "admin")


@dataclass(frozen=True)
class Member(CurrentUser):
    """Usuario autenticado con su rol vigente en el tenant (leido de la BD, no del token)."""

    role: str = "member"  # owner | admin | member


def get_member(
    user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Member:
    """Valida contra la BD que la cuenta siga activa y que aun pertenezca al tenant.

    Asi un sub-usuario desactivado o eliminado pierde el acceso al instante, sin esperar
    a que venza su token.
    """
    row = db.execute(
        select(TenantUser.role_name, User.is_active)
        .join(User, User.user_id == TenantUser.user_id)
        .where(TenantUser.tenant_id == user.tenant_id, TenantUser.user_id == user.user_id)
    ).first()
    if row is None or not row.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Account disabled or removed",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return Member(user_id=user.user_id, tenant_id=user.tenant_id, role=row.role_name)


def require_writer(
    request: Request,
    member: Member = Depends(get_member),
    db: Session = Depends(get_db),
) -> Member:
    """Crear / editar / borrar eventos: los perfiles `member` son de solo lectura."""
    if member.role not in WRITER_ROLES:
        activity.record(
            db,
            member.tenant_id,
            member.user_id,
            activity.DENIED_WRITE,
            detail=f"{request.method} {request.url.path}",
            ip=request.client.host if request.client else None,
        )
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Your profile is read-only")
    return member


def require_owner(member: Member = Depends(get_member)) -> Member:
    if member.role != "owner":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Only the organization owner can do this")
    return member


def require_master_admin(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
) -> None:
    """Solo deja pasar el token del administrador maestro (claim role=master)."""
    unauthorized = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid or missing token",
        headers={"WWW-Authenticate": "Bearer"},
    )
    if credentials is None:
        raise unauthorized
    try:
        payload = decode_access_token(credentials.credentials)
    except jwt.PyJWTError:
        raise unauthorized
    if payload.get("role") != ADMIN_ROLE:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Master administrator access required")
