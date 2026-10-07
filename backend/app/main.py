"""StudySpot API entry point.

Run locally with:  uvicorn app.main:app --reload
"""

from fastapi import FastAPI

app = FastAPI(
    title="StudySpot API",
    description="Real-time occupancy and booking for campus study spaces.",
    version="0.1.0",
)


@app.get("/health", tags=["system"])
def health() -> dict[str, str]:
    """Liveness check: returns 200 when the server is up."""
    return {"status": "ok"}
