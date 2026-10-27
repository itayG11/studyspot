// Crashes in the browser, reported to our own server (wave 16.6).
//
// The site's Content-Security-Policy lets the page talk only to the site
// itself, so a report goes to POST /client-errors, and the server passes it
// to Sentry after scrubbing it (backend app/monitoring.py). What is sent:
// the message, the stack (code addresses, not data), and the page's path
// without its query. Nothing the visitor typed, no cookies, no account.

import { API_URL } from '../config'

export interface ErrorReport {
  message: string
  stack?: string
  path: string
}

export type Send = (report: ErrorReport) => void

const MESSAGE_MAX = 500 // the same limits as the server's, which refuses more
const STACK_MAX = 4000
const REPORTS_PER_PAGE_LOAD = 5
const UNKNOWN = 'שגיאה לא ידועה'
// Reports that only add noise: a harmless browser notice, and what the
// browser says in place of an error from a script of another address.
const NOISE = [/^ResizeObserver loop/, /^Script error\.?$/]

export function buildReport(thrown: unknown): ErrorReport {
  const error = thrown instanceof Error ? thrown : null
  const text = error ? error.message : typeof thrown === 'string' ? thrown : ''
  const report: ErrorReport = { message: (text || UNKNOWN).slice(0, MESSAGE_MAX), path: window.location.pathname }
  if (error?.stack) report.stack = error.stack.slice(0, STACK_MAX)
  return report
}

// One reporter per page load: each message once, and a few at most, so a
// page that crashes in a loop cannot flood the server.
export function createReporter(send: Send): (thrown: unknown) => void {
  const seen = new Set<string>()
  return (thrown) => {
    try {
      const report = buildReport(thrown)
      if (NOISE.some((pattern) => pattern.test(report.message))) return
      if (seen.has(report.message) || seen.size >= REPORTS_PER_PAGE_LOAD) return
      seen.add(report.message)
      send(report)
    } catch {
      // Reporting a crash must never be a crash of its own.
    }
  }
}

export function installErrorReporting(report: (thrown: unknown) => void): () => void {
  const onError = (event: ErrorEvent) => report(event.error ?? event.message)
  const onRejection = (event: Event) => report((event as Event & { reason?: unknown }).reason)
  window.addEventListener('error', onError)
  window.addEventListener('unhandledrejection', onRejection)
  return () => {
    window.removeEventListener('error', onError)
    window.removeEventListener('unhandledrejection', onRejection)
  }
}

// No cookies and no waiting: a report that fails is simply lost.
export const sendReport: Send = (report) => {
  void fetch(`${API_URL}/client-errors`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(report),
    credentials: 'omit',
    keepalive: true,
  }).catch(() => undefined)
}

// What a page that catches a crash itself (the route's error page) uses.
export const reportError = createReporter(sendReport)
