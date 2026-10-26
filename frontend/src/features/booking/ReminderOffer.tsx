// Right after booking, the moment a student thinks of the time: "a reminder
// by email?". Email notices stay off until asked for (backend/app/notify.py);
// the live practice run, 26 Oct, showed nobody finds the switch in "my area".
// Shown only when it can be turned on, and not on yet.

import { useState } from 'react'
import { Mail } from 'lucide-react'
import { emailNotices, setEmailNotices } from '../../api/student'
import { useAction } from '../../hooks/useAction'
import { useApi } from '../../hooks/useApi'
import { ActionError, Button } from '../../ui'
import styles from './booking.module.css'

export function ReminderOffer() {
  const state = useApi(emailNotices, 'email-notices')
  const action = useAction()
  const [turnedOn, setTurnedOn] = useState(false)
  if (turnedOn) {
    return (
      <p className={styles.ticketOther} role="status">
        מעכשיו תקבל תזכורת במייל לפני כל הזמנה. אפשר לכבות ב"האזור שלי".
      </p>
    )
  }
  const data = state.data
  if (!data || !data.available || data.enabled) return null
  return (
    <div className={styles.ticketOther}>
      <p>רוצה תזכורת במייל לפני שההזמנה מתחילה?</p>
      <Button
        variant="secondary"
        size="sm"
        icon={<Mail aria-hidden="true" />}
        busy={action.busy}
        onClick={() =>
          void action.run(async () => {
            await setEmailNotices(true)
            setTurnedOn(true)
          })
        }
      >
        כן, תזכורת במייל
      </Button>
      <ActionError action={action} />
    </div>
  )
}
