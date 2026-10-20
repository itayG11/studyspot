// Webhooks, in the "Connections" tab (wave 14.3): an address of the
// institution's that StudySpot calls when a check-in starts or ends, or a
// booking is made or cancelled. Every call is signed; the secret is shown
// once. The log shows each delivery, its tries, and lets the admin send again.

import { Copy, Send, Webhook as WebhookIcon } from 'lucide-react'
import { useState } from 'react'
import {
  addWebhook,
  deleteWebhook,
  getDeliveries,
  getWebhooks,
  newWebhookSecret,
  redeliver,
  testWebhook,
  updateWebhook,
} from '../api/admin'
import type { Webhook, WebhookDelivery, WebhookEvent } from '../api/types'
import { useAction } from '../hooks/useAction'
import { useApi } from '../hooks/useApi'
import { useInstitution } from '../institution'
import { formatDay, formatTime } from '../logic/time'
import { ActionError, Button, ConfirmButton, ErrorState, Notice } from '../ui'
import styles from './admin.module.css'

const EVENT_LABELS: Record<WebhookEvent, string> = {
  'checkin.started': 'כניסה למקום',
  'checkin.ended': 'יציאה ממקום',
  'booking.created': 'הזמנה חדשה',
  'booking.cancelled': 'הזמנה בוטלה',
}
const ALL_EVENTS = Object.keys(EVENT_LABELS) as WebhookEvent[]

const STATUS_LABELS: Record<WebhookDelivery['status'], string> = {
  pending: 'ממתין לניסיון הבא',
  sent: 'נשלח',
  failed: 'נכשל, בלי עוד ניסיונות',
}

export function Webhooks() {
  const { slug } = useInstitution()
  const hooks = useApi(() => getWebhooks(slug), `webhooks-${slug}`)
  const [secret, setSecret] = useState<string | null>(null)
  return (
    <section className={styles.form} aria-labelledby="webhooks-title">
      <h2 id="webhooks-title" className={styles.formTitle}>
        Webhooks
      </h2>
      <p className={styles.screenNote}>
        כתובת של המוסד ש-StudySpot קורא לה כשמשהו קורה: כניסה, יציאה או הזמנה. בלי שמות ובלי מיילים, רק מקום, תפוסה
        ושעות. כל קריאה חתומה, ואם הכתובת לא עונה, מנסים שוב: אחרי דקה, 5 דקות, חצי שעה, שעתיים ו-6 שעות.
      </p>
      <AddWebhook slug={slug} onAdded={(made) => (setSecret(made), hooks.reload())} />
      {secret && <SecretOnce secret={secret} />}
      {hooks.error && !hooks.data && <ErrorState error={hooks.error} onRetry={hooks.reload} compact />}
      {hooks.data && (
        <ul className={styles.rules} aria-label="הכתובות">
          {hooks.data.length === 0 && <li>עדיין אין כתובות.</li>}
          {hooks.data.map((hook) => (
            <WebhookRow key={hook.id} hook={hook} onChange={hooks.reload} onSecret={setSecret} />
          ))}
        </ul>
      )}
    </section>
  )
}

function AddWebhook({ slug, onAdded }: { slug: string; onAdded: (secret: string) => void }) {
  const action = useAction()
  const [url, setUrl] = useState('')
  const [events, setEvents] = useState<WebhookEvent[]>(ALL_EVENTS)
  const toggle = (event: WebhookEvent) =>
    setEvents((now) => (now.includes(event) ? now.filter((e) => e !== event) : [...now, event]))
  return (
    <form
      className={styles.subform}
      onSubmit={(event) => {
        event.preventDefault()
        void action.run(async () => {
          const made = await addWebhook(slug, url.trim(), events)
          setUrl('')
          onAdded(made.secret)
        })
      }}
    >
      <label className={styles.label} htmlFor="webhook-url">
        הכתובת, ב-https
      </label>
      <input
        id="webhook-url"
        className={styles.field}
        type="url"
        dir="ltr"
        placeholder="https://"
        value={url}
        maxLength={500}
        required
        onChange={(event) => setUrl(event.target.value)}
      />
      <fieldset className={styles.events}>
        <legend className={styles.label}>על מה לקרוא</legend>
        {ALL_EVENTS.map((event) => (
          <label key={event}>
            <input type="checkbox" checked={events.includes(event)} onChange={() => toggle(event)} /> {EVENT_LABELS[event]}
          </label>
        ))}
      </fieldset>
      <Button type="submit" icon={<WebhookIcon aria-hidden="true" />} busy={action.busy} disabled={!url.trim() || events.length === 0}>
        להוסיף כתובת
      </Button>
      <ActionError action={action} />
    </form>
  )
}

