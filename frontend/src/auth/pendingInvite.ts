// An admin invite link waiting for its admin to sign in. It is kept for one
// browser tab (sessionStorage) instead of in the sign-in address, so it does
// not end up in the browser history. Storage can be unavailable (private
// mode), so every access is guarded.

const KEY = 'studyspot.pendingInvite'

export function rememberPendingInvite(token: string): void {
  try {
    sessionStorage.setItem(KEY, token)
  } catch {
    // no storage: the link is opened again after signing in
  }
}

export function peekPendingInvite(): string | null {
  try {
    return sessionStorage.getItem(KEY)
  } catch {
    return null
  }
}

export function clearPendingInvite(): void {
  try {
    sessionStorage.removeItem(KEY)
  } catch {
    // no storage: nothing to clear
  }
}
