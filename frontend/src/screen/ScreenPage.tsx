// /screen#t=<link>: the page a tablet by the door shows all day (wave 13).
// A new QR code every minute, so a photo of it stops working within two
// minutes; the live occupancy under it. No sign-in, and no site header: the
// link can show this one place's code and nothing else.

import { useEffect, useState } from 'react'
import { useLocation } from 'react-router'
import { Maximize, WifiOff } from 'lucide-react'
import { ApiError } from '../api/client'
import { getScreen, type ScreenView } from '../api/screen'
import { useQrImage } from '../admin/useQrImage'
import { SITE_URL } from '../config'
import { errorMessage } from '../i18n/errors'
import { scanUrl } from '../logic/codes'
import { codeStillGood, nextAskMs, tokenFromHash } from '../logic/screen'
import styles from './screen.module.css'

const RETRY_MS = 10_000 // after a network error

interface Seen {
  view: ScreenView
  at: number // Date.now() when it came
}

export function ScreenPage() {
  const { hash } = useLocation()
  const token = tokenFromHash(hash)
  useNoIndex()
  useKeepAwake()
  if (!token) return <Message text={errorMessage('screen_not_found')} />
  return <Screen key={token} token={token} />
}

function Screen({ token }: { token: string }) {
  const [seen, setSeen] = useState<Seen | null>(null)
  const [offline, setOffline] = useState(false)
  const [refused, setRefused] = useState<string | null>(null)
  const now = useNow()

  useEffect(() => {
    let timer: number | undefined
    let stopped = false
    const ask = async () => {
      try {
        const view = await getScreen(token)
        if (stopped) return
        setSeen({ view, at: Date.now() })
        setOffline(false)
        timer = window.setTimeout(ask, nextAskMs(view.seconds_left))
      } catch (error) {
        if (stopped) return
        // An unknown link stays unknown: asking again would not help.
        if (error instanceof ApiError && error.status === 404) return setRefused(error.code)
        setOffline(true)
        timer = window.setTimeout(ask, RETRY_MS)
      }
    }
    void ask()
    return () => {
      stopped = true
      window.clearTimeout(timer)
    }
  }, [token])

  if (refused) return <Message text={errorMessage(refused)} />
  if (!seen) return <Message text="טוען את הקוד…" quiet />
  const { view } = seen
  // Without a network, an old code is shown only while the server still takes it.
  const code = view.code && codeStillGood(seen.at, view.seconds_left, now) ? view.code : null
  // The clock above ticks once a second, so it can be a moment older than the answer: never below zero.
  const elapsed = Math.max(0, Math.floor((now - seen.at) / 1000))
  const left = Math.max(0, view.seconds_left - elapsed)
  const free = Math.max(0, view.capacity - view.occupied)

  return (
    <main className={styles.screen}>
      <header className={styles.head}>
        <span className={styles.building}>בניין {view.building_code}</span>
        <h1 className={styles.name}>{view.place_name}</h1>
      </header>
      {code ? (
        <Code code={code} left={left} placeName={view.place_name} />
      ) : (
        <p className={styles.closed}>{view.code === null ? 'המקום סגור עכשיו.' : 'אין חיבור לשרת. הקוד יחזור כשהחיבור יחזור.'}</p>
      )}
      <p className={styles.count} aria-live="polite">
        <strong>{free}</strong> פנויים מתוך {view.capacity}
      </p>
      {offline && (
        <p className={styles.offline} role="status">
          <WifiOff aria-hidden="true" /> אין חיבור לשרת, מנסה שוב…
        </p>
      )}
      <FullScreenButton />
    </main>
  )
}

function Code({ code, left, placeName }: { code: string; left: number; placeName: string }) {
  const qr = useQrImage(scanUrl(SITE_URL, code))
  return (
    <figure className={styles.code}>
      {qr ? <img className={styles.qr} src={qr} alt={`קוד QR לכניסה ל${placeName}. מתחלף כל דקה.`} /> : <div className={styles.qr} />}
      <figcaption className={styles.call}>סורקים עם המצלמה כדי להיכנס</figcaption>
      {/* Restarts with every new code: key on the code. */}
      <div key={code} className={styles.bar} style={{ animationDuration: `${left}s` }} aria-hidden="true" />
      <p className={styles.left}>קוד חדש בעוד {left} שניות</p>
    </figure>
  )
}

function Message({ text, quiet = false }: { text: string; quiet?: boolean }) {
  return (
    <main className={styles.screen}>
      <p className={quiet ? styles.quiet : styles.closed} role={quiet ? 'status' : 'alert'}>
        {text}
      </p>
    </main>
  )
}

function FullScreenButton() {
  if (!document.fullscreenEnabled) return null
  return (
    <button type="button" className={styles.full} onClick={() => void document.documentElement.requestFullscreen().catch(() => {})}>
      <Maximize aria-hidden="true" /> מסך מלא
    </button>
  )
}

// The time, once a second, for the countdown.
function useNow(): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [])
  return now
}

// The tablet's screen stays on (Screen Wake Lock), where the browser allows
// it. The lock ends when the page is hidden, so it is asked for again.
function useKeepAwake() {
  useEffect(() => {
    if (!('wakeLock' in navigator)) return
    let lock: WakeLockSentinel | null = null
    const request = () => {
      if (document.visibilityState !== 'visible') return
      navigator.wakeLock.request('screen').then((l) => (lock = l)).catch(() => {})
    }
    request()
    document.addEventListener('visibilitychange', request)
    return () => {
      document.removeEventListener('visibilitychange', request)
      void lock?.release().catch(() => {})
    }
  }, [])
}

// Not for search engines: every link is someone's private screen.
function useNoIndex() {
  useEffect(() => {
    const meta = document.createElement('meta')
    meta.name = 'robots'
    meta.content = 'noindex'
    document.head.appendChild(meta)
    return () => meta.remove()
  }, [])
}
