// /scan#c=<code>: the address inside the QR code on each place's sign.
// The phone's own camera opens it; the student confirms with one button.
// In a computer lab without a booking, the student first picks a free
// station. The code is taken out of the address at once, so it does not
// stay in the browser's history; a student who must sign in first finds
// it waiting afterwards (pendingCode.ts).

import { useEffect, useState } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router'
import { CircleCheck, KeyRound, ScanLine } from 'lucide-react'
import { getPlace } from '../api/campus'
import { checkIn, myBookings, myCheckIn } from '../api/student'
import { useAuth } from '../auth/AuthContext'
import type { CheckIn } from '../api/types'
import { SeatGrid } from '../components/SeatGrid'
import { REFRESH_INTERVAL_MS } from '../config'
import { useAction } from '../hooks/useAction'
import { useApi } from '../hooks/useApi'
import { errorMessage } from '../i18n/errors'
import { floorLabel, KIND_LABELS } from '../i18n/labels'
import { useInstitution } from '../institution'
import { bookingToConfirm } from '../logic/bookings'
import { cleanCode, codeFromHash, placeIdFromCode } from '../logic/codes'
import { formatTime } from '../logic/time'
import { KIND_PHOTO } from '../media/photos'
import { Button, ButtonLink, ErrorState, Notice, PageLoading, Photo } from '../ui'
import { clearPendingCode, peekPendingCode, rememberPendingCode } from './pendingCode'
import styles from './scan.module.css'

export function ScanPage() {
  const { status } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  // Read once, from the address or from a scan made before signing in.
  const [code, setCode] = useState<string | null>(() => codeFromHash(location.hash) ?? peekPendingCode())
  // A code link opened while this page is already open (the same tab) is a
  // new scan: adjusted while rendering, as React suggests, not in an effect.
  const [seenHash, setSeenHash] = useState(location.hash)
  if (location.hash !== seenHash) {
    setSeenHash(location.hash)
    const fresh = codeFromHash(location.hash)
    if (fresh) setCode(fresh)
  }

  useEffect(() => {
    const fromAddress = codeFromHash(location.hash)
    if (!fromAddress) return
    rememberPendingCode(fromAddress) // waits here if sign-in comes first
    // Signed out, the redirect to sign-in below replaces this address anyway.
    if (status === 'signed-in') navigate('/scan', { replace: true }) // out of the address and history
  }, [location.hash, navigate, status])
  useEffect(() => {
    if (status === 'signed-in') clearPendingCode() // it is in this page's state now
  }, [status])

  if (status === 'loading') return <PageLoading label="בודק התחברות…" />
  if (status === 'signed-out') return <Navigate to={`/login?next=${encodeURIComponent('/scan')}`} replace />
  if (code === null) return <CodeForm onCode={setCode} />
  const placeId = placeIdFromCode(code)
  if (placeId === null) {
    return (
      <section className={`${styles.ticket} ${styles.form}`}>
        <Notice tone="error">{errorMessage('invalid_code')}</Notice>
        <Button variant="secondary" icon={<KeyRound aria-hidden="true" />} onClick={() => setCode(null)}>
          להקליד קוד
        </Button>
      </section>
    )
  }
  return <ScanPlace code={cleanCode(code)} placeId={placeId} />
}

function CodeForm({ onCode }: { onCode: (code: string) => void }) {
  const [text, setText] = useState('')
  return (
    <form
      className={`${styles.ticket} ${styles.form}`}
      onSubmit={(event) => {
        event.preventDefault()
        onCode(text)
      }}
    >
      <span className={styles.formIcon} aria-hidden="true">
        <ScanLine />
      </span>
      <h1 className={styles.formTitle}>כניסה למקום</h1>
      <p className={styles.lead}>סורקים את הקוד שעל השלט במצלמת הטלפון. אם זה לא עובד, אפשר להדביק את הקוד כאן.</p>
      <label htmlFor="code" className={styles.label}>
        הקוד מהשלט
      </label>
      <input id="code" className={styles.input} value={text} onChange={(e) => setText(e.target.value)} autoComplete="off" spellCheck={false} />
      <Button type="submit" disabled={text.trim() === ''}>
        המשך
      </Button>
    </form>
  )
}

