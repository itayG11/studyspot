// Light or dark: one switch in the header of every page. It always shows
// the theme on screen, which starts as the device's own setting; a press
// shows the other one and remembers it on this device (src/logic/theme.ts).

import { Moon, Sun } from 'lucide-react'
import { useEffect, useState } from 'react'
import { applyTheme, flipTheme, readTheme, saveTheme, shownDark, type Theme } from '../logic/theme'
import styles from './Layout.module.css'

const DARK_QUERY = '(prefers-color-scheme: dark)'

// Older or test browsers may not report the device's setting: then light.
function deviceQuery(): MediaQueryList | null {
  return typeof window.matchMedia === 'function' ? window.matchMedia(DARK_QUERY) : null
}

export function ThemeSwitch() {
  const [theme, setTheme] = useState<Theme>(readTheme)
  const [deviceDark, setDeviceDark] = useState(() => deviceQuery()?.matches ?? false)

  // The device can change while the page is open (dark mode at sunset).
  useEffect(() => {
    const query = deviceQuery()
    if (!query) return
    const update = () => setDeviceDark(query.matches)
    // Safari before 14 has only the older addListener.
    if (typeof query.addEventListener !== 'function') {
      query.addListener(update)
      return () => query.removeListener(update)
    }
    query.addEventListener('change', update)
    return () => query.removeEventListener('change', update)
  }, [])

  const dark = shownDark(theme, deviceDark)
  return (
    <button
      type="button"
      role="switch"
      aria-checked={dark}
      aria-label="מצב כהה"
      title={dark ? 'מעבר למצב בהיר' : 'מעבר למצב כהה'}
      className={styles.themeSwitch}
      onClick={() => {
        const next = flipTheme(theme, deviceDark)
        applyTheme(next)
        saveTheme(next)
        setTheme(next)
      }}
    >
      <Sun className={styles.themeSun} aria-hidden="true" />
      <Moon className={styles.themeMoon} aria-hidden="true" />
      <span className={styles.themeThumb} aria-hidden="true" />
    </button>
  )
}
