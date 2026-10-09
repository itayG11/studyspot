// Where the API runs, and the institution a visitor who is not signed in
// sees first (every institution has its own address: /demo, /braude).
// Set in frontend/.env.local (see .env.example). These values are public.
export const API_URL: string = (import.meta.env.VITE_API_URL ?? 'http://localhost:8000').replace(/\/$/, '')
export const DEFAULT_INSTITUTION: string = import.meta.env.VITE_INSTITUTION ?? 'demo'

// The site's public address, printed inside every sign's QR code. Set it
// before printing signs (VITE_SITE_URL); otherwise the address the admin
// is using now is taken, which is wrong when printing from a test server.
export const SITE_URL: string = (import.meta.env.VITE_SITE_URL ?? window.location.origin).replace(/\/$/, '')

// How often the map and the place pages ask the server for fresh numbers.
// Live updates (WebSocket) come in stage 9.
export const REFRESH_INTERVAL_MS = 30_000
