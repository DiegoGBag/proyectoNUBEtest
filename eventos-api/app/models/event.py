import uuid
from datetime import datetime

from sqlalchemy import BigInteger, Boolean, DateTime, ForeignKey, Integer, String, Text, text
from sqlalchemy.dialects.mssql import UNIQUEIDENTIFIER
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class EventType(Base):
    __tablename__ = "EventTypes"
    __table_args__ = {"schema": "dbo"}

    # Se asume INT IDENTITY. Si en tu script es otro tipo, ajusta aqui y en Event.
    event_type_id: Mapped[int] = mapped_column("EventTypeId", Integer, primary_key=True)
    name: Mapped[str] = mapped_column("Name", String(50), unique=True)
    display_name: Mapped[str] = mapped_column("DisplayName", String(100))
    is_active: Mapped[bool] = mapped_column("IsActive", Boolean)


class Event(Base):
    __tablename__ = "Events"
    __table_args__ = {"schema": "dbo", "implicit_returning": False}

    event_id: Mapped[uuid.UUID] = mapped_column(
        "EventId", UNIQUEIDENTIFIER(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        "TenantId", UNIQUEIDENTIFIER(as_uuid=True), ForeignKey("dbo.Tenants.TenantId")
    )
    created_by_user_id: Mapped[uuid.UUID] = mapped_column(
        "CreatedByUserId", UNIQUEIDENTIFIER(as_uuid=True), ForeignKey("dbo.Users.UserId")
    )
    event_type_id: Mapped[int] = mapped_column(
        "EventTypeId", Integer, ForeignKey("dbo.EventTypes.EventTypeId")
    )
    name: Mapped[str] = mapped_column("Name", String(200))
    event_date: Mapped[datetime] = mapped_column("EventDate", DateTime)  # UTC
    location: Mapped[str] = mapped_column("Location", String(300))
    description: Mapped[str | None] = mapped_column("Description", Text, nullable=True)
    expected_attendees: Mapped[int] = mapped_column("ExpectedAttendees", Integer, default=0)
    status: Mapped[str] = mapped_column("Status", String(20))
    created_at: Mapped[datetime] = mapped_column(
        "CreatedAt", DateTime, server_default=text("SYSUTCDATETIME()")
    )
    updated_at: Mapped[datetime] = mapped_column(
        "UpdatedAt", DateTime, server_default=text("SYSUTCDATETIME()")
    )


class EventImage(Base):
    __tablename__ = "EventImages"
    __table_args__ = {"schema": "dbo"}

    event_image_id: Mapped[uuid.UUID] = mapped_column(
        "EventImageId", UNIQUEIDENTIFIER(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    event_id: Mapped[uuid.UUID] = mapped_column(
        "EventId", UNIQUEIDENTIFIER(as_uuid=True), ForeignKey("dbo.Events.EventId"), unique=True
    )
    original_file_name: Mapped[str] = mapped_column("OriginalFileName", String(255))
    content_type: Mapped[str] = mapped_column("ContentType", String(100))
    file_size_bytes: Mapped[int] = mapped_column("FileSizeBytes", BigInteger)
    storage_provider: Mapped[str] = mapped_column("StorageProvider", String(20), default="s3")
    storage_key: Mapped[str] = mapped_column("StorageKey", String(500))
    storage_url: Mapped[str | None] = mapped_column("StorageUrl", String(1000), nullable=True)
