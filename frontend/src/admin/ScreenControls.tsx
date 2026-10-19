// On each sign card (wave 13): a printed sign, or a screen by the door with
// a new code every minute. On a screen, the printed code stops working, and
// the admin makes the secret link to open on the tablet. The link is shown
// once, like the calendar feed's: the server keeps only an HMAC of it.

import { useState } from 'react'
import { Copy, MonitorSmartphone } from 'lucide-react'
import { makeScreenLink, removeScreenLink, setCheckInMode } from '../api/admin'
import type { CheckInMode, PlaceCode } from '../api/types'
import { useAction } from '../hooks/useAction'
import { useInstitution } from '../institution'
import { formatDay, formatTime } from '../logic/time'
import { ActionError, Button, ConfirmButton, Segmented } from '../ui'
import styles from './admin.module.css'

const MODES: { value: CheckInMode; label: string }[] = [
  { value: 'sign', label: 'שלט מודפס' },
  { value: 'screen', label: 'מסך' },
]

export function ScreenControls({ code, onChanged }: { code: PlaceCode; onChanged: (next: PlaceCode) => void }) {
  const { timezone } = useInstitution()
  const action = useAction()
  const [url, setUrl] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const choose = (mode: CheckInMode) =>
    void action.run(async () => {
      setUrl(null)
      onChanged(await setCheckInMode(code.place_id, mode))
    })
  const make = () =>
    void action.run(async () => {
      const made = await makeScreenLink(code.place_id)
      setCopied(false)
      setUrl(made.url)
      onChanged(made.place)
    })
  const remove = () =>
    void action.run(async () => {
      setUrl(null)
      onChanged(await removeScreenLink(code.place_id))
    })
  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
    } catch {
      setCopied(false) // blocked by the browser: the address is on the screen to copy by hand
    }
  }

  const seen = code.screen_last_seen_at
  return (
    <div className={`${styles.screenOnly} ${styles.screenControls}`}>
      <Segmented label={`איך נכנסים ל${code.place_name}`} options={MODES} value={code.check_in_mode} onChange={choose} />
      {code.check_in_mode === 'screen' && (
        <>
          <p className={styles.screenNote}>במקום הזה השלט המודפס לא עובד. הכניסה רק בקוד מהמסך, שמתחלף כל דקה.</p>
          {url ? (
            <div className={styles.screenLink} role="status">
              <p>פותחים את הכתובת הזו בטאבלט שליד הדלת. היא מוצגת רק עכשיו:</p>
              <code className={styles.screenAddress}>{url}</code>
              {navigator.clipboard && (
                <Button size="sm" variant="secondary" icon={<Copy aria-hidden="true" />} onClick={() => void copy(url)}>
                  {copied ? 'הועתק' : 'להעתיק'}
                </Button>
              )}
            </div>
          ) : code.screen_active ? (
            <p className={styles.screenNote}>
              {seen ? `המסך נראה לאחרונה ב-${formatDay(seen, timezone)} ${formatTime(seen, timezone)}.` : 'יש קישור, אבל המסך עוד לא נפתח.'}
            </p>
          ) : null}
          <div className={styles.signActions}>
            {code.screen_active ? (
              <>
                <ConfirmButton label="קישור חדש" confirmLabel="כן, הישן יפסיק" size="sm" busy={action.busy} onConfirm={make} />
                <ConfirmButton label="לבטל את הקישור" confirmLabel="כן, לבטל" size="sm" busy={action.busy} onConfirm={remove} />
              </>
            ) : (
              <Button size="sm" icon={<MonitorSmartphone aria-hidden="true" />} busy={action.busy} onClick={make}>
                ליצור קישור למסך
              </Button>
            )}
          </div>
        </>
      )}
      <ActionError action={action} />
    </div>
  )
}
