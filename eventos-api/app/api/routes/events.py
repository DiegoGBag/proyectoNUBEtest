import uuid
from datetime import date, datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import Row, case, func, or_, select
from sqlalchemy.orm import Session

from app.api.deps import Member, get_db, get_member, require_writer
from app.core import activity
from app.models import Event, EventType
from app.schemas.event import (
    EventCreate,
    EventRead,
    EventStats,
    EventUpdate,
    MonthlyOverview,
)

router = APIRouter(prefix="/api/events", tags=["events"])

UPCOMING_STATUSES = ("planned", "active")


def _utcnow() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _track(db: Session, user: Member, action: str, detail: str | None = None) -> None:
    """Registra las consultas de los sub-usuarios (perfiles `member`) para que el owner las monitoree."""
    if user.role == "member":
        activity.record(db, user.tenant_id, user.user_id, action, detail)


def _select_events():
    return select(
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
    ).join(EventType, Event.event_type_id == EventType.event_type_id)


def _to_read(row: Row) -> EventRead:
    if row.status == "completed":
        display = "Completed"
    elif row.event_date < _utcnow():
        display = "Past date"  # estado de presentacion, NO se guarda en BD
    else:
        display = row.status.capitalize()
    return EventRead(**row._mapping, display_status=display)


def _event_type_id(db: Session, name: str) -> int:
    type_id = db.scalar(
        select(EventType.event_type_id).where(EventType.name == name, EventType.is_active == True)  # noqa: E712
    )
    if type_id is None:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, f"Unknown event type: {name}")
    return type_id


def _check_past_status(event_date: datetime, event_status: str) -> None:
    """Un evento con fecha anterior al dia de hoy solo puede guardarse como completado.

    El servidor no conoce la zona horaria del usuario (la fecha llega en UTC); el
    "hoy" local empieza como mucho 24 h antes del instante actual, asi que solo se
    rechazan los eventos que son de un dia anterior en cualquier zona horaria. La
    regla exacta por dia local la aplica el frontend.
    """
    if event_status != "completed" and event_date < _utcnow() - timedelta(days=1):
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            "Events with a past date can only be marked as completed",
        )


def _get_event_read(db: Session, event_id: uuid.UUID, tenant_id: uuid.UUID) -> EventRead:
    row = db.execute(
        _select_events().where(Event.event_id == event_id, Event.tenant_id == tenant_id)
    ).first()
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Event not found")
    return _to_read(row)


# --- Dashboard ---------------------------------------------------------------


@router.get("/stats", response_model=EventStats)
def stats(user: Member = Depends(get_member), db: Session = Depends(get_db)):
    row = db.execute(
        select(
            func.count().label("total"),
            func.coalesce(func.sum(case((Event.status.in_(UPCOMING_STATUSES), 1), else_=0)), 0).label("upcoming"),
            func.coalesce(func.sum(case((Event.status == "completed", 1), else_=0)), 0).label("completed"),
        ).where(Event.tenant_id == user.tenant_id)
    ).one()
    _track(db, user, activity.VIEW_DASHBOARD)
    return EventStats(total_events=row.total, upcoming_events=row.upcoming, completed_events=row.completed)


@router.get("/overview", response_model=list[MonthlyOverview])
def overview(user: Member = Depends(get_member), db: Session = Depends(get_db)):
    """Eventos por mes. Minimo: 3 meses atras .. 3 meses adelante; se expande si hay eventos fuera."""
    year = func.year(Event.event_date)
    month = func.month(Event.event_date)
    rows = db.execute(
        select(
            year.label("y"),
            month.label("m"),
            func.count().label("total"),
            func.sum(case((Event.status.in_(UPCOMING_STATUSES), 1), else_=0)).label("upcoming"),
            func.sum(case((Event.status == "completed", 1), else_=0)).label("completed"),
        )
        .where(Event.tenant_id == user.tenant_id)
        .group_by(year, month)
    ).all()
    data = {(r.y, r.m): r for r in rows}

    today = _utcnow().date()
    start = _add_months(date(today.year, today.month, 1), -3)
    end = _add_months(date(today.year, today.month, 1), 3)
    if data:
        first = date(*min(data), 1)
        last = date(*max(data), 1)
        start, end = min(start, first), max(end, last)

    result: list[MonthlyOverview] = []
    cur = start
    while cur <= end:
        r = data.get((cur.year, cur.month))
        result.append(
            MonthlyOverview(
                month=f"{cur.year:04d}-{cur.month:02d}",
                total=r.total if r else 0,
                upcoming=int(r.upcoming) if r else 0,
                completed=int(r.completed) if r else 0,
            )
        )
        cur = _add_months(cur, 1)
    return result


