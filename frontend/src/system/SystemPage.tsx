// The system admin's page: every institution, a new one, and invite links
// for their admins. The server checks the role on every call.

import { useId, useState, type FormEvent } from 'react'
import { Link } from 'react-router'
import { removeLoginRule } from '../api/admin'
import { approveRule, closeInstitution, createInstitution, createInvite, deleteInstitution, getAllInstitutions, getInvites, getPendingRules, reopenInstitution, revokeInvite } from '../api/system'
import type { Invite, InviteCreated, PendingRule, SystemInstitution } from '../api/types'
import { SITE_URL } from '../config'
import { useAction } from '../hooks/useAction'
import { useApi } from '../hooks/useApi'
import { formatDay, formatTime } from '../logic/time'
import { useInstitution } from '../institution'
import { ActionError, Button, ConfirmButton, ErrorState, PageLoading } from '../ui'
import admin from '../admin/admin.module.css'
import styles from './system.module.css'

export function SystemPage() {
  const institutions = useApi(getAllInstitutions, 'system-institutions')
  return (
    <div className={admin.page}>
      <p className={admin.eyebrow}>ניהול המערכת</p>
      <h1 className={admin.title}>ניהול המערכת</h1>
      <p className={admin.lead}>כאן יוצרים מוסד, שולחים קישור הזמנה למי שינהל אותו, ומאשרים כללי כניסה.</p>
      <PendingRules />
      <NewInstitutionForm onCreated={institutions.reload} />
      <h2 className={admin.formTitle}>כל המוסדות</h2>
      {!institutions.data && institutions.error ? (
        <ErrorState error={institutions.error} onRetry={institutions.reload} />
      ) : !institutions.data ? (
        <PageLoading />
      ) : (
        <ul className={styles.list}>
          {institutions.data.map((institution) => (
            <InstitutionRow key={institution.slug} institution={institution} onDeleted={institutions.reload} />
          ))}
        </ul>
      )}
    </div>
  )
}

// A rule an institution admin adds works only after the system admin checks
// the domain or tenant is really the institution's: otherwise anyone invited
// could claim another college's students.
function PendingRules() {
  const id = useId()
  const rules = useApi(getPendingRules, 'system-pending-rules')
  const action = useAction()

  async function decide(rule: PendingRule, approve: boolean) {
    // Removing answers "204 No Content": success is the call not failing.
    const done = await action.run(() => (approve ? approveRule(rule.id).then(() => true) : removeLoginRule(rule.id).then(() => true)))
    if (done) rules.reload()
  }

  return (
    <section className={admin.form} aria-labelledby={`${id}-title`}>
      <h2 id={`${id}-title`} className={admin.formTitle}>
        כללי כניסה לאישור
      </h2>
      <p className={admin.lead}>מנהל מוסד הוסיף סיומת מייל או ארגון מיקרוסופט. לפני אישור, בודקים שהם באמת של המוסד.</p>
      {!rules.data && rules.error ? (
        <ErrorState error={rules.error} onRetry={rules.reload} />
      ) : !rules.data ? (
        <PageLoading />
      ) : rules.data.length === 0 ? (
        <p className={admin.lead}>אין מה לאשר כרגע. כשמנהל של מוסד יוסיף כלל כניסה, הוא יופיע כאן.</p>
      ) : (
        <ul className={admin.rules} aria-label="כללי כניסה שממתינים לאישור">
          {rules.data.map((rule) => (
            <li key={rule.id}>
              <span>{rule.institution_name}:</span> <span>{rule.provider === 'email' ? 'סיומת מייל' : 'ארגון מיקרוסופט'}</span>{' '}
              <span dir="ltr">{rule.value}</span>{' '}
              <Button size="sm" disabled={action.busy} onClick={() => void decide(rule, true)}>
                אישור
              </Button>{' '}
              <ConfirmButton label="דחייה" confirmLabel="כן, לדחות" size="sm" busy={action.busy} onConfirm={() => void decide(rule, false)} />
            </li>
          ))}
        </ul>
      )}
      <ActionError action={action} />
    </section>
  )
}

function NewInstitutionForm({ onCreated }: { onCreated: () => void }) {
  const id = useId()
  const action = useAction()
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')

  async function submit(event: FormEvent) {
    event.preventDefault()
    const created = await action.run(() =>
      createInstitution({ name: name.trim(), slug: slug.trim().toLowerCase(), timezone: 'Asia/Jerusalem' }),
    )
    if (!created) return
    setName('')
    setSlug('')
    onCreated()
  }

  return (
    <form className={admin.form} onSubmit={submit} aria-labelledby={`${id}-title`}>
      <h2 id={`${id}-title`} className={admin.formTitle}>
        מוסד חדש
      </h2>
      <label className={admin.label} htmlFor={`${id}-name`}>
        שם המוסד
      </label>
      <input
        id={`${id}-name`}
        className={admin.field}
        required
        maxLength={200}
        value={name}
        onChange={(event) => setName(event.target.value)}
      />
      <label className={admin.label} htmlFor={`${id}-slug`}>
        כתובת באתר, באותיות אנגליות קטנות ומקפים. למשל <span dir="ltr">tel-hai</span>
      </label>
      <input
        id={`${id}-slug`}
        className={admin.field}
        dir="ltr"
        required
        minLength={2}
        maxLength={64}
        pattern="[a-z0-9]+(-[a-z0-9]+)*"
        value={slug}
        onChange={(event) => setSlug(event.target.value)}
      />
      <Button type="submit" busy={action.busy}>
        יצירת מוסד
      </Button>
      <ActionError action={action} />
    </form>
  )
}

