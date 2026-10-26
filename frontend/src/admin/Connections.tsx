// The "Connections" tab (wave 14): the widget for the institution's own
// site, open to every admin; then, folded under "for the institution's IT",
// the API keys (its own systems read places and live occupancy, backend
// app/api/v1.py) and the webhooks. A new key is shown once, like the
// screen's link: the server keeps only an HMAC.

import { Copy, KeyRound } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'
import { getApiKeys, makeApiKey, revokeApiKey } from '../api/admin'
import type { ApiKey } from '../api/types'
import { useAction } from '../hooks/useAction'
import { useApi } from '../hooks/useApi'
import { useInstitution, useLiveSimulated } from '../institution'
import { apiAddress } from '../logic/apiUrl'
import { formatDay, formatTime } from '../logic/time'
import { ActionError, Button, ConfirmButton, ErrorState, Notice, PageLoading } from '../ui'
import styles from './admin.module.css'
import { EmbedCode } from './EmbedCode'
import { Webhooks } from './Webhooks'
import { WebhookTester } from './WebhookTester'

export function Connections() {
  const { slug } = useInstitution()
  const keys = useApi(() => getApiKeys(slug), `api-keys-${slug}`)
  const demo = useLiveSimulated() // the demo campus: its tester, and no addresses of its own
  return (
    <div className={styles.connections}>
      <p className={styles.lead}>
        איך להראות את המקומות של המוסד גם מחוץ ל-StudySpot. הווידג'ט, למטה, מתאים לכל מנהל. מה שמתחתיו מיועד לאנשי
        המחשוב של המוסד.
      </p>
      <EmbedCode />
      {/* Closed by default: most admins need only the widget. */}
      <details className={styles.forIt}>
        <summary className={styles.forItSummary}>לאנשי המחשוב של המוסד: מפתחות API ו-webhooks</summary>
        <p className={styles.screenNote}>
          מפתח API נותן למערכת של המוסד לקרוא את התפוסה. Webhook שולח למערכת של המוסד הודעה בכל כניסה והזמנה, למשל כדי
          שמסך בלובי יתעדכן מיד. אין צורך באף אחד מהם כדי להשתמש ב-StudySpot.
        </p>
        <ApiKeys slug={slug} keys={keys.data} onChange={keys.reload} />
        {keys.error && !keys.data && <ErrorState error={keys.error} onRetry={keys.reload} compact />}
        {!keys.data && !keys.error && <PageLoading />}
        {demo && <WebhookTester />}
        <Webhooks demo={demo} />
      </details>
    </div>
  )
}

function ApiKeys({ slug, keys, onChange }: { slug: string; keys: ApiKey[] | null; onChange: () => void }) {
  const action = useAction()
  const [name, setName] = useState('')
  const [made, setMade] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const make = () =>
    void action.run(async () => {
      const created = await makeApiKey(slug, name)
      setMade(created.key)
      setCopied(false)
      setName('')
      onChange()
    })
  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
    } catch {
      setCopied(false) // blocked: the key is on the screen to copy by hand
    }
  }

  const active = keys?.filter((k) => !k.revoked_at) ?? []
  const revoked = keys?.filter((k) => k.revoked_at) ?? []
  return (
    <section className={styles.form} aria-labelledby="api-keys-title">
      <h2 id="api-keys-title" className={styles.formTitle}>
        מפתחות API
      </h2>
      <p className={styles.screenNote}>
        מפתח מאפשר למערכות של המוסד לקרוא את הבניינים, המקומות והתפוסה החיה, בלי שם ובלי מייל של אף אחד.{' '}
        <Link to="/developers">איך משתמשים, למפתחים</Link>
      </p>
      <p className={styles.screenNote}>
        מפתח אחד לכל מערכת של המוסד, לא לכל מסך: השרת של המוסד מחזיק את המפתח, ומחלק את המספרים לכל המסכים שלו. כך גם
        30 מסכים הם מפתח אחד, ואם הוא דולף מבטלים רק אותו. למסכים בלי שרת משלהם, הווידג'ט שלמעלה עובד בלי מפתח בכלל.
      </p>
      <form
        className={styles.subform}
        onSubmit={(event) => {
          event.preventDefault()
          make()
        }}
      >
        <label className={styles.label} htmlFor="api-key-name">
          למה המפתח? למשל "אתר המוסד" או "המסכים בלובי"
        </label>
        <input
          id="api-key-name"
          className={styles.field}
          value={name}
          maxLength={60}
          required
          onChange={(event) => setName(event.target.value)}
        />
        <Button type="submit" icon={<KeyRound aria-hidden="true" />} busy={action.busy} disabled={!name.trim()}>
          ליצור מפתח
        </Button>
      </form>
      <ActionError action={action} />
      {made && (
        <div className={styles.screenLink} role="status">
          <p>המפתח מוכן. הוא מוצג רק עכשיו: מעתיקים ושומרים במקום בטוח.</p>
          <code className={`${styles.screenAddress} ${styles.selectAll}`}>{made}</code>
          <Button size="sm" variant="secondary" icon={<Copy aria-hidden="true" />} onClick={() => void copy(made)}>
            {copied ? 'הועתק' : 'להעתיק'}
          </Button>
          <p className={styles.screenNote}>אם ההדבקה יוצאת ריקה: לחיצה על המפתח מסמנת את כולו, ואז Ctrl+C.</p>
          <code className={styles.screenAddress}>{`curl -H "Authorization: Bearer ${made}" ${apiAddress()}/v1/places`}</code>
        </div>
      )}
      {keys && (
        <ul className={styles.rules} aria-label="המפתחות">
          {active.length === 0 && <li>עדיין אין מפתחות.</li>}
          {active.map((key) => (
            <KeyRow key={key.id} slug={slug} apiKey={key} onChange={onChange} />
          ))}
        </ul>
      )}
      {revoked.length > 0 && (
        <details>
          <summary>מפתחות שבוטלו ({revoked.length})</summary>
          <ul className={styles.rules}>
            {revoked.map((key) => (
              <KeyRow key={key.id} slug={slug} apiKey={key} onChange={onChange} />
            ))}
          </ul>
        </details>
      )}
    </section>
  )
}

function KeyRow({ slug, apiKey, onChange }: { slug: string; apiKey: ApiKey; onChange: () => void }) {
  const { timezone } = useInstitution()
  const action = useAction()
  const when = (iso: string) => `${formatDay(iso, timezone)} ${formatTime(iso, timezone)}`
  return (
    <li aria-label={`מפתח: ${apiKey.name}`} className={styles.mentionedRow}>
      <span>
        <strong>{apiKey.name}</strong> <code dir="ltr">{apiKey.prefix}…</code>
        <br />
        <small>
          {apiKey.revoked_at
            ? `בוטל ב${when(apiKey.revoked_at)}`
            : apiKey.last_used_at
              ? `בשימוש לאחרונה: ${when(apiKey.last_used_at)}`
              : 'עוד לא היה בשימוש'}
        </small>
      </span>
      {!apiKey.revoked_at && (
        <ConfirmButton
          size="sm"
          label="לבטל"
          confirmLabel="כן, לבטל את המפתח"
          busy={action.busy}
          onConfirm={() =>
            void action.run(async () => {
              await revokeApiKey(slug, apiKey.id)
              onChange()
            })
          }
        />
      )}
      {action.error && <Notice tone="error">{action.error}</Notice>}
    </li>
  )
}
