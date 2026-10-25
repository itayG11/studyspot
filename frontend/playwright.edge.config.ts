// The edge cases, on three devices, against the site as it is deployed:
// the production build, served with the API from one address by
// app.site, with its security headers. (playwright.config.ts runs the
// development servers instead.)
//
// Run:  npx playwright test -c playwright.edge.config.ts
// Before the first run, the database must be ready, as for the other tests.
// It changes data: it replaces the code on building L's sign each run, so
// run it on a development or test database, never on one with printed signs.

import { defineConfig, devices } from '@playwright/test'

const PORT = 8002
const python = process.env.PYTHON ?? 'python'
// What our proxy adds in front of the live site (TRUSTED_PROXY_HOPS below).
const visitor = (n: number) => ({ 'X-Forwarded-For': `198.51.100.${n}` })
const launchOptions = process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}

export default defineConfig({
  testDir: './e2e',
  testMatch: ['edge.spec.ts', 'sweep.spec.ts'],
  timeout: 60_000,
  // The devices share the demo users and their bookings: one at a time.
  workers: 1,
  use: {
    baseURL: `http://localhost:${PORT}`,
    // The cookie note (src/components/CookieNote.tsx) already read: it sits
    // over the bottom of the page. e2e/cookies.spec.ts starts without it.
    storageState: { cookies: [], origins: [{ origin: `http://localhost:${PORT}`, localStorage: [{ name: 'studyspot:cookie-note-seen', value: '1' }] }] },
    locale: 'he-IL',
    timezoneId: 'Asia/Jerusalem',
    trace: 'retain-on-failure',
    launchOptions,
  },
  // Only Chromium is installed here: the tablet and the phone are its
  // emulation of their size, touch and pixel density, not Safari itself.
  // Each device is a visitor of its own, from an address of its own, as
  // three real visitors would be: they all sign in as the one demo student,
  // whose writes are counted per address (app/ratelimit.py per_person), and
  // one address doing three devices' writes in a minute is over the limit.
  projects: [
    { name: 'computer', use: { viewport: { width: 1280, height: 860 }, extraHTTPHeaders: visitor(1) } },
    { name: 'ipad', use: { ...devices['iPad Pro 11'], browserName: 'chromium', launchOptions, extraHTTPHeaders: visitor(2) } },
    { name: 'phone', use: { ...devices['iPhone 13'], browserName: 'chromium', launchOptions, extraHTTPHeaders: visitor(3) } },
  ],
  webServer: {
    command:
      'npx vite build --outDir dist/edge --emptyOutDir && cd ../backend && ' +
      `${python} -m uvicorn app.site:app --port ${PORT}`,
    url: `http://localhost:${PORT}/api/health`,
    timeout: 180_000,
    env: {
      VITE_API_URL: '/api',
      VITE_INSTITUTION: 'demo',
      STATIC_DIR: '../frontend/dist/edge',
      SITE_URL: `http://localhost:${PORT}`,
      DEMO_LOGIN_ENABLED: 'true',
      SWEEP_INTERVAL_SECONDS: '0',
      TRUSTED_PROXY_HOPS: '1',
    },
    reuseExistingServer: false,
  },
})
