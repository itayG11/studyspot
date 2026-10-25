// Sign-in with an address and a password. A password is set only after an
// emailed code (EmailSignIn, purpose "set-password"). "No password yet" and
// "forgot it" are two buttons with their own words, and the same step on
// the server: it never says whether an address already has a password, so
// no one learns who has an account.

import { KeyRound } from 'lucide-react'
import { useId, useState, type FormEvent } from 'react'
import { ApiError } from '../api/client'
import { useAuth } from '../auth/AuthContext'
import { errorMessage } from '../i18n/errors'
import { Button, Notice } from '../ui'
import styles from './pages.module.css'

interface Props {
  onSignedIn: () => void
  onNew: () => void // no password yet
  onForgot: () => void
}

// From app/passwords.py (MAX_FAILURES, LOCK_FOR), said to the student.
const LOCK_AFTER = 10
const LOCK_MINUTES = 15

export function PasswordSignIn({ onSignedIn, onNew, onForgot }: Props) {
  const { passwordLogin } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const id = useId()

  async function submit(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await passwordLogin(email.trim(), password)
      onSignedIn()
    } catch (reason) {
      setError(errorMessage(reason instanceof ApiError ? reason.code : 'unknown_error'))
      setBusy(false)
    }
  }

  return (
    <div className={styles.emailBox}>
      <h2 className={styles.demoTitle}>
        <KeyRound aria-hidden="true" /> כניסה בסיסמה
      </h2>
      <form className={styles.emailForm} onSubmit={(event) => void submit(event)}>
        <label htmlFor={`${id}-email`} className={styles.fieldLabel}>
          כתובת המייל של המכללה
        </label>
        <input
          id={`${id}-email`}
          className={styles.field}
          type="email"
          inputMode="email"
          autoComplete="username"
          dir="ltr"
          required
          maxLength={254}
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
        <label htmlFor={`${id}-password`} className={styles.fieldLabel}>
          סיסמה
        </label>
        <input
          id={`${id}-password`}
          className={styles.field}
          type="password"
          autoComplete="current-password"
          dir="ltr"
          required
          maxLength={128}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
        <Button type="submit" block busy={busy}>
          כניסה
        </Button>
        <div className={styles.emailActions}>
          <Button variant="secondary" size="sm" disabled={busy} onClick={onNew}>
            אין לי עדיין סיסמה
          </Button>
          <Button variant="secondary" size="sm" disabled={busy} onClick={onForgot}>
            שכחתי סיסמה
          </Button>
        </div>
      </form>
      {error && <Notice tone="error">{error}</Notice>}
      <p className={styles.fieldHint}>
        הסיסמה נשמרת אצלנו רק כגיבוב, בשיטת <span dir="ltr">argon2id</span>, ולא כטקסט. אחרי {LOCK_AFTER} ניסיונות שגויים ברצף
        היא ננעלת ל-{LOCK_MINUTES} דקות. גם אז, ותמיד, אפשר להיכנס בקוד למייל.
      </p>
    </div>
  )
}