function SecretOnce({ secret }: { secret: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <div className={styles.screenLink} role="status">
      <p>הסוד לחתימה, מוצג רק עכשיו. בעזרתו השרת של המוסד בודק שהקריאה באמת מ-StudySpot.</p>
      <code className={styles.screenAddress}>{secret}</code>
      <Button
        size="sm"
        variant="secondary"
        icon={<Copy aria-hidden="true" />}
        onClick={() =>
          void navigator.clipboard.writeText(secret).then(
            () => setCopied(true),
            () => setCopied(false),
          )
        }
      >
        {copied ? 'הועתק' : 'להעתיק'}
      </Button>
    </div>
  )
}

function WebhookRow({ hook, onChange, onSecret }: { hook: Webhook; onChange: () => void; onSecret: (s: string) => void }) {
  const action = useAction()
  const [last, setLast] = useState<WebhookDelivery | null>(null)
  const [logKey, setLogKey] = useState(0) // a new key reloads the log after a send
  return (
    <li aria-label={`כתובת: ${hook.url}`} className={styles.hookRow}>
      <div>
        <code dir="ltr">{hook.url}</code>
        {hook.built_in && <span className={styles.doneTag}>מובנה</span>}
        {!hook.active && <span className={styles.pendingTag}>מושבת</span>}
        <br />
        <small>{hook.events.map((e) => EVENT_LABELS[e]).join(', ')}</small>
      </div>
      <div className={styles.signActions}>
        <Button
          size="sm"
          icon={<Send aria-hidden="true" />}
          busy={action.busy}
          onClick={() =>
            void action.run(async () => {
              setLast(await testWebhook(hook.id))
              setLogKey((k) => k + 1)
            })
          }
        >
          לשלוח בדיקה
        </Button>
        {!hook.built_in && (
          <>
            <Button
              size="sm"
              variant="secondary"
              busy={action.busy}
              onClick={() =>
                void action.run(async () => {
                  await updateWebhook(hook.id, { active: !hook.active })
                  onChange()
                })
              }
            >
              {hook.active ? 'להשבית' : 'להפעיל'}
            </Button>
            <ConfirmButton
              size="sm"
              label="סוד חדש"
              confirmLabel="כן, הסוד הישן יפסיק לעבוד"
              busy={action.busy}
              onConfirm={() => void action.run(async () => onSecret((await newWebhookSecret(hook.id)).secret))}
            />
            <ConfirmButton
              size="sm"
              label="למחוק"
              confirmLabel="כן, למחוק עם היומן"
              busy={action.busy}
              onConfirm={() =>
                void action.run(async () => {
                  await deleteWebhook(hook.id)
                  onChange()
                })
              }
            />
          </>
        )}
      </div>
      {last && (
        <Notice tone={last.status === 'sent' ? 'success' : 'warning'}>
          {last.status === 'sent'
            ? `הבדיקה הגיעה: הכתובת ענתה ${last.last_status_code}.`
            : `הבדיקה לא הגיעה (${last.last_error ?? last.last_status_code}). ננסה שוב לבד.`}
        </Notice>
      )}
      <ActionError action={action} />
      <DeliveryLog key={logKey} hookId={hook.id} />
    </li>
  )
}

function DeliveryLog({ hookId }: { hookId: number }) {
  const [open, setOpen] = useState(false)
  return (
    <details onToggle={(event) => setOpen((event.target as HTMLDetailsElement).open)}>
      <summary>יומן משלוחים</summary>
      {open && <DeliveryList hookId={hookId} />}
    </details>
  )
}

function DeliveryList({ hookId }: { hookId: number }) {
  const { timezone } = useInstitution()
  const log = useApi(() => getDeliveries(hookId), `deliveries-${hookId}`)
  const action = useAction()
  if (log.error && !log.data) return <ErrorState error={log.error} onRetry={log.reload} compact />
  if (!log.data) return <p>טוען…</p>
  if (log.data.length === 0) return <p>עוד לא נשלח כלום.</p>
  const when = (iso: string) => `${formatDay(iso, timezone)} ${formatTime(iso, timezone)}`
  return (
    <>
      <table className={styles.log}>
        <thead>
          <tr>
            <th scope="col">מתי</th>
            <th scope="col">מה</th>
            <th scope="col">מצב</th>
            <th scope="col">ניסיונות</th>
            <th scope="col">תשובה</th>
            <th scope="col">
              <span className="visually-hidden">פעולה</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {log.data.map((d) => (
            <tr key={d.id}>
              <td>{when(d.created_at)}</td>
              <td>{EVENT_LABELS[d.event_type as WebhookEvent] ?? 'בדיקה'}</td>
              <td>
                {STATUS_LABELS[d.status]}
                {d.next_attempt_at && ` (${formatTime(d.next_attempt_at, timezone)})`}
              </td>
              <td>{d.attempts}</td>
              <td dir="ltr">{d.last_error ?? d.last_status_code ?? ''}</td>
              <td>
                {d.status !== 'sent' && (
                  <Button
                    size="sm"
                    variant="secondary"
                    busy={action.busy}
                    onClick={() =>
                      void action.run(async () => {
                        await redeliver(d.id)
                        log.reload()
                      })
                    }
                  >
                    לשלוח שוב
                  </Button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <ActionError action={action} />
    </>
  )
}
