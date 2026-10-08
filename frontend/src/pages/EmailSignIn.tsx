// Sign-in with a one-time code by email, in two steps: the college address,
// then the 6-digit code the server emailed to it.

import { useId, useState, type FormEvent } from 'react'
import { Mail } from 'lucide-react'
import { ApiError } from '../api/client'
import { useAuth } from '../auth/AuthContext'
import { errorMessage } from '../i18n/errors'
import { Button, Notice } from '../ui'
import styles from './pages.module.css'

// Digits only: a code pasted as "123 456" or with a dash still works.
function codeDigits(raw: string): string {
  return raw.replace(/[^0-9]/g, '').slice(0, 6)
}

export function EmailSignIn({ onSignedIn }: { onSignedIn: () => void }) {
  const { emailStart, emailVerify } = useAuth()
  const [step, setStep] = useState<'email' | 'code'>('email')
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [resent, setResent] = useState(false)
  const id = useId()

  async function run(action: () => Promise<void>) {
    setBusy(true)
    setError(null)
    try {
      await action()
    } catch (reason) {
      setError(errorMessage(reason instanceof ApiError ? reason.code : 'unknown_error'))
    } finally {
      setBusy(false)
    }
  }

  function sendCode(event?: FormEvent) {
    event?.preventDefault()
    void run(async () => {
      await emailStart(email.trim())
      setResent(step === 'code')
      setStep('code')
      setCode('')
    })
  }

  function checkCode(event: FormEvent) {
    event.preventDefault()
    void run(async () => {
      await emailVerify(email.trim(), code)
      onSignedIn()
    })
  }

  return (
    <div className={styles.emailBox}>
      <h2 className={styles.demoTitle}>
        <Mail aria-hidden="true" /> כניסה בקוד למייל
      </h2>

      {step === 'email' ? (
        <form className={styles.emailForm} onSubmit={sendCode}>
          <label htmlFor={`${id}-email`} className={styles.fieldLabel}>
            כתובת המייל של המכללה
          </label>
          <input
            id={`${id}-email`}
            className={styles.field}
            type="email"
            inputMode="email"
            autoComplete="email"
            dir="ltr"
            required
            maxLength={254}
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
          <Button type="submit" block busy={busy}>
            שליחת קוד
          </Button>
        </form>
      ) : (
        <form className={styles.emailForm} onSubmit={checkCode}>
          <p className={styles.demoText} aria-live="polite">
            {resent ? 'שלחנו קוד חדש אל' : 'שלחנו קוד בן 6 ספרות אל'}{' '}
            <bdi dir="ltr">{email.trim().toLowerCase()}</bdi>. הקוד תקף ל-10 דקות.
          </p>
          <label htmlFor={`${id}-code`} className={styles.fieldLabel}>
            הקוד מהמייל
          </label>
          <input
            id={`${id}-code`}
            className={`${styles.field} ${styles.codeField}`}
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            dir="ltr"
            required
            pattern="[0-9]{6}"
            maxLength={6}
            aria-describedby={`${id}-code-hint`}
            value={code}
            onChange={(event) => setCode(codeDigits(event.target.value))}
            autoFocus
          />
          <span id={`${id}-code-hint`} className={styles.fieldHint}>
            6 ספרות. לא הגיע? כדאי לבדוק גם בתיקיית הספאם.
          </span>
          <Button type="submit" block busy={busy} disabled={code.length !== 6}>
            כניסה
          </Button>
          <div className={styles.emailActions}>
            <Button variant="ghost" size="sm" disabled={busy} onClick={() => sendCode()}>
              שליחת קוד חדש
            </Button>
            <Button
              variant="ghost"
              size="sm"
              disabled={busy}
              onClick={() => {
                setStep('email')
                setError(null)
                setResent(false)
              }}
            >
              שינוי כתובת
            </Button>
          </div>
        </form>
      )}

      {error && <Notice tone="error">{error}</Notice>}
    </div>
  )
}
