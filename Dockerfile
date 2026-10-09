# syntax=docker/dockerfile:1
# One image for the whole site: the web app is built in the first stage,
# and the Python server serves it next to the API (backend/app/site.py).
#
#   docker build -t studyspot .
#   docker run -p 8000:8000 --env-file .env studyspot

# --- 1. The web app ----------------------------------------------------------
FROM node:22-alpine AS web
WORKDIR /web
# The dependency list first: this layer is reused until it changes.
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
# The API is on the same address, under /api. The campus a visitor who is
# not signed in sees first (each campus also has its own address, /demo)
# is public, so it is a build setting, not a secret.
ARG VITE_INSTITUTION=demo
# The aerial photo layer needs an ArcGIS account under Esri's terms
# (docs/DEPLOY.md); without one the map shows OpenStreetMap only.
ARG VITE_AERIAL=off
RUN VITE_API_URL=/api VITE_INSTITUTION=$VITE_INSTITUTION VITE_AERIAL=$VITE_AERIAL npm run build

# --- 2. The server -----------------------------------------------------------
FROM python:3.13-slim
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    STATIC_DIR=/app/static
WORKDIR /app
COPY backend/pyproject.toml ./
COPY backend/app ./app
RUN pip install .
COPY backend/alembic.ini ./
COPY backend/migrations ./migrations
COPY --from=web /web/dist ./static
COPY deploy/start.sh ./start.sh

# Not root: a bug in the server cannot change the image's own files.
RUN useradd --create-home --uid 10001 studyspot
USER studyspot

EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=3s CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:' + __import__('os').environ.get('PORT', '8000') + '/api/health')"
CMD ["./start.sh"]
