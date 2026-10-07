// Where to go after signing in. The address comes from storage that a page
// could have changed, so only a path on this site is accepted. Without
// this check, a link could sign a student in and then send them to a fake
// look-alike site (an "open redirect").

export function safeNext(value: string | null | undefined): string {
  if (!value || !value.startsWith('/')) return '/'
  // "//host" and "/\host" are read by browsers as another site.
  if (value.startsWith('//') || value.startsWith('/\\')) return '/'
  // No control characters (a newline could hide what follows).
  for (const char of value) {
    const code = char.charCodeAt(0)
    if (code < 32 || code === 127) return '/'
  }
  return value
}
