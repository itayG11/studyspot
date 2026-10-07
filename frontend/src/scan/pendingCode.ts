// A scanned code waiting for the student to sign in. It is kept for one
// browser tab (sessionStorage) instead of in the sign-in address, so it does
// not end up in the browser history. Storage can be unavailable (private
// mode), so every access is guarded.

const KEY = 'studyspot.pendingCode'

export function rememberPendingCode(code: string): void {
  try {
    sessionStorage.setItem(KEY, code)
  } catch {
    // no storage: the student scans again after signing in
  }
}

export function peekPendingCode(): string | null {
  try {
    return sessionStorage.getItem(KEY)
  } catch {
    return null
  }
}

export function clearPendingCode(): void {
  try {
    sessionStorage.removeItem(KEY)
  } catch {
    // no storage: nothing to clear
  }
}
