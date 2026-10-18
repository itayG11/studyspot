// "Notifications on this phone": booking reminders by push (wave 10). The
// server sends them (backend/app/reminders.py); public/sw.js shows them.

import { useEffect, useId, useState } from 'react'
import { Bell, BellOff } from 'lucide-react'
import { pushKey, subscribePush, testPush, unsubscribePush } from '../api/student'
import { useAction } from '../hooks/useAction'
import { currentDevice, detectPlatform } from '../logic/install'
import { currentPushEnvironment, keyBytes, pushSupport } from '../logic/push'
import { ActionError, Button } from '../ui'
import { EmailNoticesToggle } from './EmailNoticesToggle'
import { askPermission, currentSubscription, permission, subscribeDevice } from './pushDevice'
import styles from './me.module.css'

type State = 'loading' | 'needs-install' | 'unsupported' | 'denied' | 'off' | 'on'

export function PushToggle({ isDemo }: { isDemo: boolean }) {
  const [state, setState] = useState<State>('loading')
  const [note, setNote] = useState<string | null>(null)
  const action = useAction()
  const titleId = useId()

  useEffect(() => {
    if (isDemo) return
    const support = pushSupport(currentPushEnvironment(detectPlatform(currentDevice())))
    if (support !== 'supported') {
      setState(support)
      return
    }
    if (permission() === 'denied') {
      setState('denied')
      return
    }
    let live = true
    currentSubscription()
      .then((sub) => live && setState(sub ? 'on' : 'off'))
      .catch(() => live && setState('off'))
    return () => {
      live = false
    }
  }, [isDemo])

  async function enable() {
    setNote(null)
    if ((await askPermission()) !== 'granted') {
      setState('denied')
      return
    }
    const { key } = await pushKey()
    const sub = await subscribeDevice(keyBytes(key))
    try {
      await subscribePush(sub.toJSON() as Parameters<typeof subscribePush>[0])
    } catch (error) {
      await sub.unsubscribe() // the server said no: leave nothing half on
      throw error
    }
    setState('on')
  }

  async function disable() {
    setNote(null)
    const sub = await currentSubscription()
    if (sub) {
      await unsubscribePush(sub.endpoint)
      await sub.unsubscribe()
    }
    setState('off')
  }

  async function test() {
    const { delivered } = await testPush()
    setNote(delivered > 0 ? 'נשלחה התראת ניסיון. היא אמורה להופיע תוך כמה שניות.' : 'לא הצלחנו לשלוח התראה למכשיר הזה. נסה לכבות ולהפעיל שוב.')
  }

  return (
    <section aria-labelledby={titleId} className={styles.section}>
      <h2 id={titleId} className={styles.heading}>
        התראות
      </h2>
      <p className={styles.privacyNote}>
        תזכורת 10 דקות לפני הזמנה, והתראה אם עוד לא נכנסת, 10 דקות לפני שהמקום משתחרר.
      </p>
      {isDemo ? (
        <p>בחשבון לדוגמה אין התראות: כל המבקרים חולקים אותו. התחבר עם חשבון משלך כדי לקבל תזכורות.</p>
      ) : state === 'needs-install' ? (
        <p>באייפון ובאייפד ההתראות עובדות רק אחרי הוספה למסך הבית. ההוראות למטה, ואז פותחים את האתר מהאייקון.</p>
      ) : state === 'unsupported' ? (
        <p>הדפדפן הזה לא תומך בהתראות.</p>
      ) : state === 'denied' ? (
        <p>ההתראות חסומות בהגדרות הדפדפן לאתר הזה. מאפשרים אותן שם, ואז חוזרים לכאן.</p>
      ) : state === 'on' ? (
        <>
          <p>ההתראות פועלות במכשיר הזה.</p>
          <div className={styles.account}>
            <Button variant="secondary" busy={action.busy} onClick={() => void action.run(test)}>
              לשלוח התראת ניסיון
            </Button>
            <Button variant="ghost" icon={<BellOff aria-hidden="true" />} busy={action.busy} onClick={() => void action.run(disable)}>
              לכבות התראות
            </Button>
          </div>
        </>
      ) : state === 'off' ? (
        <Button icon={<Bell aria-hidden="true" />} busy={action.busy} onClick={() => void action.run(enable)}>
          להפעיל התראות
        </Button>
      ) : null}
      {!isDemo && <EmailNoticesToggle />}
      {note && <p role="status">{note}</p>}
      <ActionError action={action} />
    </section>
  )
}
