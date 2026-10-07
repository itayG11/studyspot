"""StudySpot API entry point.

Run locally with:  uvicorn app.main:app --reload
"""

import asyncio
import contextlib
import os
from collections.abc import AsyncIterator

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import auth, bookings, campus, checkins
from app.config import get_settings
from app.sweeper import run_forever

# Seconds between background sweeps; 0 turns the sweep off (tests do this).
SWEEP_INTERVAL = float(os.environ.get("SWEEP_INTERVAL_SECONDS", "60"))


@contextlib.asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    """Start the background sweep with the server, stop it on shutdown."""
    task = asyncio.create_task(run_forever(SWEEP_INTERVAL)) if SWEEP_INTERVAL > 0 else None
    yield
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


@app.get("/health", tags=["system"])
def health() -> dict[str, str]:
    """Liveness check: returns 200 when the server is up."""
    return {"status": "ok"}


# Only the web app's own origin may call the API with credentials.
app.add_middleware(
    CORSMiddleware,
    allow_origins=get_settings().allowed_origins(),
    allow_credentials=True,
    allow_methods=["GET", "POST"],
    allow_headers=["Authorization", "Content-Type"],
)

app.include_router(auth.router)
app.include_router(campus.router)
app.include_router(checkins.router)
app.include_router(bookings.router)
