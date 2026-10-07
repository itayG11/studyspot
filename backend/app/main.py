"""StudySpot API entry point.

Run locally with:  uvicorn app.main:app --reload
"""

import asyncio
import contextlib
import os
from collections.abc import AsyncIterator

from fastapi import FastAPI

from app.api import bookings, campus, checkins
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


app.include_router(campus.router)
app.include_router(checkins.router)
app.include_router(bookings.router)
