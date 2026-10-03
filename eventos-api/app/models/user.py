import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, String, text
from sqlalchemy.dialects.mssql import UNIQUEIDENTIFIER
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class User(Base):
    __tablename__ = "Users"
    __table_args__ = {"schema": "dbo", "implicit_returning": False}

    user_id: Mapped[uuid.UUID] = mapped_column(
        "UserId", UNIQUEIDENTIFIER(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    full_name: Mapped[str] = mapped_column("FullName", String(200))
    email: Mapped[str] = mapped_column("Email", String(320), unique=True)
    password_hash: Mapped[str] = mapped_column("PasswordHash", String(255))
    is_active: Mapped[bool] = mapped_column("IsActive", Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(
        "CreatedAt", DateTime, server_default=text("SYSUTCDATETIME()")
    )
    updated_at: Mapped[datetime] = mapped_column(
        "UpdatedAt", DateTime, server_default=text("SYSUTCDATETIME()")
    )


class TenantUser(Base):
    __tablename__ = "TenantUsers"
    __table_args__ = {"schema": "dbo"}

    tenant_id: Mapped[uuid.UUID] = mapped_column(
        "TenantId",
        UNIQUEIDENTIFIER(as_uuid=True),
        ForeignKey("dbo.Tenants.TenantId"),
        primary_key=True,
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        "UserId",
        UNIQUEIDENTIFIER(as_uuid=True),
        ForeignKey("dbo.Users.UserId"),
        primary_key=True,
    )
    role_name: Mapped[str] = mapped_column("RoleName", String(20))  # owner | admin | member
    joined_at: Mapped[datetime] = mapped_column(
        "JoinedAt", DateTime, server_default=text("SYSUTCDATETIME()")
    )
