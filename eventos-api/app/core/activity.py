"""Registro y consulta de la actividad de los usuarios (tabla dbo.UserActivity)."""

import logging
import uuid

from sqlalchemy import Select, func, select
from sqlalchemy.orm import Session

from app.models import Tenant, User, UserActivity

logger = logging.getLogger(__name__)

# Acciones registradas
LOGIN = "login"
VIEW_DASHBOARD = "view_dashboard"
VIEW_UPCOMING = "view_upcoming"
VIEW_COMPLETED = "view_completed"
VIEW_EVENT = "view_event"
DENIED_WRITE = "denied_write"  # intento de crear / editar / borrar con un perfil de solo lectura

VIEW_ACTIONS = (VIEW_DASHBOARD, VIEW_UPCOMING, VIEW_COMPLETED, VIEW_EVENT)


def record(
    db: Session,
    tenant_id: uuid.UUID,
    user_id: uuid.UUID,
    action: str,
    detail: str | None = None,
    ip: str | None = None,
) -> None:
    """Guarda una fila de actividad. Nunca rompe la peticion que la origina."""
    try:
        db.add(
            UserActivity(
                tenant_id=tenant_id,
                user_id=user_id,
                action=action,
                detail=detail[:300] if detail else None,
                ip_address=ip,
            )
        )
        db.commit()
    except Exception:  # noqa: BLE001
        db.rollback()
        logger.warning("Could not record activity %s", action, exc_info=True)


def feed_stmt() -> Select:
    return (
        select(
            UserActivity.activity_id,
            UserActivity.created_at,
            UserActivity.action,
            UserActivity.detail,
            UserActivity.ip_address,
            UserActivity.user_id,
            User.full_name,
            User.email,
            UserActivity.tenant_id,
            Tenant.name.label("tenant_name"),
        )
        .join(User, User.user_id == UserActivity.user_id)
        .join(Tenant, Tenant.tenant_id == UserActivity.tenant_id)
    )


def page(db: Session, stmt: Select, limit: int, offset: int) -> dict:
    ordered = stmt.order_by(UserActivity.created_at.desc(), UserActivity.activity_id.desc())
    total = db.scalar(select(func.count()).select_from(stmt.order_by(None).subquery())) or 0
    rows = db.execute(ordered.limit(limit).offset(offset)).all()
    return {"total": total, "limit": limit, "offset": offset, "items": [dict(r._mapping) for r in rows]}
