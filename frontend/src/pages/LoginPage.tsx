import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { FlaskConical, GraduationCap, LogIn, ShieldCheck } from 'lucide-react'
import { ApiError, providerLoginUrl } from '../api/client'
import { getProviders } from '../api/campus'
import type { DemoPersona } from '../api/types'
import { useAuth } from '../auth/AuthContext'
import { rememberReturnTo } from '../auth/returnTo'
import { safeNext } from '../logic/next'
import { useApi } from '../hooks/useApi'
import { errorMessage } from '../i18n/errors'
import { Button, ButtonLink, EmptyState, Notice, Photo, Skeleton } from '../ui'
import { EmailSignIn } from './EmailSignIn'
import styles from './pages.module.css'

const PROVIDER_LABELS: Record<string, string> = {
  microsoft: 'התחברות עם מיקרוסופט',
  google: 'התחברות עם גוגל',
}

export function LoginPage() {
  const { status, demoLogin } = useAuth()
  const providers = useApi(getProviders, 'providers')
  const navigate = useNavigate()
  // The page to go back to afterwards; only a path on this site is accepted.
  const [params] = useSearchParams()
  const next = safeNext(params.get('next'))
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<DemoPersona | null>(null)

  if (status === 'signed-in') {
    return (
      <EmptyState icon={<ShieldCheck />} title="כבר התחברת" action={<ButtonLink to={next}>{next === '/' ? 'לחיפוש מקום' : 'להמשיך'}</ButtonLink>} />
    )
  }

  async function signInAsDemo(persona: DemoPersona) {
    setBusy(persona)
    setError(null)
    try {
      await demoLogin(persona)
      navigate(next, { replace: true })
    } catch (reason) {
      setError(errorMessage(reason instanceof ApiError ? reason.code : 'unknown_error'))
    } finally {
      setBusy(null)
    }
  }

  const available = providers.data
  return (
    <div className={styles.login}>
      <Photo name="hero" priority sizes="(max-width: 900px) 100vw, 50vw" className={styles.loginPhoto} />
      <section className={styles.loginCard} aria-labelledby="login-title">
        <h1 id="login-title" className={styles.loginTitle}>
          התחברות
        </h1>
        <p className={styles.loginLead}>
          אפשר לחפש מקומות בלי להתחבר. כדי להזמין מקום או לסרוק קוד, מתחברים עם חשבון המוסד.
        </p>

        {providers.error && <Notice tone="error">{errorMessage(providers.error.code)}</Notice>}
        {providers.loading && !available && (
          <div className={styles.loginButtons} aria-hidden="true">
            <Skeleton height="44px" radius="999px" />
          </div>
        )}

        {available && (
          <div className={styles.loginButtons}>
            {available.providers.map((name) => (
              // A full-page visit, not fetch: the browser goes to the provider and back.
              <a key={name} className={styles.provider} href={providerLoginUrl(name)} onClick={() => rememberReturnTo(next)}>
                <LogIn aria-hidden="true" />
                {PROVIDER_LABELS[name] ?? name}
              </a>
            ))}

            {available.email && <EmailSignIn onSignedIn={() => navigate(next, { replace: true })} />}

            {available.demo && (
              <div className={styles.demoBox}>
                <h2 className={styles.demoTitle}>
                  <FlaskConical aria-hidden="true" /> כניסת הדגמה
                </h2>
                <p className={styles.demoText}>בלי חשבון אמיתי. מתאימה להדגמה ולפיתוח.</p>
                <Button
                  block
                  icon={<GraduationCap aria-hidden="true" />}
                  busy={busy === 'student'}
                  disabled={busy === 'admin'}
                  onClick={() => void signInAsDemo('student')}
                >
                  כניסה כסטודנט לדוגמה
                </Button>
                <Button
                  block
                  variant="secondary"
                  icon={<ShieldCheck aria-hidden="true" />}
                  busy={busy === 'admin'}
                  disabled={busy === 'student'}
                  onClick={() => void signInAsDemo('admin')}
                >
                  כניסה כמנהל מוסד לדוגמה
                </Button>
              </div>
            )}

            {available.providers.length === 0 && !available.demo && !available.email && <Notice>אין כרגע שיטת התחברות פעילה בשרת הזה.</Notice>}
          </div>
        )}

        {error && <Notice tone="error">{error}</Notice>}
        <p className={styles.loginPrivacy}>
          מה נשמר עליך, ואיך מוחקים: <Link to="/privacy">מדיניות הפרטיות</Link>
        </p>
      </section>
    </div>
  )
}
