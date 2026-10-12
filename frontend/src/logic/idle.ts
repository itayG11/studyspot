// Whether anyone is at the page. A tab left open overnight must not keep
// asking the server every half minute: every request counts as a visit, so
// the server's background sweep, and the database under it, never rest
// (backend/app/activity.py). After IDLE_MS with no key, click, touch or
// scroll the refreshes stop, and the next one of those starts them again.

export const IDLE_MS = 15 * 60_000

let lastActivity = Date.now()
const wakers = new Set<() => void>()

function markActive() {
  const wasIdle = isIdle()
  lastActivity = Date.now()
  if (wasIdle) for (const wake of wakers) wake()
}

export function isIdle(now = Date.now()): boolean {
  return now - lastActivity >= IDLE_MS
}

// Called once when the person comes back after being idle.
export function onWake(wake: () => void): () => void {
  wakers.add(wake)
  return () => wakers.delete(wake)
}

if (typeof window !== 'undefined') {
  for (const event of ['keydown', 'pointerdown', 'touchstart', 'wheel', 'scroll']) {
    window.addEventListener(event, markActive, { passive: true, capture: true })
  }
  // Coming back to the tab is being at the page again.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') markActive()
  })
}

export function resetActivityForTests() {
  lastActivity = Date.now()
  wakers.clear()
}
