"""API del administrador maestro: monitoreo y ABC de tenants, usuarios, eventos y categorias.

Todas las rutas exigen el token del administrador maestro (`require_master_admin`).
A diferencia del resto de la API, aqui NO se filtra por el tenant del token: el
administrador ve y modifica los datos de todos los tenants.
"""

import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import Select, case, delete, func, or_, select
from sqlalchemy.orm import Session

from app.api.deps import get_db, require_master_admin
from app.api.routes.auth import _slugify
from app.core.security import hash_password, is_admin_identifier
from app.models import Event, EventImage, EventType, Tenant, TenantUser, User
from app.schemas.admin import (
    AdminEventCreate,
    AdminEventUpdate,
    AssignTenant,
    CategoryCreate,
    CategoryUpdate,
    MemberAdd,
    MemberRole,
    TenantCreate,
    TenantUpdate,
    UserCreate,
    UserUpdate,
)

router = APIRouter(
    prefix="/api/admin",
    tags=["admin"],
    dependencies=[Depends(require_master_admin)],
)

UPCOMING_STATUSES = ("planned", "active")


# --- Utilidades --------------------------------------------------------------


def _utcnow() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _page(db: Session, stmt: Select, order_by: list, limit: int, offset: int) -> dict:
    total = db.scalar(select(func.count()).select_from(stmt.order_by(None).subquery()))
    rows = db.execute(stmt.order_by(*order_by).limit(limit).offset(offset)).all()
    return {"total": total, "limit": limit, "offset": offset, "items": [dict(r._mapping) for r in rows]}


def _like(column, text: str):
    return column.contains(text, autoescape=True)


def _unique_slug(db: Session, name: str, ignore: uuid.UUID | None = None) -> str:
    base = _slugify(name)
    slug = base
    while True:
        stmt = select(Tenant.tenant_id).where(Tenant.slug == slug)
        if ignore is not None:
            stmt = stmt.where(Tenant.tenant_id != ignore)
        if db.scalar(stmt) is None:
            return slug
        slug = f"{base}-{uuid.uuid4().hex[:6]}"


def _tenant_or_404(db: Session, tenant_id: uuid.UUID) -> Tenant:
    tenant = db.get(Tenant, tenant_id)
    if tenant is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Tenant not found")
    return tenant


def _user_or_404(db: Session, user_id: uuid.UUID) -> User:
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found")
    return user


def _delete_events(db: Session, *conditions) -> None:
    event_ids = select(Event.event_id).where(*conditions)
    db.execute(delete(EventImage).where(EventImage.event_id.in_(event_ids)))
    db.execute(delete(Event).where(*conditions))


# --- Dashboard ---------------------------------------------------------------


@router.get("/overview")
def overview(db: Session = Depends(get_db)):
    count = lambda col: db.scalar(select(func.count(col))) or 0  # noqa: E731

    totals = {
        "tenants": count(Tenant.tenant_id),
        "users": count(User.user_id),
        "active_users": db.scalar(select(func.count(User.user_id)).where(User.is_active == True)) or 0,  # noqa: E712
        "events": count(Event.event_id),
        "categories": count(EventType.event_type_id),
        "upcoming_events": db.scalar(
            select(func.count(Event.event_id)).where(Event.status.in_(UPCOMING_STATUSES))
        )
        or 0,
        "completed_events": db.scalar(select(func.count(Event.event_id)).where(Event.status == "completed")) or 0,
    }

    by_status = db.execute(select(Event.status, func.count().label("count")).group_by(Event.status)).all()
    by_type = db.execute(
        select(EventType.display_name.label("category"), func.count(Event.event_id).label("count"))
        .outerjoin(Event, Event.event_type_id == EventType.event_type_id)
        .group_by(EventType.display_name)
        .order_by(func.count(Event.event_id).desc())
    ).all()

    year, month = func.year(Event.event_date), func.month(Event.event_date)
    months = db.execute(
        select(
            year.label("y"),
            month.label("m"),
            func.count().label("total"),
            func.sum(case((Event.status == "completed", 1), else_=0)).label("completed"),
        )
        .group_by(year, month)
        .order_by(year.desc(), month.desc())
        .limit(12)
    ).all()

    top_tenants = db.execute(
        select(Tenant.tenant_id, Tenant.name, func.count(Event.event_id).label("events"))
        .outerjoin(Event, Event.tenant_id == Tenant.tenant_id)
        .group_by(Tenant.tenant_id, Tenant.name)
        .order_by(func.count(Event.event_id).desc(), Tenant.name)
        .limit(5)
    ).all()

    recent_users = db.execute(
        select(User.user_id, User.full_name, User.email, User.created_at).order_by(User.created_at.desc()).limit(5)
    ).all()
    recent_events = db.execute(
        select(Event.event_id, Event.name, Event.status, Event.created_at, Tenant.name.label("tenant_name"))
        .join(Tenant, Event.tenant_id == Tenant.tenant_id)
        .order_by(Event.created_at.desc())
        .limit(5)
    ).all()

    return {
        "totals": totals,
        "events_by_status": [{"status": r.status, "count": r.count} for r in by_status],
        "events_by_category": [dict(r._mapping) for r in by_type],
        "events_by_month": [
            {"month": f"{r.y:04d}-{r.m:02d}", "total": r.total, "completed": int(r.completed)}
            for r in reversed(months)
        ],
        "top_tenants": [dict(r._mapping) for r in top_tenants],
        "recent_users": [dict(r._mapping) for r in recent_users],
        "recent_events": [dict(r._mapping) for r in recent_events],
        "generated_at": _utcnow(),
    }


