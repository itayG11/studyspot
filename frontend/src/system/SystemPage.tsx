// The system admin's page: every institution, a new one, and invite links
// for their admins. The server checks the role on every call.

import { useId, useState, type FormEvent } from 'react'
import { Link } from 'react-router'
import { createInstitution, createInvite, getAllInstitutions } from '../api/system'
import type { InviteCreated, SystemInstitution } from '../api/types'
import { SITE_URL } from '../config'
import { useAction } from '../hooks/useAction'
import { useApi } from '../hooks/useApi'
import { formatDay, formatTime } from '../logic/time'
import { useInstitution } from '../institution'
import { Button, ErrorState, Notice, PageLoading } from '../ui'
import admin from '../admin/admin.module.css'
import styles from './system.module.css'

export function SystemPage() {
  const institutions = useApi(getAllInstitutions, 'system-institutions')
  return (
    <div className={admin.page}>
      <p className={admin.eyebrow}>ניהול המערכת</p>
      <h1 className={admin.title}>מוסדות</h1>
      <p className={admin.lead}>
        מוסד חדש נוצר מוסתר. שולחים קישור הזמנה למנהל שלו, והוא מקים את המוסד ומסמן אותו "פעיל".
      </p>
      <NewInstitutionForm onCreated={institutions.reload} />
      {!institutions.data && institutions.error ? (
        <ErrorState error={institutions.error} onRetry={institutions.reload} />
      ) : !institutions.data ? (
        <PageLoading />
      ) : (
        <ul className={styles.list}>
          {institutions.data.map((institution) => (
            <InstitutionRow key={institution.slug} institution={institution} />
          ))}
        </ul>
      )}
    </div>
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
      {action.error && <Notice tone="error">{action.error}</Notice>}
    </form>
  )
}

function InstitutionRow({ institution }: { institution: SystemInstitution }) {
  const { timezone } = useInstitution()
  const action = useAction()
  const [invite, setInvite] = useState<InviteCreated | null>(null)
  const linkId = useId()
  const link = invite ? `${SITE_URL}/invite#t=${encodeURIComponent(invite.token)}` : ''

  async function newInvite() {
    const created = await action.run(() => createInvite(institution.slug))
    if (created) setInvite(created)
  }

  return (
    <li className={styles.row}>
      <div className={styles.head}>
        <h2 className={styles.name}>{institution.name}</h2>
        <span className={institution.is_active ? styles.active : styles.hidden}>
          {institution.is_active ? 'פעיל' : 'מוסתר'}
        </span>
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
      {action.error && <Notice tone="error">{action.error}</Notice>}
    </li>
  )
}
