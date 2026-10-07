#!/bin/sh
# Starts the site in its container: brings the database up to date, makes
# sure the campus data is there (both steps change nothing when it already
# is), then runs the server.
set -e

alembic upgrade head
python -m app.seed

# --proxy-headers: the host's proxy says who the visitor is (X-Forwarded-For),
# so the rate limits count real visitors, not the proxy. Trusting any proxy
# address is safe only because the container is reachable through the
# host's proxy alone (Render), never directly.
exec uvicorn app.site:app --host 0.0.0.0 --port "${PORT:-8000}" --proxy-headers --forwarded-allow-ips="*"
