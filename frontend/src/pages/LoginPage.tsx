import { useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { ApiError, providerLoginUrl } from '../api/client'
import { getProviders } from '../api/campus'
import type { DemoPersona } from '../api/types'
import { useAuth } from '../auth/AuthContext'
import { useApi } from '../hooks/useApi'
import { errorMessage } from '../i18n/errors'
import styles from './pages.module.css'

const PROVIDER_LABELS: Record<string, string> = {
  microsoft: 'התחברות עם מיקרוסופט',
  google: 'התחברות עם גוגל',
}

export function LoginPage() {
  const { status, demoLogin } = useAuth()
  const providers = useApi(getProviders, 'providers')
  const navigate = useNavigate()
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  if (status === 'signed-in') {
    return (
      <section className="panel narrow">
        <h1>כבר התחברת</h1>
        <Link to="/">למפת הקמפוס</Link>
      </section>
    )
  }

  async function signInAsDemo(persona: DemoPersona) {
    setBusy(true)
    setError(null)
    try {
      await demoLogin(persona)
      navigate('/')
    } catch (reason) {
      setError(errorMessage(reason instanceof ApiError ? reason.code : 'unknown_error'))
    } finally {
      setBusy(false)
    }
  }

  const available = providers.data
  return (
    <section className="panel narrow rise">
      <h1>התחברות</h1>
      <p>אפשר לצפות במפה ובמקומות בלי להתחבר. כדי להזמין מקום או לסרוק קוד, צריך להתחבר עם חשבון המוסד.</p>

      {providers.error && <p role="alert" className="error">{errorMessage(providers.error.code)}</p>}

      {available && (
        <div className="stack">
          {available.providers.map((name) => (
            // A full-page visit, not fetch: the browser goes to the provider and back.
            <a key={name} className="button" href={providerLoginUrl(name)}>
              {PROVIDER_LABELS[name] ?? name}
            </a>
          ))}

          {available.demo && (
            <div className={styles.demoBox}>
              <h2>כניסת הדגמה</h2>
              <p>בלי חשבון אמיתי. מתאימה להדגמה ולפיתוח.</p>
              <button type="button" className="button" disabled={busy} onClick={() => void signInAsDemo('student')}>
                כניסה כסטודנט לדוגמה
              </button>
              <button type="button" className="button button-secondary" disabled={busy} onClick={() => void signInAsDemo('admin')}>
                כניסה כמנהל מוסד לדוגמה
              </button>
            </div>
          )}

          {available.providers.length === 0 && !available.demo && <p>אין כרגע שיטת התחברות פעילה בשרת הזה.</p>}
        </div>
      )}

      {error && <p role="alert" className="error">{error}</p>}
    </section>
  )
}
