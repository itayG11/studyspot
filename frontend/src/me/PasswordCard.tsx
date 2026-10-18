// A password next to the emailed code, set or changed here. It always takes a
// fresh code to the account's own address, even when signed in, so a session
// left open somewhere cannot fix a password on the account.
// Only for an account that signed in by code before: anyone else would get a
// second, separate account (MeOut.can_set_password).

import { useId, useState } from 'react'
import { useAuth } from '../auth/AuthContext'
import { EmailSignIn } from '../pages/EmailSignIn'
import { Button } from '../ui'
import styles from './me.module.css'

export function PasswordCard() {
  const { user } = useAuth()
  const [open, setOpen] = useState(false)
  const [saved, setSaved] = useState(false)
  const titleId = useId()
  if (!user || user.is_demo || !user.can_set_password) return null
  const action = user.has_password ? 'להחליף סיסמה' : 'להגדיר סיסמה'
  return (
    <section aria-labelledby={titleId} className={styles.section}>
      <h2 id={titleId} className={styles.heading}>
        סיסמה
      </h2>
      <p>
        {user.has_password
          ? 'יש לך סיסמה: אפשר להיכנס בה, או בקוד למייל.'
          : 'אפשר להיכנס גם בסיסמה, בלי לחכות לקוד בכל פעם.'}
      </p>
      {open ? (
        <>
          <EmailSignIn
            purpose="set-password"
            fixedEmail={user.email}
            title={action}
            onSignedIn={() => {
              setOpen(false)
              setSaved(true)
            }}
          />
          <div className={styles.account}>
            <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
              ביטול
            </Button>
          </div>
        </>
      ) : (
        <div className={styles.account}>
          <Button
            variant="secondary"
            onClick={() => {
              setSaved(false)
              setOpen(true)
            }}
          >
            {action}
          </Button>
        </div>
      )}
      <p role="status" className={saved ? undefined : 'visually-hidden'}>
        {saved ? 'הסיסמה נשמרה. שאר המכשירים נותקו.' : ''}
      </p>
    </section>
  )
}