function ScanPlace({ code, placeId }: { code: string; placeId: number }) {
  const { timezone, booking_rules: rules } = useInstitution()
  // Kept fresh while the page is open: a student who arrives early waits
  // here until the booking's arrival window opens.
  const place = useApi(() => getPlace(placeId), `scan-place-${placeId}`, REFRESH_INTERVAL_MS)
  const bookings = useApi(myBookings, 'my-bookings', REFRESH_INTERVAL_MS)
  const current = useApi(myCheckIn, 'my-check-in', REFRESH_INTERVAL_MS)
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 15_000)
    return () => clearInterval(timer)
  }, [])
  const [seatId, setSeatId] = useState<number | null>(null)
  const [result, setResult] = useState<CheckIn | null>(null)
  const action = useAction()

  const failed = (!place.data && place.error) || (!bookings.data && bookings.error) || (current.loading ? null : current.error)
  if (failed) {
    return (
      <ErrorState
        error={failed}
        onRetry={() => {
          place.reload()
          bookings.reload()
          current.reload()
        }}
      />
    )
  }
  if (!place.data || !bookings.data || current.loading) return <PageLoading />

  const p = place.data
  const booking = bookingToConfirm(bookings.data, p.id, now, rules)
  // Already checked in here: scanning again means "I am still here", in the
  // same seat (the server extends the time).
  const here = current.data && current.data.place_id === p.id ? current.data : null
  // A check-in somewhere else ends when this one starts: say so first, so a
  // link sent by someone else cannot move the student without them noticing.
  const elsewhere = current.data && current.data.place_id !== p.id ? current.data : null
  const choosesSeat = p.kind === 'computer_lab' && booking === null && here === null
  const ready = !choosesSeat || seatId !== null

  async function confirm() {
    const seat = here ? here.seat_id : choosesSeat ? seatId : null
    const done = await action.run(() => checkIn(code, seat))
    if (done) {
      setResult(done)
      current.reload()
    }
  }

  return (
    <article className={styles.ticket}>
      <header className={styles.head}>
        <Photo name={KIND_PHOTO[p.kind]} variant="card" decorative className={styles.headPhoto} />
        <div className={styles.headText}>
          <span className={styles.kind}>{KIND_LABELS[p.kind]}</span>
          <h1 className={styles.title}>{p.name}</h1>
          <span className={styles.meta}>
            בניין {p.building_code} · {floorLabel(p.floor)}
          </span>
        </div>
      </header>
      <div className={styles.perforation} aria-hidden="true" />
      <div className={styles.body}>

      {result ? (
        <div className={styles.done} role="status">
          <CircleCheck aria-hidden="true" className={styles.doneIcon} />
          <strong className={styles.doneTitle}>
            נכנסת. המקום שמור לך עד {formatTime(result.expires_at, timezone)}
          </strong>
          {result.seat_label && <span className={styles.doneSeat}>תא {result.seat_label}</span>}
          {result.cut_short_by && (
            <Notice tone="warning">
              {result.cut_short_by === 'booking'
                ? 'התא מוזמן אחריך, ולכן הזמן שלך קצר יותר משעתיים.'
                : 'המקום נסגר בקרוב, ולכן הזמן שלך קצר יותר משעתיים.'}
            </Notice>
          )}
          <ButtonLink to="/me" variant="secondary" className={styles.doneLink}>
            לאזור שלי
          </ButtonLink>
        </div>
      ) : (
        <>
          {here && (
            <p className={styles.lead}>
              אתה כבר כאן{here.seat_label ? `, בתא ${here.seat_label}` : ''}, עד {formatTime(here.expires_at, timezone)}.
              {here.booking_id === null && ' אם אתה נשאר, לחץ כדי להמשיך.'}
            </p>
          )}
          {!here && booking && (
            <p className={styles.lead}>
              יש לך הזמנה{booking.seat_label ? ` לתא ${booking.seat_label}` : ''} ב-
              {formatTime(booking.starts_at, timezone)}. לחץ כדי לאשר שהגעת.
            </p>
          )}
          {elsewhere && (
            <Notice tone="warning">
              הכניסה שלך ב-{elsewhere.place_name}
              {elsewhere.seat_label && `, תא ${elsewhere.seat_label}`} תסתיים כשתאשר כאן.
            </Notice>
          )}
          {p.kind === 'group_room' && !booking && !here && (
            <Notice tone="warning">לחדר נכנסים רק עם הזמנה, מעשר דקות לפני שהיא מתחילה.</Notice>
          )}
          {choosesSeat && p.seats && p.lab_rows && p.lab_cols && (
            <>
              <p className={styles.lead}>בחר תא פנוי. התאים הפנויים הם כפתורים ירוקים.</p>
              <SeatGrid
                seats={p.seats}
                rows={p.lab_rows}
                cols={p.lab_cols}
                placeOpen={p.is_open}
                timeZone={timezone}
                canSelect={(s) => s.free_now}
                selectedId={seatId}
                onSelect={(s) => setSeatId(s.id)}
              />
            </>
          )}
          <Button size="lg" block disabled={!ready} busy={action.busy} onClick={() => void confirm()}>
            {here ? 'אני עדיין כאן' : 'אני כאן'}
          </Button>
        </>
      )}
      {action.error && <Notice tone="error">{action.error}</Notice>}
      </div>
    </article>
  )
}