@router.get("/search")
def global_search(q: str = Query(min_length=1, max_length=100), db: Session = Depends(get_db)):
    tenants = db.execute(
        select(Tenant.tenant_id, Tenant.name, Tenant.slug)
        .where(or_(_like(Tenant.name, q), _like(Tenant.slug, q)))
        .order_by(Tenant.name)
        .limit(5)
    ).all()
    users = db.execute(
        select(User.user_id, User.full_name, User.email)
        .where(or_(_like(User.full_name, q), _like(User.email, q)))
        .order_by(User.full_name)
        .limit(5)
    ).all()
    events = db.execute(
        select(Event.event_id, Event.name, Event.location, Tenant.name.label("tenant_name"))
        .join(Tenant, Event.tenant_id == Tenant.tenant_id)
        .where(or_(_like(Event.name, q), _like(Event.location, q)))
        .order_by(Event.event_date.desc())
        .limit(5)
    ).all()
    return {
        "tenants": [dict(r._mapping) for r in tenants],
        "users": [dict(r._mapping) for r in users],
        "events": [dict(r._mapping) for r in events],
    }


# --- Tenants -----------------------------------------------------------------


def _tenant_stmt() -> Select:
    members = (
        select(func.count()).where(TenantUser.tenant_id == Tenant.tenant_id).correlate(Tenant).scalar_subquery()
    )
    events = select(func.count()).where(Event.tenant_id == Tenant.tenant_id).correlate(Tenant).scalar_subquery()
    return select(
        Tenant.tenant_id,
        Tenant.name,
        Tenant.slug,
        Tenant.created_at,
        members.label("user_count"),
        events.label("event_count"),
    )


def _tenant_detail(db: Session, tenant_id: uuid.UUID) -> dict:
    row = db.execute(_tenant_stmt().where(Tenant.tenant_id == tenant_id)).first()
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Tenant not found")
    members = db.execute(
        select(
            User.user_id,
            User.full_name,
            User.email,
            User.is_active,
            TenantUser.role_name,
            TenantUser.joined_at,
        )
        .join(TenantUser, TenantUser.user_id == User.user_id)
        .where(TenantUser.tenant_id == tenant_id)
        .order_by(TenantUser.joined_at)
    ).all()
    return {**dict(row._mapping), "members": [dict(m._mapping) for m in members]}


@router.get("/tenants")
def list_tenants(
    q: str | None = None,
    limit: int = Query(25, ge=1, le=200),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
):
    stmt = _tenant_stmt()
    if q:
        stmt = stmt.where(or_(_like(Tenant.name, q), _like(Tenant.slug, q)))
    return _page(db, stmt, [Tenant.created_at.desc(), Tenant.tenant_id], limit, offset)


@router.get("/tenants/{tenant_id}")
def get_tenant(tenant_id: uuid.UUID, db: Session = Depends(get_db)):
    return _tenant_detail(db, tenant_id)


@router.post("/tenants", status_code=status.HTTP_201_CREATED)
def create_tenant(body: TenantCreate, db: Session = Depends(get_db)):
    tenant = Tenant(name=body.name.strip(), slug=_unique_slug(db, body.slug or body.name))
    db.add(tenant)
    db.commit()
    return _tenant_detail(db, tenant.tenant_id)


