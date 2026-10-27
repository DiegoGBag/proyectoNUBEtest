import re
import uuid

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import Member, get_db, get_member
from app.core import activity, audit
from app.core.security import (
    create_access_token,
    create_admin_token,
    hash_password,
    is_admin_identifier,
    verify_admin_credentials,
    verify_password,
)
from app.models import Tenant, TenantUser, User
from app.schemas.auth import LoginRequest, MeResponse, RegisterRequest, TokenResponse

router = APIRouter(prefix="/api/auth", tags=["auth"])


def _slugify(name: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")
    return slug or "tenant"


@router.post("/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
def register(body: RegisterRequest, db: Session = Depends(get_db)):
    """Crea un tenant nuevo y a su primer usuario (owner)."""
    email = body.email.lower()
    if db.scalar(select(User.user_id).where(User.email == email)):
        raise HTTPException(status.HTTP_409_CONFLICT, "Email already registered")

    slug = _slugify(body.tenant_name)
    if db.scalar(select(Tenant.tenant_id).where(Tenant.slug == slug)):
        slug = f"{slug}-{uuid.uuid4().hex[:6]}"

    tenant = Tenant(name=body.tenant_name, slug=slug)
    user = User(
        full_name=body.full_name,
        email=email,
        password_hash=hash_password(body.password),
    )
    db.add_all([tenant, user])
    db.flush()
    db.add(TenantUser(tenant_id=tenant.tenant_id, user_id=user.user_id, role_name="owner"))
    db.commit()

    return TokenResponse(access_token=create_access_token(user.user_id, tenant.tenant_id))


@router.post("/login", response_model=TokenResponse)
def login(body: LoginRequest, request: Request, db: Session = Depends(get_db)):
    identifier = body.email.strip().lower()
    ip = request.client.host if request.client else None
    audit.check_throttle(identifier)

    # Administrador maestro: credenciales en codigo, sin fila en Users ni tenant.
    if is_admin_identifier(identifier):
        if not verify_admin_credentials(identifier, body.password):
            audit.record_login(identifier, False, kind="admin", ip=ip)
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid credentials")
        audit.record_login(identifier, True, kind="admin", ip=ip)
        return TokenResponse(access_token=create_admin_token(), role="master")

    user = db.scalar(select(User).where(User.email == identifier))
    if user is None or not user.is_active or not verify_password(body.password, user.password_hash):
        audit.record_login(identifier, False, ip=ip)
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid credentials")

    # Un usuario puede pertenecer a varios tenants; por ahora se usa el primero
    # al que se unio. (Selector de tenant: pendiente.)
    tenant_id = db.scalar(
        select(TenantUser.tenant_id)
        .where(TenantUser.user_id == user.user_id)
        .order_by(TenantUser.joined_at)
    )
    if tenant_id is None:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "User does not belong to any tenant")

    audit.record_login(identifier, True, ip=ip)
    activity.record(db, tenant_id, user.user_id, activity.LOGIN, ip=ip)
    return TokenResponse(access_token=create_access_token(user.user_id, tenant_id))


@router.get("/me", response_model=MeResponse)
def me(current: Member = Depends(get_member), db: Session = Depends(get_db)):
    user = db.get(User, current.user_id)
    if user is None or not user.is_active:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid or missing token")
    tenant = db.get(Tenant, current.tenant_id)
    return MeResponse(
        full_name=user.full_name,
        email=user.email,
        tenant_id=current.tenant_id,
        role=current.role,
        tenant_name=tenant.name if tenant else "",
    )
