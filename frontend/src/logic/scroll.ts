// The key a scroll position is saved under (React Router's ScrollRestoration).
// Moving inside the site, each visit has a key of its own, so "back" returns
// to where you were. A full page load (a refresh, a link from outside, the
// return from Google or Microsoft) always has the key "default", which would
// share one position between all of them: those are keyed by their address.

export function scrollKey(location: { key: string; pathname: string }): string {
  return location.key === 'default' ? location.pathname : location.key
}
