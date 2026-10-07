// End-to-end tests: a real browser against the real server and database.
//
// Before the first run: the database from the repository .env must exist,
// with `alembic upgrade head` and `python -m app.seed` done (see README).
// Both servers start on their own ports, so a running dev server is not touched.

import { defineConfig } from '@playwright/test'

const API_PORT = 8001
const WEB_PORT = 5174
const python = process.env.PYTHON ?? 'python'

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  // The tests share the demo users and their bookings: one at a time.
  workers: 1,
  use: {
    baseURL: `http://localhost:${WEB_PORT}`,
    locale: 'he-IL',
    timezoneId: 'Asia/Jerusalem',
    trace: 'retain-on-failure',
    // Lets an environment point at an already installed Chromium.
    launchOptions: process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {},
  },
  webServer: [
    {
      command: `${python} -m uvicorn app.main:app --port ${API_PORT}`,
      cwd: '../backend',
      url: `http://localhost:${API_PORT}/health`,
      env: {
        DEMO_LOGIN_ENABLED: 'true',
        FRONTEND_URL: `http://localhost:${WEB_PORT}`,
        PUBLIC_API_URL: `http://localhost:${API_PORT}`,
        SWEEP_INTERVAL_SECONDS: '0',
      },
      reuseExistingServer: false,
    },
    {
      command: `npx vite --port ${WEB_PORT} --strictPort`,
      url: `http://localhost:${WEB_PORT}`,
      env: { VITE_API_URL: `http://localhost:${API_PORT}`, VITE_INSTITUTION: 'demo' },
      reuseExistingServer: false,
    },
  ],
})
