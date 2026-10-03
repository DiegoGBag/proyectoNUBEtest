import uuid
from datetime import datetime

from sqlalchemy import DateTime, String, text
from sqlalchemy.dialects.mssql import UNIQUEIDENTIFIER
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class Tenant(Base):
    __tablename__ = "Tenants"
    # Las tablas con triggers no pueden usar OUTPUT sin INTO, por eso se
    # desactiva implicit_returning y los UUID se generan en Python.
    __table_args__ = {"schema": "dbo", "implicit_returning": False}

    tenant_id: Mapped[uuid.UUID] = mapped_column(
        "TenantId", UNIQUEIDENTIFIER(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    name: Mapped[str] = mapped_column("Name", String(200))
    slug: Mapped[str] = mapped_column("Slug", String(100), unique=True)
    created_at: Mapped[datetime] = mapped_column(
        "CreatedAt", DateTime, server_default=text("SYSUTCDATETIME()")
    )
    updated_at: Mapped[datetime] = mapped_column(
        "UpdatedAt", DateTime, server_default=text("SYSUTCDATETIME()")
    )