function InstitutionRow({ institution, onDeleted }: { institution: SystemInstitution; onDeleted: () => void }) {
  const { timezone } = useInstitution()
  const action = useAction()
  const [invite, setInvite] = useState<InviteCreated | null>(null)
  const linkId = useId()
  const link = invite ? `${SITE_URL}/invite#t=${encodeURIComponent(invite.token)}` : ''

  // The list of invites sent, loaded only when opened.
  const [listOpen, setListOpen] = useState(false)
  const [sent, setSent] = useState(0) // a new invite: the open list reloads

  async function newInvite() {
    const created = await action.run(() => createInvite(institution.slug))
    if (created) {
      setInvite(created)
      setSent((n) => n + 1)
    }
  }

  return (
    <li className={styles.row}>
      <div className={styles.head}>
        <h2 className={styles.name}>{institution.name}</h2>
        {institution.closes_at ? (
          <span className={styles.closing}>נסגר, יימחק ב-{formatDay(institution.closes_at, timezone)}</span>
        ) : (
          <span className={institution.is_active ? styles.active : styles.hidden}>
            {institution.is_active ? 'פעיל' : 'מוסתר'}
          </span>
        )}
      </div>
      <p className={styles.facts}>
        <span dir="ltr">/{institution.slug}</span> · {institution.buildings} בניינים · {institution.admins} מנהלים
      </p>
      <div className={styles.actions}>
        <Link to={`/${institution.slug}/admin`} className={styles.manage}>
          לניהול המוסד
        </Link>
        <Button variant="secondary" size="sm" busy={action.busy} onClick={() => void newInvite()}>
          קישור הזמנה למנהל
        </Button>
        <Button variant="ghost" size="sm" aria-expanded={listOpen} aria-controls={`invites-${institution.slug}`} onClick={() => setListOpen(!listOpen)}>
          ההזמנות שנשלחו
        </Button>
      </div>
      <div id={`invites-${institution.slug}`}>
        {listOpen && <Invites slug={institution.slug} name={institution.name} version={sent} />}
      </div>
      {invite && (
        <div className={styles.invite}>
          <label htmlFor={linkId} className={admin.label}>
            קישור ההזמנה
          </label>
          <input id={linkId} className={admin.field} dir="ltr" readOnly value={link} onFocus={(e) => e.target.select()} />
          <p className={styles.note}>
            מוצג רק עכשיו. תקף עד {formatDay(invite.expires_at, timezone)} בשעה {formatTime(invite.expires_at, timezone)}, ועובד פעם אחת. שלח אותו רק למנהל עצמו.
          </p>
          {typeof navigator !== 'undefined' && navigator.clipboard && (
            <Button variant="ghost" size="sm" onClick={() => void navigator.clipboard.writeText(link)}>
              העתקה
            </Button>
          )}
        </div>
      )}
      <ActionError action={action} />
      {institution.closes_at ? (
        <Reopen slug={institution.slug} onDone={onDeleted} />
      ) : (
        institution.can_close !== false && <CloseInstitution slug={institution.slug} onDone={onDeleted} />
      )}
      {!institution.is_active && !institution.closes_at && <DeleteInstitution slug={institution.slug} onDeleted={onDeleted} />}
    </li>
  )
}

const INVITE_STATES: Record<Invite['status'], string> = { open: 'פתוחה', used: 'נוצלה', revoked: 'בוטלה', expired: 'פגה' }