@router.put("/tenants/{tenant_id}")
def update_tenant(tenant_id: uuid.UUID, body: TenantUpdate, db: Session = Depends(get_db)):
    tenant = _tenant_or_404(db, tenant_id)
    slug = _slugify(body.slug)
    taken = db.scalar(select(Tenant.tenant_id).where(Tenant.slug == slug, Tenant.tenant_id != tenant_id))
    if taken is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, "Slug already in use")
    tenant.name = body.name.strip()
    tenant.slug = slug
    db.commit()
    return _tenant_detail(db, tenant_id)


@router.delete("/tenants/{tenant_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_tenant(tenant_id: uuid.UUID, cascade: bool = False, db: Session = Depends(get_db)):
    tenant = _tenant_or_404(db, tenant_id)
    events = db.scalar(select(func.count()).where(Event.tenant_id == tenant_id)) or 0
    members = db.scalar(select(func.count()).where(TenantUser.tenant_id == tenant_id)) or 0
    if (events or members) and not cascade:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            f"Tenant has {events} events and {members} members; use cascade=true to delete them too",
        )
    _delete_events(db, Event.tenant_id == tenant_id)
    db.execute(delete(TenantUser).where(TenantUser.tenant_id == tenant_id))
    db.delete(tenant)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/tenants/{tenant_id}/members", status_code=status.HTTP_201_CREATED)
def add_member(tenant_id: uuid.UUID, body: MemberAdd, db: Session = Depends(get_db)):
    _tenant_or_404(db, tenant_id)
    _user_or_404(db, body.user_id)
    if db.get(TenantUser, (tenant_id, body.user_id)) is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, "User already belongs to this tenant")
    db.add(TenantUser(tenant_id=tenant_id, user_id=body.user_id, role_name=body.role_name))
    db.commit()
    return _tenant_detail(db, tenant_id)


@router.put("/tenants/{tenant_id}/members/{user_id}")
def change_member_role(tenant_id: uuid.UUID, user_id: uuid.UUID, body: MemberRole, db: Session = Depends(get_db)):
    membership = db.get(TenantUser, (tenant_id, user_id))
    if membership is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Membership not found")
    membership.role_name = body.role_name
    db.commit()
    return _tenant_detail(db, tenant_id)


@router.delete("/tenants/{tenant_id}/members/{user_id}")
def remove_member(tenant_id: uuid.UUID, user_id: uuid.UUID, db: Session = Depends(get_db)):
    membership = db.get(TenantUser, (tenant_id, user_id))
    if membership is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Membership not found")
    db.delete(membership)
    db.commit()
    return _tenant_detail(db, tenant_id)


# --- Usuarios ----------------------------------------------------------------


def _attach_memberships(db: Session, users: list[dict]) -> list[dict]:
    ids = [u["user_id"] for u in users]
    if not ids:
        return users
    memberships = db.execute(
        select(TenantUser.user_id, TenantUser.tenant_id, Tenant.name.label("tenant_name"), TenantUser.role_name)
        .join(Tenant, Tenant.tenant_id == TenantUser.tenant_id)
        .where(TenantUser.user_id.in_(ids))
        .order_by(TenantUser.joined_at)
    ).all()
    event_counts = dict(
        db.execute(
            select(Event.created_by_user_id, func.count())
            .where(Event.created_by_user_id.in_(ids))
            .group_by(Event.created_by_user_id)
        ).all()
    )
    for user in users:
        user["tenants"] = [
            {"tenant_id": m.tenant_id, "tenant_name": m.tenant_name, "role_name": m.role_name}
            for m in memberships
            if m.user_id == user["user_id"]
        ]
        user["event_count"] = event_counts.get(user["user_id"], 0)
    return users


def _user_stmt() -> Select:
    return select(User.user_id, User.full_name, User.email, User.is_active, User.created_at)


def _user_detail(db: Session, user_id: uuid.UUID) -> dict:
    row = db.execute(_user_stmt().where(User.user_id == user_id)).first()
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found")
    user = _attach_memberships(db, [dict(row._mapping)])[0]
    events = db.execute(
        _event_stmt().where(Event.created_by_user_id == user_id).order_by(Event.event_date.desc()).limit(100)
    ).all()
    user["events"] = [dict(e._mapping) for e in events]
    return user


@router.get("/users")
def list_users(
    q: str | None = None,
    tenant_id: uuid.UUID | None = None,
    is_active: bool | None = None,
    limit: int = Query(25, ge=1, le=200),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
):
    stmt = _user_stmt()
    if q:
        stmt = stmt.where(or_(_like(User.full_name, q), _like(User.email, q)))
    if tenant_id:
        stmt = stmt.where(
            User.user_id.in_(select(TenantUser.user_id).where(TenantUser.tenant_id == tenant_id))
        )
    if is_active is not None:
        stmt = stmt.where(User.is_active == is_active)
    page = _page(db, stmt, [User.created_at.desc(), User.user_id], limit, offset)
    page["items"] = _attach_memberships(db, page["items"])
    return page


