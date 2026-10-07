// /scan#c=<code>: the address inside the QR code on each place's sign.
// The phone's own camera opens it; the student confirms with one button.
// In a computer lab without a booking, the student first picks a free
// station. The code is taken out of the address at once, so it does not
// stay in the browser's history; a student who must sign in first finds
// it waiting afterwards (pendingCode.ts).

import { useEffect, useState } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router'
import { getPlace } from '../api/campus'
import { checkIn, myBookings, myCheckIn } from '../api/student'
import { useAuth } from '../auth/AuthContext'
import type { CheckIn } from '../api/types'
import { LoadError } from '../components/LoadError'
import { SeatGrid } from '../components/SeatGrid'
import { BuildingTile } from '../components/ui/BuildingTile'
import { REFRESH_INTERVAL_MS } from '../config'
import { useAction } from '../hooks/useAction'
import { useApi } from '../hooks/useApi'
import { errorMessage } from '../i18n/errors'
import { floorLabel, KIND_LABELS } from '../i18n/labels'
import { useInstitution } from '../institution'
import { bookingToConfirm } from '../logic/bookings'
import { cleanCode, codeFromHash, placeIdFromCode } from '../logic/codes'
import { placeLevel } from '../logic/occupancy'
import { formatTime } from '../logic/time'
import { clearPendingCode, peekPendingCode, rememberPendingCode } from './pendingCode'
import styles from './scan.module.css'

export function ScanPage() {
  const { status } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  // Read once, from the address or from a scan made before signing in.
  const [code, setCode] = useState<string | null>(() => codeFromHash(location.hash) ?? peekPendingCode())

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

  if (status === 'loading') return <p className="page-message">בודק התחברות…</p>
  if (status === 'signed-out') return <Navigate to={`/login?next=${encodeURIComponent('/scan')}`} replace />
  if (code === null) return <CodeForm onCode={setCode} />
  const placeId = placeIdFromCode(code)
  if (placeId === null) {
    return (
      <section className={styles.ticket}>
        <p className="error" role="alert">
          {errorMessage('invalid_code')}
        </p>
        <button type="button" className="link-button" onClick={() => setCode(null)}>
          להקליד קוד
        </button>
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
      <h1>כניסה למקום</h1>
      <p className="hint">סרוק את הקוד שעל השלט במצלמת הטלפון. אם זה לא עובד, אפשר להדביק את הקוד כאן.</p>
      <label htmlFor="code">הקוד מהשלט</label>
      <input id="code" className={styles.input} value={text} onChange={(e) => setText(e.target.value)} autoComplete="off" />
      <button type="submit" className="button" disabled={text.trim() === ''}>
        המשך
      </button>
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
      <LoadError
        error={failed}
        onRetry={() => {
          place.reload()
          bookings.reload()
          current.reload()
        }}
      />
    )
  }
  if (!place.data || !bookings.data || current.loading) return <p className="page-message">טוען…</p>

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
        <BuildingTile code={p.building_code} level={placeLevel(p)} large />
        <div>
          <span className="tag">{KIND_LABELS[p.kind]}</span>
          <h1>{p.name}</h1>
          <span className={styles.meta}>
            בניין {p.building_code} · {floorLabel(p.floor)}
          </span>
        </div>
      </header>

      {result ? (
        <div className={styles.done} role="status">
          <strong>
            נכנסת. המקום שמור לך עד {formatTime(result.expires_at, timezone)}
          </strong>
          {result.seat_label && <span>תא {result.seat_label}</span>}
          {result.cut_short_by && (
            <span className={styles.warning}>
              {result.cut_short_by === 'booking'
                ? 'התא מוזמן אחריך, ולכן הזמן שלך קצר יותר משעתיים.'
                : 'המקום נסגר בקרוב, ולכן הזמן שלך קצר יותר משעתיים.'}
            </span>
          )}
          <Link to="/me">לאזור שלי</Link>
        </div>
      ) : (
        <>
          {here && (
            <p>
              אתה כבר כאן{here.seat_label ? `, בתא ${here.seat_label}` : ''}, עד {formatTime(here.expires_at, timezone)}.
              {here.booking_id === null && ' אם אתה נשאר, לחץ כדי להמשיך.'}
            </p>
          )}
          {!here && booking && (
            <p>
              יש לך הזמנה{booking.seat_label ? ` לתא ${booking.seat_label}` : ''} ב-
              {formatTime(booking.starts_at, timezone)}. לחץ כדי לאשר שהגעת.
            </p>
          )}
          {elsewhere && (
            <p className={styles.warning}>
              הכניסה שלך ב-{elsewhere.place_name}
              {elsewhere.seat_label && `, תא ${elsewhere.seat_label}`} תסתיים כשתאשר כאן.
            </p>
          )}
          {p.kind === 'group_room' && !booking && !here && (
            <p className={styles.warning}>לחדר נכנסים רק עם הזמנה, מעשר דקות לפני שהיא מתחילה.</p>
          )}
          {choosesSeat && p.seats && p.lab_rows && p.lab_cols && (
            <>
              <p className="hint">בחר תא פנוי (ירוק).</p>
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
          <button
            type="button"
            className={`button ${styles.confirm}`}
            disabled={!ready || action.busy}
            onClick={() => void confirm()}
          >
            {here ? 'אני עדיין כאן' : 'אני כאן'}
          </button>
        </>
      )}
      {action.error && (
        <p className="error" role="alert">
          {action.error}
        </p>
      )}
    </article>
  )
}
