import uuid
from datetime import datetime, timezone
from typing import Literal

from pydantic import BaseModel, Field, field_validator

EventTypeName = Literal["conference", "business", "social", "workshop"]
EventStatus = Literal["planned", "active", "completed"]


class EventBase(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    event_type: EventTypeName
    # ISO 8601. Si trae zona horaria se convierte a UTC; si no, se asume UTC.
    event_date: datetime
    location: str = Field(min_length=1, max_length=300)
    description: str | None = None
    expected_attendees: int = Field(default=0, ge=0)
    status: EventStatus = "planned"

    @field_validator("event_date")
    @classmethod
    def to_naive_utc(cls, v: datetime) -> datetime:
        if v.tzinfo is not None:
            v = v.astimezone(timezone.utc).replace(tzinfo=None)
        return v


class EventCreate(EventBase):
    pass


class EventUpdate(EventBase):
    pass


class EventRead(BaseModel):
    event_id: uuid.UUID
    name: str
    event_type: str
    event_type_display: str
    event_date: datetime
    location: str
    description: str | None
    expected_attendees: int
    status: str
    display_status: str  # Completed | Past date | Planned | Active (calculado, no se guarda)
    created_at: datetime


class EventStats(BaseModel):
    total_events: int
    upcoming_events: int
    completed_events: int


class MonthlyOverview(BaseModel):
    month: str  # YYYY-MM
    total: int
    upcoming: int
    completed: int
