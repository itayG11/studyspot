// Light, dark, or like the device. The colours themselves are in
// src/design/tokens.css; this only remembers the visitor's choice and marks
// the page with it (data-theme on <html>). Without a mark, the device's own
// setting decides (prefers-color-scheme), with no code at all.

export type Theme = 'system' | 'light' | 'dark'

export const THEME_KEY = 'studyspot:theme'
const CHOICES: readonly Theme[] = ['system', 'light', 'dark']

// Storage can be refused (private mode): the worst case is a choice that is
// not remembered next time.
export function readTheme(): Theme {
  try {
    const stored = localStorage.getItem(THEME_KEY)
    return CHOICES.includes(stored as Theme) ? (stored as Theme) : 'system'
  } catch {
    return 'system'
  }
}

export function saveTheme(theme: Theme): void {
  try {
    if (theme === 'system') localStorage.removeItem(THEME_KEY)
    else localStorage.setItem(THEME_KEY, theme)
  } catch {
    // not remembered; the page still changes
  }
}

// The browser bar's colour, as the page background (index.html has one meta
// for each device setting; a choice sets both to its own colour).
const BAR = { light: '#f5f2eb', dark: '#131823' } as const

export function applyTheme(theme: Theme): void {
  const root = document.documentElement
  if (theme === 'system') delete root.dataset.theme
  else root.dataset.theme = theme
  for (const meta of document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')) {
    const device = meta.getAttribute('media')?.includes('dark') ? 'dark' : 'light'
    meta.content = BAR[theme === 'system' ? device : theme]
  }
}

// The header's button steps through the three, in this order.
export function nextTheme(theme: Theme): Theme {
  return CHOICES[(CHOICES.indexOf(theme) + 1) % CHOICES.length]
}
