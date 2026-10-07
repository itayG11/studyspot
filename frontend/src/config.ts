// Where the API runs and which institution the site shows.
// Set in frontend/.env.local (see .env.example). These values are public.
export const API_URL: string = (import.meta.env.VITE_API_URL ?? 'http://localhost:8000').replace(/\/$/, '')
export const INSTITUTION: string = import.meta.env.VITE_INSTITUTION ?? 'braude'

// How often the map and the place pages ask the server for fresh numbers.
// Live updates (WebSocket) come in stage 9.
export const REFRESH_INTERVAL_MS = 30_000
