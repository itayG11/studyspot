// "My calendar": one secret address a calendar app subscribes to, with the
// bookings and the timetable (backend/app/calendar_feed.py). The app reads
// it again by itself, so a cancelled booking leaves the calendar too.
// The address is shown once, right after it is made: the server keeps only
// a hash of its token. Anyone holding it sees the feed, so it can be ended
// or replaced at any time.

import { CalendarPlus, Copy } from 'lucide-react'
import { useEffect, useId, useRef, useState } from 'react'
import { calendarFeed, createCalendarFeed, revokeCalendarFeed } from '../api/student'
import { useAuth } from '../auth/AuthContext'
import { useAction } from '../hooks/useAction'
import { useApi } from '../hooks/useApi'
import { useInstitution } from '../institution'
import { googleSubscribeLink, webcalLink } from '../logic/calendarFeed'
import { formatDay, formatTime } from '../logic/time'
import { ActionError, AppButtonLink, Button, ConfirmButton, ExternalButtonLink } from '../ui'
import styles from './me.module.css'

export function CalendarFeedCard() {
  const { user } = useAuth()
  if (!user || user.is_demo) return null // the shared demo student: the server refuses too
  return <Card />
}

function Card() {
  const state = useApi(calendarFeed, 'calendar-feed')
  const { timezone } = useInstitution()
  const action = useAction()
  const [url, setUrl] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const titleId = useId()
  const ready = useRef<HTMLParagraphElement>(null)
  const data = state.data
  // The button pressed is gone once the address shows: focus goes to it,
  // so a screen reader says what appeared.
  useEffect(() => {
    if (url) ready.current?.focus()
  }, [url])
  const canCopy = typeof navigator !== 'undefined' && Boolean(navigator.clipboard)

  async function make() {
    const made = await createCalendarFeed()
    setCopied(false)
    setUrl(made.url)
    state.reload()
  }

  async function revoke() {
    await revokeCalendarFeed()
    setUrl(null)
    state.reload()
  }

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
    } catch {
      setCopied(false) // blocked by the browser: the address is on the screen to copy by hand
    }
  }

  const when = (iso: string) => `${formatDay(iso, timezone)} ${formatTime(iso, timezone)}`

  return (
    <section aria-labelledby={titleId} className={styles.section}>
      <h2 id={titleId} className={styles.heading}>
        היומן שלי
      </h2>
      <p>ההזמנות ומערכת השעות ביומן של הטלפון או של גוגל. היומן מתעדכן לבד: הזמנה שבוטלה נעלמת גם ממנו.</p>

      {url ? (
        <div className={styles.feed}>
          <p ref={ready} tabIndex={-1} className={styles.feedReady}>
            הקישור מוכן. בוחרים לפי היומן שבו אתה משתמש:
          </p>
          <p className={styles.privacyNote}>
            מי שיש לו את הקישור רואה את ההזמנות ואת המערכת שלך. אפשר לבטל אותו וליצור חדש בכל רגע. הכתובת מוצגת רק עכשיו.
          </p>
          <div className={styles.actions}>
            <ExternalButtonLink variant="primary" icon={<CalendarPlus aria-hidden="true" />} href={googleSubscribeLink(url)}>
              יומן <span dir="ltr">Google</span>: אנדרואיד ומחשב
            </ExternalButtonLink>
            <AppButtonLink variant="primary" icon={<CalendarPlus aria-hidden="true" />} href={webcalLink(url)}>
              יומן של אפל: אייפון, אייפד ומק
            </AppButtonLink>
          </div>
          <p className={styles.feedAddress}>
            <bdi dir="ltr">{url}</bdi>
          </p>
          {canCopy && (
            <Button size="sm" variant="secondary" icon={<Copy aria-hidden="true" />} onClick={() => void copy(url)}>
              העתקת הכתובת
            </Button>
          )}
          <p role="status">{copied ? 'הכתובת הועתקה' : ''}</p>
          <p className={styles.privacyNote}>
            ב-<span dir="ltr">Outlook</span>: "הוספת לוח שנה", ואז "הירשם מהאינטרנט", ומדביקים את הכתובת. גוגל קורא את הכתובת מחדש לאט, לפעמים רק אחרי יום.
          </p>
        </div>
      ) : data?.active ? (
        <p>
          יש קישור פעיל, מ-{when(data.created_at!)}.{' '}
          {data.last_read_at ? `היומן קרא אותו לאחרונה ב-${when(data.last_read_at)}.` : 'היומן עוד לא קרא אותו.'}
        </p>
      ) : null}

      {data && (
        <div className={styles.actions}>
          {!data.active ? (
            <Button variant="secondary" icon={<CalendarPlus aria-hidden="true" />} busy={action.busy} onClick={() => void action.run(make)}>
              ליצור קישור ליומן
            </Button>
          ) : (
            <>
              <ConfirmButton size="sm" label="קישור חדש" confirmLabel="כן, קישור חדש" busy={action.busy} onConfirm={() => void action.run(make)} />
              <ConfirmButton size="sm" label="לבטל את הקישור" confirmLabel="כן, לבטל" busy={action.busy} onConfirm={() => void action.run(revoke)} />
            </>
          )}
        </div>
      )}
      <ActionError action={action} />
    </section>
  )
}
