"""Sub-usuarios de una organizacion.

El owner del tenant crea perfiles de solo lectura (rol `member`) para su gente y
monitorea su actividad. Todo se filtra por el tenant del owner (sale del token).
"""

import uuid
from datetime import date, datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import Date, Select, cast, delete, func, select
from sqlalchemy.orm import Session

from app.api.deps import Member, get_db, require_owner
from app.core import activity
from app.core.security import hash_password, is_admin_identifier
from app.models import Event, TenantUser, User, UserActivity
from app.schemas.team import SubUserCreate, SubUserUpdate

router = APIRouter(prefix="/api/team", tags=["team"])

SUB_ROLE = "member"


def _utcnow() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _members_stmt(tenant_id: uuid.UUID) -> Select:
    return (
        select(User.user_id, User.full_name, User.email, User.is_active, User.created_at)
        .join(TenantUser, TenantUser.user_id == User.user_id)
        .where(TenantUser.tenant_id == tenant_id, TenantUser.role_name == SUB_ROLE)
    )


def _member_ids(tenant_id: uuid.UUID) -> Select:
    return select(TenantUser.user_id).where(TenantUser.tenant_id == tenant_id, TenantUser.role_name == SUB_ROLE)


def _with_activity(db: Session, tenant_id: uuid.UUID, members: list[dict]) -> list[dict]:
    """Agrega a cada sub-usuario su ultimo acceso y los totales de actividad de 30 dias."""
    ids = [m["user_id"] for m in members]
    stats: dict = {}
    last_login: dict = {}
    if ids:
        since = _utcnow() - timedelta(days=30)
        for row in db.execute(
            select(UserActivity.user_id, UserActivity.action, func.count().label("n"), func.max(UserActivity.created_at).label("last"))
            .where(UserActivity.tenant_id == tenant_id, UserActivity.user_id.in_(ids), UserActivity.created_at >= since)
            .group_by(UserActivity.user_id, UserActivity.action)
        ).all():
            stats.setdefault(row.user_id, []).append(row)
        last_login = dict(
            db.execute(
                select(UserActivity.user_id, func.max(UserActivity.created_at))
                .where(UserActivity.user_id.in_(ids), UserActivity.action == activity.LOGIN)
                .group_by(UserActivity.user_id)
            ).all()
        )
    for member in members:
        rows = stats.get(member["user_id"], [])
        member["last_login"] = last_login.get(member["user_id"])
        member["last_activity"] = max((r.last for r in rows), default=None)
        member["logins_30d"] = sum(r.n for r in rows if r.action == activity.LOGIN)
        member["views_30d"] = sum(r.n for r in rows if r.action in activity.VIEW_ACTIONS)
        member["denied_30d"] = sum(r.n for r in rows if r.action == activity.DENIED_WRITE)
    return members


def _member_or_404(db: Session, tenant_id: uuid.UUID, user_id: uuid.UUID) -> User:
    user = db.scalar(
        select(User)
        .join(TenantUser, TenantUser.user_id == User.user_id)
        .where(User.user_id == user_id, TenantUser.tenant_id == tenant_id, TenantUser.role_name == SUB_ROLE)
    )
    if user is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Sub-user not found")
    return user


def _member_detail(db: Session, tenant_id: uuid.UUID, user_id: uuid.UUID) -> dict:
    row = db.execute(_members_stmt(tenant_id).where(User.user_id == user_id)).first()
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Sub-user not found")
    return _with_activity(db, tenant_id, [dict(row._mapping)])[0]


@router.get("/members")
def list_members(owner: Member = Depends(require_owner), db: Session = Depends(get_db)):
    rows = db.execute(_members_stmt(owner.tenant_id).order_by(User.created_at.desc())).all()
    return _with_activity(db, owner.tenant_id, [dict(r._mapping) for r in rows])


@router.post("/members", status_code=status.HTTP_201_CREATED)
def create_member(body: SubUserCreate, owner: Member = Depends(require_owner), db: Session = Depends(get_db)):
    email = body.email.lower()
    if is_admin_identifier(email) or db.scalar(select(User.user_id).where(User.email == email)):
        raise HTTPException(status.HTTP_409_CONFLICT, "Email already registered")
    user = User(full_name=body.full_name.strip(), email=email, password_hash=hash_password(body.password))
    db.add(user)
    db.flush()
    db.add(TenantUser(tenant_id=owner.tenant_id, user_id=user.user_id, role_name=SUB_ROLE))
    db.commit()
    return _member_detail(db, owner.tenant_id, user.user_id)