// The invites sent for one institution: what became of each, and "revoke"
// for one still open (a link sent to the wrong person, or never used).
function Invites({ slug, name, version }: { slug: string; name: string; version: number }) {
  const { timezone } = useInstitution()
  const list = useApi(() => getInvites(slug), `invites-${slug}-${version}`)
  const action = useAction()
  if (!list.data && list.error) return <ErrorState error={list.error} onRetry={list.reload} compact />
  if (!list.data) return <p className={styles.note}>טוען את ההזמנות…</p>
  if (list.data.length === 0) return <p className={styles.note}>עוד לא נשלחו הזמנות.</p>
  return (
    <>
      <ul className={styles.invites} aria-label={`ההזמנות של ${name}`}>
        {list.data.map((invite) => (
          <li key={invite.id} className={styles.inviteRow}>
            <span className={invite.status === 'open' ? styles.active : styles.hidden}>{INVITE_STATES[invite.status]}</span>
            <span className={styles.note}>
              נוצרה {formatDay(invite.created_at, timezone)}
              {invite.status === 'open' && ` · תקפה עד ${formatDay(invite.expires_at, timezone)} בשעה ${formatTime(invite.expires_at, timezone)}`}
              {invite.used_at && ` · נוצלה ${formatDay(invite.used_at, timezone)}`}
            </span>
            {invite.status === 'open' && (
              <ConfirmButton
                size="sm"
                label="לבטל"
                confirmLabel="כן, לבטל"
                busy={action.busy}
                onConfirm={() =>
                  void action.run(async () => {
                    // Reloaded even when refused: it may have expired meanwhile.
                    try {
                      await revokeInvite(invite.id)
                    } finally {
                      list.reload()
                    }
                  })
                }
              />
            )}
          </li>
        ))}
      </ul>
      <ActionError action={action} />
    </>
  )
}

// Only a hidden one is offered: an open institution is hidden first. To
// delete, its address is typed, so a misclick deletes nothing.
// Closing: hidden now, nothing new in it, its students told, and all of it
// deleted in 14 days. Typing the address first, as for deleting.
function CloseInstitution({ slug, onDone }: { slug: string; onDone: () => void }) {
  const id = useId()
  const action = useAction()
  const [asking, setAsking] = useState(false)
  const [typed, setTyped] = useState('')

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (await action.run(() => closeInstitution(slug))) onDone()
  }

  if (!asking) {
    return (
      <div className={styles.actions}>
        <Button variant="ghost" size="sm" onClick={() => setAsking(true)}>
          לסגור את המוסד
        </Button>
      </div>
    )
  }
  return (
    <form className={styles.invite} onSubmit={(event) => void submit(event)}>
      <p className={styles.note}>
        המוסד יוסתר מיד, ההזמנות העתידיות יבוטלו, ואי אפשר יהיה להזמין או להיכנס בסריקה. המנהלים יקבלו מייל, והסטודנטים
        הודעה. אחרי 14 יום יימחקו הבניינים, המקומות וכל החשבונות שבו. עד אז אפשר לבטל.
      </p>
      <label htmlFor={id} className={admin.label}>
        כדי לסגור, הקלד את הכתובת של המוסד: <span dir="ltr">{slug}</span>
      </label>
      <input id={id} className={admin.field} dir="ltr" autoComplete="off" value={typed} onChange={(e) => setTyped(e.target.value)} />
      <div className={styles.actions}>
        <Button type="submit" variant="danger" size="sm" busy={action.busy} disabled={typed.trim() !== slug}>
          לסגור, ולמחוק בעוד 14 יום
        </Button>
        <Button variant="ghost" size="sm" onClick={() => { setAsking(false); setTyped('') }}>
          ביטול
        </Button>
      </div>
      <ActionError action={action} />
    </form>
  )
}

function Reopen({ slug, onDone }: { slug: string; onDone: () => void }) {
  const action = useAction()
  return (
    <div className={styles.actions}>
      <ConfirmButton
        label="לבטל את הסגירה"
        confirmLabel="כן, לבטל את הסגירה"
        busy={action.busy}
        onConfirm={() => void action.run(() => reopenInstitution(slug)).then((done) => done && onDone())}
      />
      <ActionError action={action} />
    </div>
  )
}

function DeleteInstitution({ slug, onDeleted }: { slug: string; onDeleted: () => void }) {
  const id = useId()
  const action = useAction()
  const [asking, setAsking] = useState(false)
  const [typed, setTyped] = useState('')

  async function remove(event: FormEvent) {
    event.preventDefault()
    if (await action.run(() => deleteInstitution(slug).then(() => true))) onDeleted()
  }

  if (!asking) {
    return (
      <div className={styles.actions}>
        <Button variant="ghost" size="sm" onClick={() => setAsking(true)}>
          מחיקת המוסד
        </Button>
      </div>
    )
  }
  return (
    <form className={styles.invite} onSubmit={(event) => void remove(event)}>
      <p className={styles.note}>
        נמחק הכול: בניינים, מקומות, שלטים, הזמנות, כללי כניסה, והחשבונות של המשתמשים שלו. אי אפשר לבטל.
      </p>
      <label htmlFor={id} className={admin.label}>
        כדי למחוק, הקלד את הכתובת של המוסד: <span dir="ltr">{slug}</span>
      </label>
      <input id={id} className={admin.field} dir="ltr" autoComplete="off" value={typed} onChange={(e) => setTyped(e.target.value)} />
      <div className={styles.actions}>
        <Button type="submit" variant="danger" size="sm" busy={action.busy} disabled={typed.trim() !== slug}>
          למחוק לצמיתות
        </Button>
        <Button variant="ghost" size="sm" onClick={() => { setAsking(false); setTyped('') }}>
          ביטול
        </Button>
      </div>
      <ActionError action={action} />
    </form>
  )
}
