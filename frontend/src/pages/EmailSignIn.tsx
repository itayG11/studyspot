// Sign-in with a one-time code by email, in two steps: the college address,
// then the 6-digit code the server emailed to it.
//
// A college mailbox can hold an email for minutes while it scans it (it
// happened with Braude's). So the page says so, any code still in time
// works (app/email_codes.py), and a new code is offered only after a minute.

import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { KeyRound, Mail } from 'lucide-react'
import { ApiError } from '../api/client'
import { useAuth } from '../auth/AuthContext'
import { errorMessage } from '../i18n/errors'
import { passwordReady } from '../logic/passwordRules'
import { Button, Notice } from '../ui'
import { NewPasswordField } from './NewPasswordField'
import styles from './pages.module.css'

// Digits only: a code pasted as "123 456" or with a dash still works.
function codeDigits(raw: string): string {
  return raw.replace(/[^0-9]/g, '').slice(0, 6)
}

const RESEND_AFTER_S = 60

// Seconds left until a new code may be asked for; 0 once it may.
function useCountdown(from: number | null): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (from === null) return
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [from])
  if (from === null) return 0
  // Until the first tick, now may be from before the code was sent.
  const elapsed = Math.max(0, now - from)
  return Math.max(0, RESEND_AFTER_S - Math.floor(elapsed / 1000))
}

interface Props {
  onSignedIn: () => void
  // 'set-password': after the code, a new password too. The same step signs
  // up, changes and resets it (the server's POST /auth/password/set).
  purpose?: 'sign-in' | 'set-password'
  // The account's own address (my area): no address field to fill.
  fixedEmail?: string
  title?: string
  // What this way is for, above the address (only when setting a password).
  intro?: string
  // Opened by a button that is now gone ("forgot it"): focus comes here.
  focusTitle?: boolean
}

export function EmailSignIn({ onSignedIn, purpose = 'sign-in', fixedEmail, title, intro, focusTitle = false }: Props) {
  const { emailStart, emailVerify, passwordSet } = useAuth()
  const setting = purpose === 'set-password'
  const [step, setStep] = useState<'email' | 'code'>('email')
  const [email, setEmail] = useState(fixedEmail ?? '')
  const [code, setCode] = useState('')
  const [password, setPassword] = useState('')
  // Which action is on its way: only its own button shows the spinner.
  const [busy, setBusy] = useState<'send' | 'verify' | null>(null)
  const [error, setError] = useState<string | null>(null)
  // Read out by screen readers; always in the page, so every change is heard.
  const [status, setStatus] = useState('')
  const [changedAddress, setChangedAddress] = useState(false)
  const [minutes, setMinutes] = useState(10)
  const [sentAt, setSentAt] = useState<number | null>(null)
  const wait = useCountdown(sentAt)
  const id = useId()
  const titleRef = useRef<HTMLHeadingElement>(null)
  useEffect(() => {
    if (focusTitle) titleRef.current?.focus() // once, when it opens
  }, [focusTitle])

  async function run(action: 'send' | 'verify', work: () => Promise<void>) {
    setBusy(action)
    setError(null)
    try {
      await work()
    } catch (reason) {
      setError(errorMessage(reason instanceof ApiError ? reason.code : 'unknown_error'))
    } finally {
      setBusy(null)
    }
  }

  function sendCode(event?: FormEvent) {
    event?.preventDefault()
    const again = step === 'code'
    void run('send', async () => {
      const lifetime = await emailStart(email.trim())
      setMinutes(Math.round(lifetime / 60))
      setSentAt(Date.now())
      setStatus(again ? `שלחנו קוד חדש. השעה: ${new Date().toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })}` : 'שלחנו קוד')
      setStep('code')
      setCode('')
    })
  }

  function checkCode(event: FormEvent) {
    event.preventDefault()
    void run('verify', async () => {
      if (setting) await passwordSet(email.trim(), code, password)
      else await emailVerify(email.trim(), code)
      onSignedIn()
    })
  }

  return (
    <div className={styles.emailBox}>
      <h2 className={styles.demoTitle} tabIndex={-1} ref={titleRef}>
        {setting ? <KeyRound aria-hidden="true" /> : <Mail aria-hidden="true" />} {title ?? (setting ? 'סיסמה חדשה' : 'כניסה בקוד למייל')}
      </h2>
      {setting && step === 'email' && (
        <p className={styles.demoText}>{intro ?? 'קודם שולחים קוד למייל, כדי לוודא שהכתובת שלך. אחר כך בוחרים סיסמה.'}</p>
      )}

      {step === 'email' && fixedEmail !== undefined ? (
        <form className={styles.emailForm} onSubmit={sendCode}>
          <p className={styles.demoText}>
            הקוד יישלח אל <bdi dir="ltr">{fixedEmail}</bdi>.
          </p>
          <Button type="submit" block busy={busy === 'send'}>
            שליחת קוד
          </Button>
        </form>
      ) : step === 'email' ? (
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
            // Back from the code step: the field to fix is ready to type in.
            autoFocus={changedAddress}
          />
          <Button type="submit" block busy={busy === 'send'}>
            שליחת קוד
          </Button>
        </form>
      ) : (
        <form className={styles.emailForm} onSubmit={checkCode}>
          <p className={styles.demoText}>
            שלחנו קוד בן 6 ספרות אל <bdi dir="ltr">{email.trim().toLowerCase()}</bdi>. הקוד תקף ל-{minutes} דקות.
          </p>
          <p className={styles.demoText}>
            לתיבה של המכללה המייל יכול להגיע אחרי עד כמה דקות. אם ביקשת קוד חדש, גם קוד קודם עובד, כל עוד הוא בתוקף.
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
            קוד בן 6 ספרות. לא הגיע? כדאי לבדוק גם בתיקיית הספאם.
          </span>
          {setting && <NewPasswordField value={password} onChange={setPassword} />}
          <Button
            type="submit"
            block
            busy={busy === 'verify'}
            disabled={code.length !== 6 || busy === 'send' || (setting && !passwordReady(password))}
          >
            {setting ? 'שמירת הסיסמה' : 'כניסה'}
          </Button>
          {setting && <span className={styles.fieldHint}>שמירת סיסמה חדשה מנתקת את החשבון מכל שאר המכשירים.</span>}
          <div className={styles.emailActions}>
            <Button variant="ghost" size="sm" busy={busy === 'send'} disabled={busy === 'verify' || wait > 0} onClick={() => sendCode()}>
              {wait > 0 ? `שליחת קוד חדש בעוד ${wait} שניות` : 'שליחת קוד חדש'}
            </Button>
            {fixedEmail === undefined && <Button
              variant="ghost"
              size="sm"
              disabled={busy !== null}
              onClick={() => {
                setChangedAddress(true)
                setStep('email')
                setError(null)
                setStatus('')
              }}
            >
              שינוי כתובת
            </Button>}
          </div>
        </form>
      )}

      <p className="visually-hidden" role="status">
        {status}
      </p>
      {error && <Notice tone="error">{error}</Notice>}
    </div>
  )
}
