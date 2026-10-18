// "Also by email": the same reminders as push, by email, when no browser of
// the user got them (backend/app/notify.py). Off by default, and only for an
// address the last sign-in proved.

import { Mail, MailX } from 'lucide-react'
import { emailNotices, setEmailNotices } from '../api/student'
import { useAction } from '../hooks/useAction'
import { useApi } from '../hooks/useApi'
import { ActionError, Button } from '../ui'
import styles from './me.module.css'

const WHY_NOT = {
  demo: null, // PushToggle already says why the demo account has no notices
  unverified: 'התראות במייל נשלחות רק לכתובת שאומתה. התחבר בקוד למייל, או עם גוגל, ואז אפשר להפעיל אותן.',
  off: 'שליחת מיילים לא פעילה באתר הזה כרגע.',
} as const

export function EmailNoticesToggle() {
  const state = useApi(emailNotices, 'email-notices')
  const action = useAction()
  const data = state.data
  if (!data) return null

  async function set(enabled: boolean) {
    await setEmailNotices(enabled)
    state.reload()
  }

  if (!data.available) {
    const why = data.reason ? WHY_NOT[data.reason] : null
    return why ? <p className={styles.privacyNote}>{why}</p> : null
  }
  return (
    <div className={styles.emailNotices}>
      <p>
        {data.enabled ? 'גם במייל, כשההתראה לא הגיעה לאף מכשיר: ' : 'אפשר לקבל את אותן התראות גם במייל, כשהן לא מגיעות לאף מכשיר: '}
        <bdi dir="ltr">{data.address}</bdi>
      </p>
      {data.enabled ? (
        <Button variant="ghost" icon={<MailX aria-hidden="true" />} busy={action.busy} onClick={() => void action.run(() => set(false))}>
          לכבות התראות במייל
        </Button>
      ) : (
        <Button variant="secondary" icon={<Mail aria-hidden="true" />} busy={action.busy} onClick={() => void action.run(() => set(true))}>
          להפעיל התראות במייל
        </Button>
      )}
      <ActionError action={action} />
    </div>
  )
}
