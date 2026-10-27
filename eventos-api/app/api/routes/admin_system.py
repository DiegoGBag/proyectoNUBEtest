"""Monitoreo del administrador maestro: informacion de la base de datos y de seguridad.

Solo lectura. Las consultas usan vistas de catalogo de SQL Server; las que
requieren permisos extra (p. ej. VIEW DATABASE STATE) se envuelven para que un
permiso faltante no tumbe todo el panel.
"""

import time
from datetime import date, datetime
from decimal import Decimal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select, text
from sqlalchemy.orm import Session

from app.api.deps import get_db, require_master_admin
from app.core import audit
from app.core.config import settings
from app.db.session import engine
from app.models import Tenant, TenantUser, User

router = APIRouter(
    prefix="/api/admin",
    tags=["admin-system"],
    dependencies=[Depends(require_master_admin)],
)

# Columnas que nunca se devuelven al explorar tablas.
HIDDEN_COLUMNS = {"passwordhash"}


def _safe(db: Session, sql: str, **params):
    """Ejecuta una consulta de catalogo; si falla (permisos, motor distinto) devuelve None."""
    try:
        return db.execute(text(sql), params).all()
    except Exception:  # noqa: BLE001
        db.rollback()
        return None


def _jsonable(value):
    if isinstance(value, (bytes, bytearray, memoryview)):
        return "0x" + bytes(value).hex()
    if isinstance(value, Decimal):
        return float(value)
    if isinstance(value, (datetime, date, UUID)):
        return str(value) if isinstance(value, UUID) else value.isoformat()
    return value


def _quote(identifier: str) -> str:
    return "[" + identifier.replace("]", "]]") + "]"


# --- Base de datos -----------------------------------------------------------


@router.get("/database/info")
def database_info(db: Session = Depends(get_db)):
    started = time.perf_counter()
    db.execute(text("SELECT 1"))
    latency_ms = round((time.perf_counter() - started) * 1000, 1)

    identity = _safe(db, "SELECT @@VERSION, DB_NAME(), @@SERVERNAME")
    size = _safe(db, "SELECT SUM(CAST(size AS BIGINT)) * 8 / 1024.0 FROM sys.database_files")
    sessions = _safe(
        db, "SELECT COUNT(*) FROM sys.dm_exec_sessions WHERE is_user_process = 1 AND database_id = DB_ID()"
    )
    tables = _safe(db, "SELECT COUNT(*) FROM sys.tables")

    pool = engine.pool
    return {
        "status": "ok",
        "latency_ms": latency_ms,
        "version": (identity[0][0].splitlines()[0] if identity else None),
        "database": identity[0][1] if identity else None,
        "server": identity[0][2] if identity else None,
        "size_mb": round(float(size[0][0]), 1) if size and size[0][0] is not None else None,
        "active_sessions": sessions[0][0] if sessions else None,
        "table_count": tables[0][0] if tables else None,
        "pool": {
            "size": getattr(pool, "size", lambda: None)(),
            "checked_out": getattr(pool, "checkedout", lambda: None)(),
            "overflow": getattr(pool, "overflow", lambda: None)(),
        },
        "environment": settings.APP_ENV,
    }


@router.get("/database/tables")
def database_tables(db: Session = Depends(get_db)):
    rows = _safe(
        db,
        """
        SELECT s.name AS schema_name, t.name AS table_name,
               SUM(CASE WHEN p.index_id IN (0, 1) THEN p.row_count ELSE 0 END) AS row_count,
               SUM(p.reserved_page_count) * 8 AS reserved_kb
        FROM sys.tables t
        JOIN sys.schemas s ON s.schema_id = t.schema_id
        JOIN sys.dm_db_partition_stats p ON p.object_id = t.object_id
        GROUP BY s.name, t.name
        ORDER BY s.name, t.name
        """,
    )
    if rows is None:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "Could not read the database catalog")
    return [
        {"schema": r.schema_name, "table": r.table_name, "rows": r.row_count, "size_kb": r.reserved_kb}
        for r in rows
    ]


def _resolve_table(db: Session, schema: str, table: str) -> tuple[str, str]:
    """Devuelve (schema, table) tal como existen en la base; evita inyectar identificadores."""
    rows = _safe(
        db,
        "SELECT s.name, t.name FROM sys.tables t JOIN sys.schemas s ON s.schema_id = t.schema_id "
        "WHERE s.name = :schema AND t.name = :table",
        schema=schema,
        table=table,
    )
    if not rows:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Table not found")
    return rows[0][0], rows[0][1]


