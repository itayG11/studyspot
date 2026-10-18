// Remembers the page to return to after a Microsoft or Google sign-in,
// which leaves the site and comes back on /signed-in. Kept for one browser
// tab (sessionStorage). Storage can be unavailable (private mode, blocked),
// so every access is guarded; without it the visitor lands on the home page.

import { safeNext } from '../logic/next'

const KEY = 'studyspot.returnTo'

export function rememberReturnTo(path: string): void {
  try {
    sessionStorage.setItem(KEY, safeNext(path))
  } catch {
    // no storage: nothing to remember
  }
}

// Reading does not remove it, so React may render twice safely.
export function peekReturnTo(): string {
  try {
    return safeNext(sessionStorage.getItem(KEY))
  } catch {
    return '/'
  }
}

export function clearReturnTo(): void {
  try {
    sessionStorage.removeItem(KEY)
  } catch {
    // no storage: nothing to clear
  }
}
