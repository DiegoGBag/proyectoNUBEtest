"""Bitacora de inicios de sesion y limite de intentos fallidos.

Vive en memoria del proceso: se pierde al reiniciar y no se comparte entre
workers. Sirve para monitoreo en el panel de seguridad y para frenar fuerza
bruta; no sustituye una bitacora persistente.
"""

import time
from collections import deque
from datetime import datetime, timezone
from threading import Lock

from fastapi import HTTPException, status

MAX_FAILURES = 8
WINDOW_SECONDS = 300

_lock = Lock()
_events: deque[dict] = deque(maxlen=200)
_failures: dict[str, deque[float]] = {}


def _now_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _recent_failures(identifier: str, now: float) -> deque[float]:
    attempts = _failures.setdefault(identifier, deque())
    while attempts and now - attempts[0] > WINDOW_SECONDS:
        attempts.popleft()
    return attempts


def check_throttle(identifier: str) -> None:
    with _lock:
        if len(_recent_failures(identifier, time.time())) >= MAX_FAILURES:
            raise HTTPException(
                status.HTTP_429_TOO_MANY_REQUESTS,
                "Too many failed attempts. Try again in a few minutes.",
            )


def record_login(identifier: str, success: bool, kind: str = "user", ip: str | None = None) -> None:
    with _lock:
        _events.appendleft(
            {
                "at": _now_iso(),
                "identifier": identifier,
                "kind": kind,  # user | admin
                "success": success,
                "ip": ip,
            }
        )
        if success:
            _failures.pop(identifier, None)
        else:
            _recent_failures(identifier, time.time()).append(time.time())


def recent(limit: int = 100) -> list[dict]:
    with _lock:
        return list(_events)[:limit]


def summary() -> dict:
    now = time.time()
    cutoff = _now_iso_minus(3600)
    with _lock:
        blocked = [k for k in list(_failures) if len(_recent_failures(k, now)) >= MAX_FAILURES]
        last_hour = [e for e in _events if e["at"] >= cutoff]
    return {
        "failed_last_hour": sum(1 for e in last_hour if not e["success"]),
        "successful_last_hour": sum(1 for e in last_hour if e["success"]),
        "currently_blocked": blocked,
        "max_failures": MAX_FAILURES,
        "window_seconds": WINDOW_SECONDS,
    }


def _now_iso_minus(seconds: int) -> str:
    return datetime.fromtimestamp(time.time() - seconds, timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
