import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import admin, admin_system, auth, events, team
from app.core.config import settings
from app.db.session import engine
from app.models import UserActivity

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(_: FastAPI):
    # La bitacora de actividad es la unica tabla que crea la propia API; el resto del
    # esquema vive en los scripts SQL. Si no hay permisos de DDL, la API arranca igual
    # (registrar actividad nunca rompe una peticion) y se deja constancia en el log.
    try:
        UserActivity.__table__.create(bind=engine, checkfirst=True)
    except Exception:  # noqa: BLE001
        logger.exception("Could not create dbo.UserActivity; activity monitoring will be empty")
    yield


app = FastAPI(title="Events API", version="0.3.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(events.router)
app.include_router(team.router)
app.include_router(admin.router)
app.include_router(admin_system.router)


@app.get("/api/health", tags=["health"])
def health():
    return {"status": "ok", "env": settings.APP_ENV}