@router.put("/members/{user_id}")
def update_member(
    user_id: uuid.UUID,
    body: SubUserUpdate,
    owner: Member = Depends(require_owner),
    db: Session = Depends(get_db),
):
    user = _member_or_404(db, owner.tenant_id, user_id)
    user.full_name = body.full_name.strip()
    user.is_active = body.is_active
    if body.password:
        user.password_hash = hash_password(body.password)
    db.commit()
    return _member_detail(db, owner.tenant_id, user_id)


@router.delete("/members/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_member(user_id: uuid.UUID, owner: Member = Depends(require_owner), db: Session = Depends(get_db)):
    user = _member_or_404(db, owner.tenant_id, user_id)
    if db.scalar(select(func.count()).where(Event.created_by_user_id == user_id)):
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "This user has created events and cannot be deleted; deactivate the profile instead",
        )
    db.execute(delete(TenantUser).where(TenantUser.tenant_id == owner.tenant_id, TenantUser.user_id == user_id))
    db.execute(delete(UserActivity).where(UserActivity.tenant_id == owner.tenant_id, UserActivity.user_id == user_id))
    # El perfil solo se borra si no pertenece a ninguna otra organizacion.
    if db.scalar(select(func.count()).where(TenantUser.user_id == user_id)) == 0:
        db.delete(user)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# --- Monitoreo ---------------------------------------------------------------


@router.get("/summary")
def summary(owner: Member = Depends(require_owner), db: Session = Depends(get_db)):
    tenant_id = owner.tenant_id
    members = db.execute(_members_stmt(tenant_id)).all()
    now = _utcnow()
    today = now.date()
    first_day = today - timedelta(days=6)

    scope = (UserActivity.tenant_id == tenant_id, UserActivity.user_id.in_(_member_ids(tenant_id)))
    online_24h = db.scalar(
        select(func.count(func.distinct(UserActivity.user_id))).where(*scope, UserActivity.created_at >= now - timedelta(hours=24))
    )
    active_7d = db.scalar(
        select(func.count(func.distinct(UserActivity.user_id))).where(*scope, UserActivity.created_at >= now - timedelta(days=7))
    )
    day = cast(UserActivity.created_at, Date)
    by_day: dict[date, dict[str, int]] = {first_day + timedelta(days=i): {"logins": 0, "views": 0, "denied": 0} for i in range(7)}
    for row in db.execute(
        select(day.label("day"), UserActivity.action, func.count().label("n"))
        .where(*scope, UserActivity.created_at >= datetime.combine(first_day, datetime.min.time()))
        .group_by(day, UserActivity.action)
    ).all():
        bucket = by_day.get(row.day if isinstance(row.day, date) else row.day.date())
        if bucket is None:
            continue
        if row.action == activity.LOGIN:
            bucket["logins"] += row.n
        elif row.action in activity.VIEW_ACTIONS:
            bucket["views"] += row.n
        elif row.action == activity.DENIED_WRITE:
            bucket["denied"] += row.n

    detailed = _with_activity(db, tenant_id, [dict(m._mapping) for m in members])
    never_logged = sum(1 for m in detailed if m["last_login"] is None)

    return {
        "members": len(members),
        "active_members": sum(1 for m in members if m.is_active),
        "inactive_members": sum(1 for m in members if not m.is_active),
        "never_logged_in": never_logged,
        "online_last_24h": online_24h or 0,
        "active_last_7d": active_7d or 0,
        "denied_last_7d": sum(d["denied"] for d in by_day.values()),
        "activity_by_day": [{"day": d.isoformat(), **counts} for d, counts in by_day.items()],
        "generated_at": now,
    }


@router.get("/activity")
def team_activity(
    user_id: uuid.UUID | None = None,
    action: str | None = None,
    limit: int = Query(25, ge=1, le=200),
    offset: int = Query(0, ge=0),
    owner: Member = Depends(require_owner),
    db: Session = Depends(get_db),
):
    """Actividad de los sub-usuarios de la organizacion (opcionalmente de uno solo)."""
    stmt = activity.feed_stmt().where(
        UserActivity.tenant_id == owner.tenant_id,
        UserActivity.user_id.in_(_member_ids(owner.tenant_id)),
    )
    if user_id:
        _member_or_404(db, owner.tenant_id, user_id)
        stmt = stmt.where(UserActivity.user_id == user_id)
    if action:
        stmt = stmt.where(UserActivity.action == action)
    return activity.page(db, stmt, limit, offset)
