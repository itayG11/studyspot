// Sign-in with an address and a password. A password is set only after an
// emailed code (EmailSignIn, purpose "set-password"), so "forgot it" and
// "don't have one yet" are the same way in.

import { KeyRound } from 'lucide-react'
import { useId, useState, type FormEvent } from 'react'
import { ApiError } from '../api/client'
import { useAuth } from '../auth/AuthContext'
import { errorMessage } from '../i18n/errors'
import { Button, Notice } from '../ui'
import styles from './pages.module.css'

interface Props {
  onSignedIn: () => void
  onForgot: () => void
}

export function PasswordSignIn({ onSignedIn, onForgot }: Props) {
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
          <Button variant="ghost" size="sm" disabled={busy} onClick={onForgot}>
            שכחתי סיסמה, או שעוד אין לי
          </Button>
        </div>
      </form>
      {error && <Notice tone="error">{error}</Notice>}
    </div>
  )
}
