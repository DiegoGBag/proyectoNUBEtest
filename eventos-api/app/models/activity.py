import uuid
from datetime import datetime

from sqlalchemy import BigInteger, DateTime, Index, String, text
from sqlalchemy.dialects.mssql import UNIQUEIDENTIFIER
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class UserActivity(Base):
    """Actividad de los usuarios (inicios de sesion, consultas, intentos bloqueados).

    Sin llaves foraneas a proposito: la bitacora debe sobrevivir a cambios en
    Users/Tenants y borrarla no debe bloquear esos borrados. La tabla se crea
    sola al arrancar la API si no existe (ver app/main.py).
    """

    __tablename__ = "UserActivity"
    __table_args__ = {"schema": "dbo"}

    activity_id: Mapped[int] = mapped_column("ActivityId", BigInteger, primary_key=True, autoincrement=True)
    tenant_id: Mapped[uuid.UUID] = mapped_column("TenantId", UNIQUEIDENTIFIER(as_uuid=True))
    user_id: Mapped[uuid.UUID] = mapped_column("UserId", UNIQUEIDENTIFIER(as_uuid=True))
    action: Mapped[str] = mapped_column("Action", String(50))
    detail: Mapped[str | None] = mapped_column("Detail", String(300), nullable=True)
    ip_address: Mapped[str | None] = mapped_column("IpAddress", String(64), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        "CreatedAt", DateTime, server_default=text("SYSUTCDATETIME()")
    )


Index("IX_UserActivity_Tenant_Created", UserActivity.tenant_id, UserActivity.created_at)
Index("IX_UserActivity_User_Created", UserActivity.user_id, UserActivity.created_at)
