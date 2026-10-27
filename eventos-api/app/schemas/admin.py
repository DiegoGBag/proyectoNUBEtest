import uuid
from datetime import datetime, timezone
from typing import Literal

from pydantic import BaseModel, EmailStr, Field, field_validator

RoleName = Literal["owner", "admin", "member"]
EventStatus = Literal["planned", "active", "completed"]


class TenantCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    slug: str | None = Field(default=None, max_length=100)


class TenantUpdate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    slug: str = Field(min_length=1, max_length=100)


class MemberAdd(BaseModel):
    user_id: uuid.UUID
    role_name: RoleName = "member"


class MemberRole(BaseModel):
    role_name: RoleName


class UserCreate(BaseModel):
    full_name: str = Field(min_length=1, max_length=200)
    email: EmailStr
    password: str = Field(min_length=8, max_length=72)
    is_active: bool = True
    # Cada usuario siempre queda en un tenant: uno existente (tenant_id), uno nuevo
    # con ese nombre (tenant_name) o, si no se indica nada, uno nuevo con su nombre.
    tenant_id: uuid.UUID | None = None
    tenant_name: str | None = Field(default=None, max_length=200)
    role_name: RoleName | None = None


class UserUpdate(BaseModel):
    full_name: str = Field(min_length=1, max_length=200)
    email: EmailStr
    is_active: bool = True
    password: str | None = Field(default=None, min_length=8, max_length=72)


class AssignTenant(BaseModel):
    tenant_id: uuid.UUID
    role_name: RoleName = "member"


class AdminEventBase(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    event_type: str = Field(min_length=1, max_length=50)
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


class AdminEventCreate(AdminEventBase):
    tenant_id: uuid.UUID
    created_by_user_id: uuid.UUID


class AdminEventUpdate(AdminEventBase):
    pass


class CategoryCreate(BaseModel):
    name: str = Field(min_length=1, max_length=50, pattern=r"^[a-z0-9_-]+$")
    display_name: str = Field(min_length=1, max_length=100)
    is_active: bool = True


class CategoryUpdate(BaseModel):
    display_name: str = Field(min_length=1, max_length=100)
    is_active: bool = True
