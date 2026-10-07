# StudySpot

Real-time occupancy and booking for campus study spaces.

> 🚧 Work in progress. Started October 2026.

## The problem

Students waste time walking around campus looking for a free place to study.
Existing tools either only book rooms in advance (no live picture of what is free right now),
or rely on expensive occupancy sensors.

## What StudySpot does

- **Live campus map** – buildings colored by how full they are right now.
- **Three kinds of study spaces**
  - *Group study rooms* – book the whole room for a time slot.
  - *Open study areas* – no booking; scan in and the system counts free seats.
  - *Computer labs* – one QR code at the entrance opens a seat map of every station.
- **QR check-in** to confirm you actually arrived.
- **No-show release** – a booking that is not checked in within 15 minutes is released automatically, with reminders before it happens.
- **Notifications** – web push, email, and an optional Telegram bot.
- **Multi-campus** – any college or university can define its own campus. Braude College is the first one.

## Tech stack (planned)

| Layer | Technology |
|---|---|
| Backend | Python 3.12, FastAPI |
| Database | PostgreSQL, SQLAlchemy, Alembic |
| Auth | Google & Microsoft (OpenID Connect), JWT |
| Frontend | React + Vite, Leaflet + OpenStreetMap, PWA |
| Real-time | WebSocket |
| Notifications | Web Push, email, Telegram bot |
| DevOps | Docker Compose, GitHub Actions, pytest |

## Documentation

- [Project plan](docs/PLAN.md) (Hebrew)
- [Competitive analysis](docs/COMPETITIVE_ANALYSIS.md) (Hebrew)
- [Interview report](docs/INTERVIEW_REPORT.md) (Hebrew, updated every stage)
- [Campus data](docs/CAMPUS_DATA.md) (Hebrew, filled in by hand)

## Running locally

```bash
cp .env.example .env              # then set a real POSTGRES_PASSWORD
docker compose up -d              # PostgreSQL 16
cd backend
python -m venv .venv && source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -e ".[dev]"
pytest
uvicorn app.main:app --reload     # http://localhost:8000/health, docs at /docs
```

## Status

- [x] Planning and research
- [x] Project skeleton (FastAPI health check, PostgreSQL in Docker)
- [x] Campus data
- [ ] Data model
- [ ] Core API (spaces, check-in, bookings)
- [ ] Authentication
- [ ] Web app with campus map
- [ ] CI, Docker, deployment
- [ ] Notifications
- [ ] Real-time updates and occupancy prediction
