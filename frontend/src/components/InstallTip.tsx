// "Add StudySpot to your home screen": a one-button install on Android's
// Chrome, the steps by hand on iPhone and iPad (Safari has no install
// prompt for websites). Nothing when the site is already open from the
// home screen.

import { useState, useSyncExternalStore } from 'react'
import { MoreVertical, Share, Smartphone } from 'lucide-react'
import {
  currentDevice,
  detectPlatform,
  dismissInstallTip,
  forgetInstallPrompt,
  installPrompt,
  installTipDismissed,
  subscribeInstallPrompt,
} from '../logic/install'
import { Button } from '../ui'
import styles from './InstallTip.module.css'

// card: the home page, on a phone, until "not now". section: the personal
// area, always there for whoever looks for it.
export function InstallTip({ variant }: { variant: 'card' | 'section' }) {
  const prompt = useSyncExternalStore(subscribeInstallPrompt, installPrompt, () => null)
  const [platform] = useState(() => detectPlatform(currentDevice()))
  const [hidden, setHidden] = useState(() => variant === 'card' && installTipDismissed())

  if (platform === 'installed' || hidden) return null
  if (variant === 'card' && platform === 'other') return null // a computer: the personal area has it

  async function install() {
    if (!prompt) return
    await prompt.prompt()
    forgetInstallPrompt() // a prompt can be shown only once
  }

  return (
    <section className={variant === 'card' ? styles.card : styles.section} aria-labelledby="install-title">
      <h2 id="install-title" className={styles.title}>
        <Smartphone aria-hidden="true" /> StudySpot במסך הבית
      </h2>
      <p className={styles.text}>האתר נפתח מהאייקון כמו אפליקציה, בלי שורת כתובת. בלי הורדה מחנות.</p>

      {platform === 'android' && prompt ? (
        <Button onClick={() => void install()}>התקנה</Button>
      ) : platform === 'ios' ? (
        <ol className={styles.steps}>
          <li>
            בספארי, לוחצים על כפתור השיתוף <Share aria-label="שיתוף" className={styles.icon} />
          </li>
          <li>גוללים ובוחרים "הוספה למסך הבית"</li>
          <li>לוחצים "הוספה"</li>
        </ol>
      ) : (
        <ol className={styles.steps}>
          <li>
            בכרום, פותחים את התפריט <MoreVertical aria-label="שלוש הנקודות" className={styles.icon} />
          </li>
          <li>בוחרים "הוספה למסך הבית" או "התקנת אפליקציה"</li>
        </ol>
      )}

      {variant === 'card' && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            dismissInstallTip()
            setHidden(true)
          }}
        >
          לא עכשיו
        </Button>
      )}
    </section>
  )
}
