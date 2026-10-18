# StudySpot frontend

React 19 + TypeScript + Vite. The campus map uses Leaflet with OpenStreetMap
tiles (and an Esri aerial layer). All text is Hebrew, right to left.

## Run

```bash
cp .env.example .env.local   # VITE_API_URL, VITE_INSTITUTION
npm install
npm run dev                  # http://localhost:5173 (the API must run on :8000)
```

To sign in without a Microsoft account, set `DEMO_LOGIN_ENABLED=true` in the
repository `.env` (development only) and use the demo buttons on `/login`.

## Checks

```bash
npm run build      # type check (tsc) and production build
npm run lint       # oxlint
npm test           # Vitest: logic and components
npm run e2e        # Playwright: a real browser against the real API
```

`npm run e2e` starts its own API (port 8001, demo sign-in on) and site
(port 5174). It uses the database from the repository `.env`, which must be
migrated and seeded first. `PYTHON` picks the Python that runs the API;
`CHROMIUM_PATH` points at an installed Chromium if Playwright's own is missing.

## Layout

| Folder | What is in it |
|---|---|
| `src/api` | Server types (`types.ts`, mirrors `backend/app/schemas.py`) and the one fetch wrapper (`client.ts`) |
| `src/auth` | Who is signed in (`AuthContext`) |
| `src/logic` | Pure functions: occupancy levels, seat states, wording, time zones. Tested without a browser |
| `src/components`, `src/map`, `src/hero`, `src/pages` | What is drawn. Each has its own `.module.css` |
| `src/map/tiles.ts` | Where map pictures come from (aerial photo, labels, street map) and their credits |
| `src/styles` | Design tokens (colours, fonts, motion) and the shared base styles |
| `src/i18n` | Hebrew texts and the Hebrew message for each server error code |
| `e2e` | Playwright tests |
