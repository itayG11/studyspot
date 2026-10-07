// "My area": where I am checked in now, my bookings, and my account.

import type { CSSProperties } from 'react'
import { Link, useNavigate } from 'react-router'
import { cancelBooking, checkOut, extendBooking, myBookings, myCheckIn } from '../api/student'
import type { Booking } from '../api/types'
import { useAuth } from '../auth/AuthContext'
import { ConfirmButton } from '../components/ConfirmButton'
import { LoadError } from '../components/LoadError'
import { BuildingTile } from '../components/ui/BuildingTile'
import { REFRESH_INTERVAL_MS } from '../config'
import { useAction } from '../hooks/useAction'
import { useApi } from '../hooks/useApi'
import { useInstitution } from '../institution'
import { formatDay, formatTime } from '../logic/time'
import styles from './me.module.css'

const STATUS_LABELS: Record<string, string> = {
  booked: 'מוזמן',
  checked_in: 'הגעה אושרה',
}

export function MyPage() {
  const { user, logout, logoutAll } = useAuth()
  const { timezone } = useInstitution()
  const navigate = useNavigate()
  const current = useApi(myCheckIn, 'my-check-in', REFRESH_INTERVAL_MS)
  const bookings = useApi(myBookings, 'my-bookings', REFRESH_INTERVAL_MS)
  const leave = useAction()
  const account = useAction()

  if (!user) return null
  const checkIn = current.data

  return (
    <div className={styles.page}>
      <section className={`panel ${styles.who} rise`}>
        <div>
          <h1>{user.display_name}</h1>
          <span className={styles.email}>{user.email}</span>
        </div>
        <Link to="/scan" className="button" viewTransition>
          לסרוק קוד
        </Link>
      </section>

      <section aria-label="עכשיו" className="rise" style={{ '--i': 1 } as CSSProperties}>
        <h2>עכשיו</h2>
        {current.error && <LoadError error={current.error} onRetry={current.reload} inline />}
        {current.loading && <p className="hint">טוען…</p>}
        {!current.loading && !checkIn && <p className="hint">אין לך כניסה פעילה.</p>}
        {checkIn && (
          <div className={styles.now}>
            <span className={styles.liveDot} aria-hidden="true" />
            <div className={styles.nowText}>
              <strong>
                {checkIn.place_name}
                {checkIn.seat_label && `, תא ${checkIn.seat_label}`} · בניין {checkIn.building_code}
              </strong>
              <span className={styles.nowTime}>עד {formatTime(checkIn.expires_at, timezone)}</span>
            </div>
            <button
              type="button"
              className="button button-secondary"
              style={{ color: 'var(--paper)', borderColor: 'var(--paper)' }}
              disabled={leave.busy}
              onClick={() =>
                void leave.run(async () => {
                  await checkOut(checkIn.id)
                  current.reload()
                  bookings.reload()
                })
              }
            >
              יציאה
            </button>
          </div>
        )}
        {leave.error && <p className="error" role="alert">{leave.error}</p>}
      </section>

      <section aria-label="ההזמנות שלי" className="rise" style={{ '--i': 2 } as CSSProperties}>
        <h2>ההזמנות שלי</h2>
        {bookings.error && <LoadError error={bookings.error} onRetry={bookings.reload} inline />}
        {bookings.data?.length === 0 && (
          <p className="hint">
            אין לך הזמנות. אפשר להזמין חדר או תא <Link to="/places">מרשימת המקומות</Link>.
          </p>
        )}
        {bookings.data && bookings.data.length > 0 && (
          <ul className={styles.list}>
            {bookings.data.map((booking) => (
              <BookingRow
                key={booking.id}
                booking={booking}
                timeZone={timezone}
                onChange={() => {
                  bookings.reload()
                  current.reload()
                }}
              />
            ))}
          </ul>
        )}
      </section>

      <section aria-label="החשבון" className="rise" style={{ '--i': 3 } as CSSProperties}>
        <h2>החשבון</h2>
        <div className={styles.account}>
          <button
            type="button"
            className="button button-secondary"
            disabled={account.busy}
            onClick={() =>
              void account.run(async () => {
                await logout()
                navigate('/', { replace: true })
              })
            }
          >
            התנתקות
          </button>
          <ConfirmButton
            label="להתנתק מכל המכשירים"
            confirmLabel="כן, מכל המכשירים"
            disabled={account.busy}
            onConfirm={() =>
              void account.run(async () => {
                await logoutAll()
                navigate('/', { replace: true })
              })
            }
          />
        </div>
        {account.error && <p className="error" role="alert">{account.error}</p>}
      </section>
    </div>
  )
}

function BookingRow({ booking, timeZone, onChange }: { booking: Booking; timeZone: string; onChange: () => void }) {
  const action = useAction()
  const when = `${formatDay(booking.starts_at, timeZone)} · ${formatTime(booking.starts_at, timeZone)}–${formatTime(booking.ends_at, timeZone)}`
  const where = `${booking.place_name}${booking.seat_label ? `, תא ${booking.seat_label}` : ''}`
  // A walk-in (sitting down without booking) is shown, but it ends by checking out.
  const canCancel = booking.status === 'booked' && booking.source === 'advance'
  const canExtend = booking.status === 'checked_in'

  return (
    <li className={styles.booking} aria-label={`הזמנה: ${where}, ${when}`}>
      <BuildingTile code={booking.building_code} level="low" />
      <div className={styles.bookingText}>
        <span className={styles.bookingTitle}>{where}</span>
        <span className={styles.bookingWhen}>{when}</span>
        <span className="badge badge-open">{STATUS_LABELS[booking.status] ?? booking.status}</span>
      </div>
      <div className={styles.actions}>
        {canExtend && (
          <button
            type="button"
            className="button"
            disabled={action.busy}
            onClick={() =>
              void action.run(async () => {
                await extendBooking(booking.id)
                onChange()
              })
            }
          >
            להאריך
          </button>
        )}
        {canCancel && (
          <ConfirmButton
            label="לבטל"
            confirmLabel="כן, לבטל"
            disabled={action.busy}
            onConfirm={() =>
              void action.run(async () => {
                await cancelBooking(booking.id)
                onChange()
              })
            }
          />
        )}
      </div>
      {action.error && (
        <p className={`error ${styles.rowError}`} role="alert">
          {action.error}
        </p>
      )}
    </li>
  )
}
