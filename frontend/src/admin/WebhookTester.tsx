// The demo campus's webhook tester (wave 14.5): a receiver on StudySpot's own
// site. "Send a sample" makes a real delivery over HTTP, signed as any
// institution's would be; it shows up here a moment later, with whether its
// signature checks out. "Play broken" makes the receiver answer 503, so the
// built-in address's delivery log below shows a try again.

import { Send } from 'lucide-react'
import { getTester, sendTesterSample, setTesterFailing } from '../api/admin'
import { useAction } from '../hooks/useAction'
import { useApi } from '../hooks/useApi'
import { useInstitution } from '../institution'
import { formatTime } from '../logic/time'
import { ActionError, Button, ErrorState, Segmented } from '../ui'
import styles from './admin.module.css'

const POLL_MS = 3_000

const VERIFY = `import hashlib, hmac, time

def verify(secret, header, body, tolerance=300):
    parts = dict(p.split("=", 1) for p in header.split(",") if "=" in p)
    t = int(parts.get("t", "0"))
    if abs(time.time() - t) > tolerance:
        return False  # replayed later
    expected = hmac.new(secret.encode(), f"{t}.".encode() + body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(parts.get("v1", ""), expected)`

export function WebhookTester() {
  const { slug, timezone } = useInstitution()
  const tester = useApi(() => getTester(slug), `webhook-tester-${slug}`, POLL_MS)
  const action = useAction()
  if (tester.error && !tester.data) return <ErrorState error={tester.error} onRetry={tester.reload} compact />
  const data = tester.data
  return (
    <section className={styles.form} aria-labelledby="tester-title">
      <h2 id="tester-title" className={styles.formTitle}>
        בודק webhooks
      </h2>
      <p className={styles.screenNote}>
        בקמפוס ההדגמה יש כתובת מובנית שמקבלת את ה-webhooks, כאן באתר. כל משלוח עובר ב-HTTP אמיתי, חתום, ונבדק כאן כמו
        ששרת של מוסד היה בודק. גם כניסה אמיתית שלך לקמפוס ההדגמה תגיע לכאן.
      </p>
      <div className={styles.signActions}>
        <Button
          icon={<Send aria-hidden="true" />}
          busy={action.busy}
          onClick={() =>
            void action.run(async () => {
              await sendTesterSample(slug)
              tester.reload()
            })
          }
        >
          לשלוח אירוע לדוגמה
        </Button>
        {data && (
          <Segmented
            label="הבודק"
            options={[
              { value: 'ok', label: 'עונה 200' },
              { value: 'broken', label: 'נכשל, 503' },
            ]}
            value={data.failing ? 'broken' : 'ok'}
            onChange={(value) =>
              void action.run(async () => {
                await setTesterFailing(slug, value === 'broken')
                tester.reload()
              })
            }
          />
        )}
      </div>
      <ActionError action={action} />
      {data && data.failing && (
        <p className={styles.screenNote}>
          הבודק עונה עכשיו 503. משלוח יופיע ביומן כ"ממתין לניסיון הבא", והמערכת תנסה שוב בעוד דקה. אפשר גם להחזיר ל-200
          וללחוץ "לשלוח שוב" ביומן.
        </p>
      )}
      {data && (
        <ul className={styles.rules} aria-label="מה התקבל">
          {data.hits.length === 0 && <li>עוד לא התקבל כלום.</li>}
          {data.hits.map((hit) => (
            <li key={hit.id} className={styles.hookRow} aria-label={`התקבל: ${hit.event_type ?? 'לא ידוע'}`}>
              <div>
                <strong dir="ltr">{hit.event_type ?? '?'}</strong>{' '}
                <span className={hit.signature_ok ? styles.doneTag : styles.pendingTag}>
                  {hit.signature_ok ? 'החתימה תקינה ✓' : 'החתימה שגויה'}
                </span>{' '}
                <small>
                  {formatTime(hit.received_at, timezone)} · ענה {hit.answered}
                </small>
              </div>
              <details>
                <summary>הכותרות והתוכן</summary>
                <pre className={styles.screenAddress}>
                  {Object.entries(hit.headers)
                    .map(([name, value]) => `${name}: ${value}`)
                    .join('\n')}
                </pre>
                <pre className={styles.screenAddress}>{hit.body}</pre>
              </details>
            </li>
          ))}
        </ul>
      )}
      <details>
        <summary>איך שרת של מוסד בודק את החתימה, בפייתון</summary>
        <pre className={styles.screenAddress}>{VERIFY}</pre>
      </details>
    </section>
  )
}
