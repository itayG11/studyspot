// "This site uses only the cookies needed to sign in": a small note at the
// bottom, once per device. A region, not a dialog: it does not take the
// focus or block the page, and the page works the same without an answer.
//
// While it shows, its height is --cookie-note-h on the page: the page keeps
// that much room at the bottom (so the footer is reachable), and the phone's
// booking bar stands above the note instead of behind it.

import { Cookie } from 'lucide-react'
import { useId, useLayoutEffect, useRef, useState } from 'react'
import { Link } from 'react-router'
import { cookieNoteSeen, markCookieNoteSeen } from '../logic/cookieNote'
import { Button } from '../ui'
import styles from './CookieNote.module.css'

export function CookieNote() {
  const [open, setOpen] = useState(() => !cookieNoteSeen())
  const titleId = useId()
  const note = useRef<HTMLElement>(null)
  useLayoutEffect(() => {
    const element = note.current
    if (!open || !element) return
    const root = document.documentElement
    const measure = () => root.style.setProperty('--cookie-note-h', `${element.offsetHeight + 16}px`) // and its gap from the edge
    measure()
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure)
    observer?.observe(element)
    return () => {
      observer?.disconnect()
      root.style.removeProperty('--cookie-note-h')
    }
  }, [open])
  if (!open) return null
  return (
    <section ref={note} className={styles.note} aria-labelledby={titleId}>
      <h2 id={titleId} className={styles.title}>
        <Cookie aria-hidden="true" /> עוגיות באתר
      </h2>
      <p className={styles.text}>
        האתר משתמש רק בשלוש עוגיות שנחוצות להתחברות. אין עוגיות של פרסום, מעקב או סטטיסטיקה. הפרטים ב
        <Link to="/privacy">מדיניות הפרטיות</Link>.
      </p>
      <Button
        size="sm"
        onClick={() => {
          markCookieNoteSeen()
          setOpen(false)
        }}
      >
        הבנתי
      </Button>
    </section>
  )
}
