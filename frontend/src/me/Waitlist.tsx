// "Waiting for": the group-room times the student asked to be told about
// if they free (backend/app/waitlist.py). Shown only when there are some.

import { useId } from 'react'
import { leaveWaitlist, myWaitlist } from '../api/student'
import { useAction } from '../hooks/useAction'
import { useApi } from '../hooks/useApi'
import { useInstitution } from '../institution'
import { formatDay, formatTime } from '../logic/time'
import { ActionError, ConfirmButton } from '../ui'
import styles from './me.module.css'

export function Waitlist() {
  const entries = useApi(myWaitlist, 'my-waitlist')
  const { timezone } = useInstitution()
  const action = useAction()
  const titleId = useId()
  if (!entries.data || entries.data.length === 0) return null

  return (
    <section aria-labelledby={titleId} className={styles.section}>
      <h2 id={titleId} className={styles.heading}>
       ממתין שיתפנה
      </h2>
      <p className={styles.privacyNote}>
        אם הזמן מתפנה, נודיע לך בהתראה או במייל. החדר לא נשמר לך: מי שמזמין ראשון מקבל.
      </p>
      <ul className={styles.waitlist}>
        {entries.data.map((entry) => (
          <li key={entry.id} className={styles.waitRow}>
            <span>
              <strong>{entry.place_name}</strong> · {formatDay(entry.starts_at, timezone)}{' '}
              <span className={styles.num}>
                {formatTime(entry.starts_at, timezone)}–{formatTime(entry.ends_at, timezone)}
              </span>
              {entry.notified && <span className={styles.waitFreed}> · התפנה, כדאי להזמין</span>}
            </span>
            <ConfirmButton
              size="sm"
              label="להסיר"
              confirmLabel="כן, להסיר"
              busy={action.busy}
              onConfirm={() =>
                void action.run(async () => {
                  await leaveWaitlist(entry.id)
                  entries.reload()
                })
              }
            />
          </li>
        ))}
      </ul>
      <ActionError action={action} />
    </section>
  )
}
