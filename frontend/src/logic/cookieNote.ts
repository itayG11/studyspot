// The note about cookies, at the bottom of the page until "got it". Only a
// notice, not a consent: the site's two cookies are needed for signing in
// (see the privacy page), so there is nothing to refuse. Remembered on this
// device; when storage is refused (private mode) the note comes back.
export const COOKIE_NOTE_KEY = 'studyspot:cookie-note-seen'

export function cookieNoteSeen(): boolean {
  try {
    return localStorage.getItem(COOKIE_NOTE_KEY) === '1'
  } catch {
    return false
  }
}

export function markCookieNoteSeen(): void {
  try {
    localStorage.setItem(COOKIE_NOTE_KEY, '1')
  } catch {
    // not remembered; nothing else breaks
  }
}
