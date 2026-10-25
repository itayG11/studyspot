// "This site uses only the cookies needed to sign in": a small note at the
// bottom, once per device. A region, not a dialog: it does not take the
// focus or block the page, and the page works the same without an answer.

import { Cookie } from 'lucide-react'
import { useId, useState } from 'react'
import { Link } from 'react-router'
import { cookieNoteSeen, markCookieNoteSeen } from '../logic/cookieNote'
import { Button } from '../ui'
import styles from './CookieNote.module.css'

export function CookieNote() {
  const [open, setOpen] = useState(() => !cookieNoteSeen())
  const titleId = useId()
  if (!open) return null
  return (
    <section className={styles.note} aria-labelledby={titleId}>
      <h2 id={titleId} className={styles.title}>
        <Cookie aria-hidden="true" /> עוגיות באתר
      </h2>
      <p className={styles.text}>
        האתר משתמש רק בשתי עוגיות שנחוצות להתחברות. אין עוגיות של פרסום, מעקב או סטטיסטיקה. הפרטים ב
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
