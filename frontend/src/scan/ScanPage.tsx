// /scan?c=<code>: the address inside the QR code on each place's sign.
// The phone's own camera opens it; the student confirms with one button.
// In a computer lab without a booking, the student first picks a free
// station. The code is taken out of the address at once, so it does not
// stay in the browser's history.

import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { getPlace } from '../api/campus'
import { checkIn, myBookings } from '../api/student'
import type { CheckIn } from '../api/types'
import { LoadError } from '../components/LoadError'
import { SeatGrid } from '../components/SeatGrid'
import { BuildingTile } from '../components/ui/BuildingTile'
import { useAction } from '../hooks/useAction'
import { useApi } from '../hooks/useApi'
import { errorMessage } from '../i18n/errors'
import { floorLabel, KIND_LABELS } from '../i18n/labels'
import { useInstitution } from '../institution'
import { bookingToConfirm } from '../logic/bookings'
import { cleanCode, placeIdFromCode } from '../logic/codes'
import { placeLevel } from '../logic/occupancy'
import { formatTime } from '../logic/time'
import styles from './scan.module.css'

export function ScanPage() {
  const [params, setParams] = useSearchParams()
  // Read once; the address is then cleaned (the effect below).
  const [code, setCode] = useState<string | null>(() => params.get('c'))
  useEffect(() => {
    if (params.has('c')) setParams({}, { replace: true })
  }, [params, setParams])

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
  const place = useApi(() => getPlace(placeId), `scan-place-${placeId}`)
  const bookings = useApi(myBookings, 'my-bookings')
  const [now] = useState(() => new Date())
  const [seatId, setSeatId] = useState<number | null>(null)
  const [result, setResult] = useState<CheckIn | null>(null)
  const action = useAction()

  if (place.error) return <LoadError error={place.error} onRetry={place.reload} />
  if (!place.data || !bookings.data) return <p className="page-message">טוען…</p>

  const p = place.data
  const booking = bookingToConfirm(bookings.data, p.id, now, rules)
  const choosesSeat = p.kind === 'computer_lab' && booking === null
  const ready = !choosesSeat || seatId !== null

  async function confirm() {
    const done = await action.run(() => checkIn(code, choosesSeat ? seatId : null))
    if (done) setResult(done)
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
          {booking && (
            <p>
              יש לך הזמנה{booking.seat_label ? ` לתא ${booking.seat_label}` : ''} ב-
              {formatTime(booking.starts_at, timezone)}. לחץ כדי לאשר שהגעת.
            </p>
          )}
          {p.kind === 'group_room' && !booking && (
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
            אני כאן
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