@router.get("/users/{user_id}")
def get_user(user_id: uuid.UUID, db: Session = Depends(get_db)):
    return _user_detail(db, user_id)


@router.post("/users", status_code=status.HTTP_201_CREATED)
def create_user(body: UserCreate, db: Session = Depends(get_db)):
    email = body.email.lower()
    if is_admin_identifier(email) or db.scalar(select(User.user_id).where(User.email == email)):
        raise HTTPException(status.HTTP_409_CONFLICT, "Email already registered")

    new_rows: list = []
    if body.tenant_id:
        tenant = _tenant_or_404(db, body.tenant_id)
        role = body.role_name or "member"
    else:
        name = (body.tenant_name or body.full_name).strip()
        tenant = Tenant(name=name, slug=_unique_slug(db, name))
        new_rows.append(tenant)
        role = body.role_name or "owner"

    user = User(
        full_name=body.full_name.strip(),
        email=email,
        password_hash=hash_password(body.password),
        is_active=body.is_active,
    )
    new_rows.append(user)
    db.add_all(new_rows)
    db.flush()
    db.add(TenantUser(tenant_id=tenant.tenant_id, user_id=user.user_id, role_name=role))
    db.commit()
    return _user_detail(db, user.user_id)


@router.put("/users/{user_id}")
def update_user(user_id: uuid.UUID, body: UserUpdate, db: Session = Depends(get_db)):
    user = _user_or_404(db, user_id)
    email = body.email.lower()
    if is_admin_identifier(email) or db.scalar(
        select(User.user_id).where(User.email == email, User.user_id != user_id)
    ):
        raise HTTPException(status.HTTP_409_CONFLICT, "Email already registered")
    user.full_name = body.full_name.strip()
    user.email = email
    user.is_active = body.is_active
    if body.password:
        user.password_hash = hash_password(body.password)
    db.commit()
    return _user_detail(db, user_id)


@router.put("/users/{user_id}/tenant")
def assign_tenant(user_id: uuid.UUID, body: AssignTenant, db: Session = Depends(get_db)):
    """Asigna el usuario a UN tenant: reemplaza cualquier pertenencia anterior."""
    _user_or_404(db, user_id)
    _tenant_or_404(db, body.tenant_id)
    db.execute(delete(TenantUser).where(TenantUser.user_id == user_id))
    db.add(TenantUser(tenant_id=body.tenant_id, user_id=user_id, role_name=body.role_name))
    db.commit()
    return _user_detail(db, user_id)


@router.delete("/users/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_user(user_id: uuid.UUID, cascade: bool = False, db: Session = Depends(get_db)):
    user = _user_or_404(db, user_id)
    events = db.scalar(select(func.count()).where(Event.created_by_user_id == user_id)) or 0
    if events and not cascade:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            f"User created {events} events; use cascade=true to delete them too",
        )
    _delete_events(db, Event.created_by_user_id == user_id)
    db.execute(delete(TenantUser).where(TenantUser.user_id == user_id))
    db.delete(user)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# --- Eventos -----------------------------------------------------------------


def _event_stmt() -> Select:
    return (
        select(
            Event.event_id,
            Event.name,
            EventType.name.label("event_type"),
            EventType.display_name.label("event_type_display"),
            Event.event_date,
            Event.location,
            Event.description,
            Event.expected_attendees,
            Event.status,
            Event.created_at,
            Event.tenant_id,
            Tenant.name.label("tenant_name"),
            Event.created_by_user_id,
            User.full_name.label("created_by_name"),
            User.email.label("created_by_email"),
        )
        .join(EventType, Event.event_type_id == EventType.event_type_id)
        .join(Tenant, Event.tenant_id == Tenant.tenant_id)
        .join(User, Event.created_by_user_id == User.user_id)
    )


def _event_detail(db: Session, event_id: uuid.UUID) -> dict:
    row = db.execute(_event_stmt().where(Event.event_id == event_id)).first()
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Event not found")
    return dict(row._mapping)


def _category_id(db: Session, name: str) -> int:
    type_id = db.scalar(select(EventType.event_type_id).where(EventType.name == name))
    if type_id is None:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, f"Unknown category: {name}")
    return type_id