def _add_months(d: date, n: int) -> date:
    idx = d.year * 12 + (d.month - 1) + n
    return date(idx // 12, idx % 12 + 1, 1)


# --- Listados ----------------------------------------------------------------


@router.get("/upcoming", response_model=list[EventRead])
def upcoming(user: Member = Depends(get_member), db: Session = Depends(get_db)):
    # Se excluyen los eventos de dias anteriores. Margen de 24 h porque el "hoy" depende
    # de la zona horaria del usuario; el corte exacto por dia local lo hace el frontend.
    rows = db.execute(
        _select_events()
        .where(
            Event.tenant_id == user.tenant_id,
            Event.status.in_(UPCOMING_STATUSES),
            Event.event_date >= _utcnow() - timedelta(days=1),
        )
        .order_by(Event.event_date.asc())
    ).all()
    _track(db, user, activity.VIEW_UPCOMING)
    return [_to_read(r) for r in rows]


@router.get("/completed", response_model=list[EventRead])
def completed(user: Member = Depends(get_member), db: Session = Depends(get_db)):
    rows = db.execute(
        _select_events()
        .where(
            Event.tenant_id == user.tenant_id,
            or_(Event.status == "completed", Event.event_date < _utcnow()),
        )
        .order_by(Event.event_date.desc())
    ).all()
    _track(db, user, activity.VIEW_COMPLETED)
    return [_to_read(r) for r in rows]


@router.get("", response_model=list[EventRead])
def list_events(user: Member = Depends(get_member), db: Session = Depends(get_db)):
    rows = db.execute(
        _select_events().where(Event.tenant_id == user.tenant_id).order_by(Event.event_date.desc())
    ).all()
    return [_to_read(r) for r in rows]


# --- CRUD --------------------------------------------------------------------


@router.post("", response_model=EventRead, status_code=status.HTTP_201_CREATED)
def create_event(
    body: EventCreate,
    user: Member = Depends(require_writer),
    db: Session = Depends(get_db),
):
    _check_past_status(body.event_date, body.status)
    event = Event(
        tenant_id=user.tenant_id,
        created_by_user_id=user.user_id,
        event_type_id=_event_type_id(db, body.event_type),
        name=body.name,
        event_date=body.event_date,
        location=body.location,
        description=body.description,
        expected_attendees=body.expected_attendees,
        status=body.status,
    )
    db.add(event)
    db.commit()
    return _get_event_read(db, event.event_id, user.tenant_id)


@router.get("/{event_id}", response_model=EventRead)
def get_event(
    event_id: uuid.UUID,
    user: Member = Depends(get_member),
    db: Session = Depends(get_db),
):
    event = _get_event_read(db, event_id, user.tenant_id)
    _track(db, user, activity.VIEW_EVENT, event.name)
    return event


@router.put("/{event_id}", response_model=EventRead)
def update_event(
    event_id: uuid.UUID,
    body: EventUpdate,
    user: Member = Depends(require_writer),
    db: Session = Depends(get_db),
):
    event = db.scalar(select(Event).where(Event.event_id == event_id, Event.tenant_id == user.tenant_id))
    if event is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Event not found")
    _check_past_status(body.event_date, body.status)
    event.event_type_id = _event_type_id(db, body.event_type)
    event.name = body.name
    event.event_date = body.event_date
    event.location = body.location
    event.description = body.description
    event.expected_attendees = body.expected_attendees
    event.status = body.status
    db.commit()
    return _get_event_read(db, event_id, user.tenant_id)


@router.delete("/{event_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_event(
    event_id: uuid.UUID,
    user: Member = Depends(require_writer),
    db: Session = Depends(get_db),
):
    event = db.scalar(select(Event).where(Event.event_id == event_id, Event.tenant_id == user.tenant_id))
    if event is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Event not found")
    # Nota: si ya existe una fila en EventImages para este evento, hay que
    # borrarla antes (se hara junto con la subida de imagenes a S3).
    db.delete(event)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