@router.get("/database/tables/{schema}/{table}")
def table_data(
    schema: str,
    table: str,
    limit: int = Query(25, ge=1, le=200),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
):
    schema, table = _resolve_table(db, schema, table)
    columns = db.execute(
        text(
            "SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE, CHARACTER_MAXIMUM_LENGTH "
            "FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = :s AND TABLE_NAME = :t "
            "ORDER BY ORDINAL_POSITION"
        ),
        {"s": schema, "t": table},
    ).all()
    visible = [c for c in columns if c.COLUMN_NAME.lower() not in HIDDEN_COLUMNS]
    target = f"{_quote(schema)}.{_quote(table)}"
    total = db.execute(text(f"SELECT COUNT(*) FROM {target}")).scalar() or 0
    rows = db.execute(
        text(
            f"SELECT {', '.join(_quote(c.COLUMN_NAME) for c in visible)} FROM {target} "
            f"ORDER BY (SELECT NULL) OFFSET :o ROWS FETCH NEXT :l ROWS ONLY"
        ),
        {"o": offset, "l": limit},
    ).all()
    return {
        "schema": schema,
        "table": table,
        "total": total,
        "limit": limit,
        "offset": offset,
        "hidden_columns": [c.COLUMN_NAME for c in columns if c.COLUMN_NAME.lower() in HIDDEN_COLUMNS],
        "columns": [
            {
                "name": c.COLUMN_NAME,
                "type": c.DATA_TYPE,
                "nullable": c.IS_NULLABLE == "YES",
                "max_length": c.CHARACTER_MAXIMUM_LENGTH,
            }
            for c in visible
        ],
        "rows": [[_jsonable(v) for v in row] for row in rows],
    }


# --- Seguridad ---------------------------------------------------------------


@router.get("/security/status")
def security_status(db: Session = Depends(get_db)):
    policies = _safe(
        db,
        """
        SELECT sp.name AS policy, sp.is_enabled, OBJECT_NAME(spp.target_object_id) AS target,
               spp.predicate_type_desc AS predicate
        FROM sys.security_policies sp
        JOIN sys.security_predicates spp ON spp.object_id = sp.object_id
        ORDER BY sp.name
        """,
    )

    scalar = lambda stmt: db.scalar(stmt) or 0  # noqa: E731
    users_without_tenant = scalar(
        select(func.count(User.user_id)).where(
            ~User.user_id.in_(select(TenantUser.user_id))
        )
    )
    tenants_without_members = scalar(
        select(func.count(Tenant.tenant_id)).where(~Tenant.tenant_id.in_(select(TenantUser.tenant_id)))
    )
    tenants_without_owner = scalar(
        select(func.count(Tenant.tenant_id)).where(
            ~Tenant.tenant_id.in_(select(TenantUser.tenant_id).where(TenantUser.role_name == "owner"))
        )
    )
    multi_tenant_users = scalar(
        select(func.count()).select_from(
            select(TenantUser.user_id).group_by(TenantUser.user_id).having(func.count() > 1).subquery()
        )
    )

    secret = settings.JWT_SECRET
    warnings = []
    if len(secret) < 32 or "change_me" in secret.lower():
        warnings.append("JWT_SECRET is short or still the example value")
    if settings.ADMIN_PASSWORD == "admind123456789":
        warnings.append("Master admin is using the default password from the source code; set ADMIN_PASSWORD")
    if "*" in settings.cors_origins_list:
        warnings.append("CORS allows any origin")
    if settings.APP_ENV == "production" and any("localhost" in o for o in settings.cors_origins_list):
        warnings.append("CORS allows localhost in production")
    if policies is not None and not policies:
        warnings.append("No row-level security policy is active on the database")

    return {
        "authentication": {
            "algorithm": settings.JWT_ALGORITHM,
            "token_minutes": settings.ACCESS_TOKEN_EXPIRE_MINUTES,
            "jwt_secret_length": len(secret),
            "admin_email": settings.ADMIN_EMAIL,
            "admin_password_is_default": settings.ADMIN_PASSWORD == "admind123456789",
            "cors_origins": settings.cors_origins_list,
            "environment": settings.APP_ENV,
        },
        "row_level_security": None
        if policies is None
        else [
            {"policy": p.policy, "enabled": bool(p.is_enabled), "table": p.target, "predicate": p.predicate}
            for p in policies
        ],
        "integrity": {
            "inactive_users": scalar(select(func.count(User.user_id)).where(User.is_active == False)),  # noqa: E712
            "users_without_tenant": users_without_tenant,
            "tenants_without_members": tenants_without_members,
            "tenants_without_owner": tenants_without_owner,
            "users_in_multiple_tenants": multi_tenant_users,
        },
        "logins": audit.summary(),
        "warnings": warnings,
    }


@router.get("/security/logins")
def security_logins(limit: int = Query(100, ge=1, le=200)):
    return {
        "note": "In-memory log: resets when the API restarts.",
        "items": audit.recent(limit),
    }
