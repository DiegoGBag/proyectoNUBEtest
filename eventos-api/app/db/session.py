from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.core.config import settings

# pyodbc es sincrono: los endpoints son `def` normales y FastAPI los corre en
# un threadpool, asi que no bloquean el event loop.
engine = create_engine(settings.DATABASE_URL, pool_pre_ping=True, fast_executemany=True)

SessionLocal = sessionmaker(bind=engine, expire_on_commit=False)