@router.get("/events")
def list_events(
    q: str | None = None,
    tenant_id: uuid.UUID | None = None,
    created_by_user_id: uuid.UUID | None = None,
    event_type: str | None = None,
    status_filter: str | None = Query(None, alias="status"),
    limit: int = Query(25, ge=1, le=200),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
):
    stmt = _event_stmt()
    if q:
        stmt = stmt.where(or_(_like(Event.name, q), _like(Event.location, q), _like(Event.description, q)))
    if tenant_id:
        stmt = stmt.where(Event.tenant_id == tenant_id)
    if created_by_user_id:
        stmt = stmt.where(Event.created_by_user_id == created_by_user_id)
    if event_type:
        stmt = stmt.where(EventType.name == event_type)
    if status_filter:
        stmt = stmt.where(Event.status == status_filter)
    return _page(db, stmt, [Event.event_date.desc(), Event.event_id], limit, offset)


@router.get("/events/{event_id}")
def get_event(event_id: uuid.UUID, db: Session = Depends(get_db)):
    return _event_detail(db, event_id)


@router.post("/events", status_code=status.HTTP_201_CREATED)
def create_event(body: AdminEventCreate, db: Session = Depends(get_db)):
    _tenant_or_404(db, body.tenant_id)
    _user_or_404(db, body.created_by_user_id)
    if db.get(TenantUser, (body.tenant_id, body.created_by_user_id)) is None:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "User is not a member of that tenant")
    event = Event(
        tenant_id=body.tenant_id,
        created_by_user_id=body.created_by_user_id,
        event_type_id=_category_id(db, body.event_type),
        name=body.name.strip(),
        event_date=body.event_date,
        location=body.location.strip(),
        description=body.description,
        expected_attendees=body.expected_attendees,
        status=body.status,
    )
    db.add(event)
    db.commit()
    return _event_detail(db, event.event_id)


@router.put("/events/{event_id}")
def update_event(event_id: uuid.UUID, body: AdminEventUpdate, db: Session = Depends(get_db)):
    event = db.get(Event, event_id)
    if event is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Event not found")
    event.event_type_id = _category_id(db, body.event_type)
    event.name = body.name.strip()
    event.event_date = body.event_date
    event.location = body.location.strip()
    event.description = body.description
    event.expected_attendees = body.expected_attendees
    event.status = body.status
    db.commit()
    return _event_detail(db, event_id)


@router.delete("/events/{event_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_event(event_id: uuid.UUID, db: Session = Depends(get_db)):
    if db.get(Event, event_id) is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Event not found")
    _delete_events(db, Event.event_id == event_id)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# --- Categorias (EventTypes) -------------------------------------------------


def _category_rows(db: Session, type_id: int | None = None) -> list[dict]:
    stmt = (
        select(
            EventType.event_type_id,
            EventType.name,
            EventType.display_name,
            EventType.is_active,
            func.count(Event.event_id).label("event_count"),
        )
        .outerjoin(Event, Event.event_type_id == EventType.event_type_id)
        .group_by(EventType.event_type_id, EventType.name, EventType.display_name, EventType.is_active)
        .order_by(EventType.display_name)
    )
    if type_id is not None:
        stmt = stmt.where(EventType.event_type_id == type_id)
    return [dict(r._mapping) for r in db.execute(stmt).all()]


@router.get("/categories")
def list_categories(db: Session = Depends(get_db)):
    return _category_rows(db)


@router.post("/categories", status_code=status.HTTP_201_CREATED)
def create_category(body: CategoryCreate, db: Session = Depends(get_db)):
    if db.scalar(select(EventType.event_type_id).where(EventType.name == body.name)) is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, "Category already exists")
    category = EventType(name=body.name, display_name=body.display_name.strip(), is_active=body.is_active)
    db.add(category)
    db.commit()
    return _category_rows(db, category.event_type_id)[0]


@router.put("/categories/{type_id}")
def update_category(type_id: int, body: CategoryUpdate, db: Session = Depends(get_db)):
    category = db.get(EventType, type_id)
    if category is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Category not found")
    category.display_name = body.display_name.strip()
    category.is_active = body.is_active
    db.commit()
    return _category_rows(db, type_id)[0]


@router.delete("/categories/{type_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_category(type_id: int, db: Session = Depends(get_db)):
    category = db.get(EventType, type_id)
    if category is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Category not found")
    used = db.scalar(select(func.count()).where(Event.event_type_id == type_id)) or 0
    if used:
        raise HTTPException(status.HTTP_409_CONFLICT, f"Category is used by {used} events")
    db.delete(category)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
