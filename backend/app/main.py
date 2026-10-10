"""StudySpot API entry point.

Run locally with:  uvicorn app.main:app --reload
"""

import asyncio
import contextlib
import logging
import os
from collections.abc import AsyncIterator

from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware

from app.activity import Activity
from app.api import admin, auth, bookings, campus, checkins, system
from app.config import Settings, get_settings
from app.sweeper import run_forever, run_once, sweep_safely

# Seconds between background sweeps; 0 turns the sweep off (tests do this).
SWEEP_INTERVAL = float(os.environ.get("SWEEP_INTERVAL_SECONDS", "60"))

logger = logging.getLogger("studyspot")

# Real visits, so the sweep can rest while the site is quiet (app/activity.py).
activity = Activity()
# The uptime monitor's address, here and under the site's /api: not a visit.
HEALTH_PATHS = {"/health", "/api/health"}
# How long the visit that ends a quiet spell waits for the catch-up sweep.
# A database still waking up must not hold the visitor; the sweep carries
# on in its thread, and the next round finishes anything left.
WAKE_SWEEP_TIMEOUT = 5.0


def demo_warning(settings: Settings) -> str | None:
    """The demo sign-in hands out an institution admin to anyone, so a
    server that has it on says so loudly at startup."""
    if not settings.demo_login_enabled:
        return None
    return (
        "DEMO_LOGIN_ENABLED is on: anyone can sign in as a demo student or as a "
        f"demo institution admin of '{settings.demo_institution}'. "
        "Never leave it on where real students sign in."
    )


@contextlib.asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    """Start the background sweep with the server, stop it on shutdown."""
    if warning := demo_warning(get_settings()):
        logger.warning(warning)
    task = None
    if SWEEP_INTERVAL > 0:
        task = asyncio.create_task(run_forever(SWEEP_INTERVAL, activity))
    app.state.sweeping = task is not None
    yield
    app.state.sweeping = False
    if task is not None:
        task.cancel()
        with contextlib.suppress(asyncio.CancelledError):
            await task

app = FastAPI(
    title="StudySpot API",
    description="Real-time occupancy and booking for campus study spaces.",
    version="0.1.0",
    lifespan=lifespan,
)


app.state.sweeping = False  # until the lifespan starts the sweep


@app.middleware("http")
async def count_visits(request: Request, call_next) -> Response:
    """Every request but the uptime monitor's is a visit. The visit that
    ends a quiet spell first catches up on the sweep, so a booking whose
    holder never came is already released when this visitor looks."""
    if request.url.path not in HEALTH_PATHS and activity.visit() and app.state.sweeping:
        try:
            await asyncio.wait_for(sweep_safely(run_once), WAKE_SWEEP_TIMEOUT)
        except TimeoutError:
            logger.warning("catch-up sweep took over %ss; answering without it", WAKE_SWEEP_TIMEOUT)
    return await call_next(request)


# HEAD too: uptime monitors often ask that way, and a 405 would read as down.
@app.api_route("/health", methods=["GET", "HEAD"], tags=["system"])
def health() -> dict[str, str]:
    """Liveness check: returns 200 when the server is up."""
    return {"status": "ok"}


# Only the web app's own origin may call the API with credentials.
app.add_middleware(
    CORSMiddleware,
    allow_origins=get_settings().allowed_origins(),
    allow_credentials=True,
    allow_methods=["GET", "POST", "PATCH", "DELETE"],
    allow_headers=["Authorization", "Content-Type"],
)

app.include_router(auth.router)
app.include_router(campus.router)
app.include_router(checkins.router)
app.include_router(bookings.router)
app.include_router(admin.router)
app.include_router(system.router)
