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
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.core.security import decode_access_token
from app.db.session import SessionLocal

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
