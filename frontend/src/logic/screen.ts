// The screen by the door (wave 13): a tablet that shows the code for this
// minute. Its secret link sits after "#" (/screen#t=...): the browser never
// sends that part, so the token reaches the server only in a header.

export function tokenFromHash(hash: string): string | null {
  const value = new URLSearchParams(hash.replace(/^#/, '')).get('t')
  return value ? value : null
}

const ASK_AT_MOST_EVERY_MS = 20_000 // the occupancy stays fresh too
const AFTER_CHANGE_MS = 300 // just after the new minute, not just before it

// When to ask the server again: right after the code changes.
export function nextAskMs(secondsLeft: number): number {
  return Math.min(secondsLeft * 1000 + AFTER_CHANGE_MS, ASK_AT_MOST_EVERY_MS)
}

// The server takes this minute's code and the last minute's (app/codes.py).
// Without a network, the screen keeps a code it has for 35 seconds into the
// next minute, so a student who scans it still has time to press "I'm here".
const GRACE_MS = 35_000

export function codeStillGood(fetchedAtMs: number, secondsLeft: number, nowMs: number): boolean {
  return nowMs <= fetchedAtMs + secondsLeft * 1000 + GRACE_MS
}
