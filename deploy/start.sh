#!/bin/sh
# Starts the site in its container: brings the database up to date, makes
# sure the campus data is there (both steps change nothing when it already
# is), then runs the server.
set -e

alembic upgrade head
python -m app.seed

# The visitor's address for the rate limits is read by the app itself,
# from the hops our own proxy adds (TRUSTED_PROXY_HOPS, app/ratelimit.py),
# never from what the visitor wrote. Nothing else needs it.
exec uvicorn app.site:app --host 0.0.0.0 --port "${PORT:-8000}"
