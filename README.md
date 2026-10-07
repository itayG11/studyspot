# StudySpot

Real-time occupancy and booking for campus study spaces.

> 🚧 Work in progress. Started October 2026.

## The problem

Students waste time walking around campus looking for a free place to study.
Existing tools either only book rooms in advance (no live picture of what is free right now),
or rely on expensive occupancy sensors.

## What StudySpot does

- **Live campus map** – buildings colored by how full they are right now.
- **Four kinds of study spaces**
  - *Group study rooms* – book the whole room for a time slot.
  - *Open study areas* – no booking; scan in and the system counts free seats.
  - *Library* – works like an open area, shown separately on the map.
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
cp .env.example .env              # then replace every change-me with one real password
docker compose up -d              # PostgreSQL 16
cd backend
python -m venv .venv && source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -e ".[dev]"
alembic upgrade head              # create the tables
python -m app.seed                # load the Braude campus demo data
python -m app.codes braude        # print the signed check-in code of every place
python -m app.sweeper             # one cleanup round (the server also runs it every 60 s)
python -m app.admin grant-role --email you@example.edu institution_admin
pytest                            # uses a separate studyspot_test database
uvicorn app.main:app --reload     # http://localhost:8000/health, docs at /docs
```

The web app, in a second terminal ([frontend/README.md](frontend/README.md)):

```bash
cd frontend
cp .env.example .env.local
npm install
npm run dev                       # http://localhost:5173
```

To sign in without a Microsoft account during development, set
`DEMO_LOGIN_ENABLED=true` in `.env`: the sign-in page then offers a demo
student and a demo institution admin. Keep it `false` wherever real
students sign in.

## API (so far)

| Method | Path | Who |
|---|---|---|
| GET | `/institutions/{slug}/buildings` | anyone |
| GET | `/institutions/{slug}/places?building=&kind=` | anyone |
| GET | `/places/{id}` | anyone |
| POST | `/check-ins` | signed in |
| GET | `/me/check-in` | signed in |
| POST | `/check-ins/{id}/checkout` | signed in, own check-in only |
| POST | `/bookings` | signed in |
| GET | `/me/bookings` | signed in |
| POST | `/bookings/{id}/cancel` | signed in, own booking only |
| POST | `/bookings/{id}/extend` | signed in, own booking only |
| GET | `/places/{id}/availability?date=` | anyone (busy times only, never who) |
| GET | `/institutions/{slug}` | anyone (name, time zone, booking rules) |
| GET | `/auth/providers` | anyone (which sign-in buttons to show) |
| GET | `/auth/{microsoft or google}/login` | anyone (redirects to the provider) |
| POST | `/auth/demo/login` | anyone, only when `DEMO_LOGIN_ENABLED=true` |
| POST | `/auth/refresh` | refresh cookie: returns a 15-minute access token |
| POST | `/auth/logout`, `/auth/logout-all` | signed in |
| GET | `/me` | signed in |
| GET | `/admin/institutions/{slug}/codes` | institution admin |
| POST | `/admin/places/{id}/revoke-code` | institution admin |
| POST | `/admin/buildings/{id}/location` | institution admin |

Sign-in setup (Microsoft app registration, `.env` values): [docs/AUTH_SETUP.md](docs/AUTH_SETUP.md) (Hebrew).

Interactive docs: http://localhost:8000/docs

## Status

- [x] Planning and research
- [x] Project skeleton (FastAPI health check, PostgreSQL in Docker)
- [x] Campus data
- [x] Data model (campus tables, migrations, Braude demo data)
- [x] Core API: places, live occupancy, check-in with signed codes
- [x] Bookings, renewal, no-show release and database-enforced double-booking prevention
- [x] Authentication: Microsoft and Google sign-in, roles, rate limiting
- [x] Web app, part 1: campus map, places list, place page with the lab seat map, demo sign-in
- [x] Web app, part 2: booking, QR check-in (`/scan#c=...`), my area, admin pages (printable QR signs, building placing)
- [ ] CI, Docker, deployment
- [ ] Notifications
- [ ] Real-time updates and occupancy prediction
