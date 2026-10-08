// Light, dark, or like the device: one small button in the header that
// steps through the three. Its label says what is on now and what a press
// does, since an icon alone says nothing to a screen reader.

import { Monitor, Moon, Sun } from 'lucide-react'
import { useState } from 'react'
import { applyTheme, nextTheme, readTheme, saveTheme, type Theme } from '../logic/theme'
import styles from './Layout.module.css'

const NAMES: Record<Theme, string> = { system: 'כמו המכשיר', light: 'בהיר', dark: 'כהה' }
const ICONS = { system: Monitor, light: Sun, dark: Moon }

export function ThemeButton() {
  const [theme, setTheme] = useState<Theme>(readTheme)
  const next = nextTheme(theme)
  const Icon = ICONS[theme]
  return (
    <button
      type="button"
      className={styles.themeButton}
      aria-label={`ערכת צבעים: ${NAMES[theme]}. לחיצה: ${NAMES[next]}`}
      title={`ערכת צבעים: ${NAMES[theme]}`}
      onClick={() => {
        applyTheme(next)
        saveTheme(next)
        setTheme(next)
      }}
    >
      <Icon aria-hidden="true" />
    </button>
  )
}
