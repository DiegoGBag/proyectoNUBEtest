from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import admin, admin_system, auth, events
from app.core.config import settings

app = FastAPI(title="Events API", version="0.2.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(events.router)
app.include_router(admin.router)
app.include_router(admin_system.router)


@app.get("/api/health", tags=["health"])
def health():
    return {"status": "ok", "env": settings.APP_ENV}
