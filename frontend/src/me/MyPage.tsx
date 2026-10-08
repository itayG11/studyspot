// "My area": where I am checked in now, my bookings, my favourite places,
// and my account.

import { CalendarX2, LogOut, MapPin, ScanLine, Star } from 'lucide-react'
import { Link, useNavigate } from 'react-router'
import { getPlaces } from '../api/campus'
import { cancelBooking, checkOut, extendBooking, myBookings, myCheckIn } from '../api/student'
import type { Booking, CheckIn, Place } from '../api/types'
import { useAuth } from '../auth/AuthContext'
import { REFRESH_INTERVAL_MS } from '../config'
import { SpaceCard } from '../features/finder/SpaceCard'
import { useAction } from '../hooks/useAction'
import { useApi } from '../hooks/useApi'
import { useFavorites } from '../hooks/useFavorites'
import { useInstitution } from '../institution'
import { formatDay, formatTime } from '../logic/time'
import { KIND_PHOTO } from '../media/photos'
import { Button, ButtonLink, ConfirmButton, EmptyState, ErrorState, LoadingRegion, Notice, Photo, Skeleton, useToast } from '../ui'
import styles from './me.module.css'

const STATUS_LABELS: Record<string, string> = {
  booked: 'מוזמן',
  checked_in: 'הגעה אושרה',
}

export function MyPage() {
  const { user } = useAuth()
  const current = useApi(myCheckIn, 'my-check-in', REFRESH_INTERVAL_MS)
  const bookings = useApi(myBookings, 'my-bookings', REFRESH_INTERVAL_MS)
  // For each booking's picture, and for the favourites.
  const places = useApi(() => getPlaces(), 'places', REFRESH_INTERVAL_MS)

  if (!user) return null
  const byId = new Map((places.data ?? []).map((place) => [place.id, place]))
  const reloadAll = () => {
    current.reload()
    bookings.reload()
  }

  return (
    <div className={styles.page}>
      <header className={styles.who}>
        <div>
          <p className={styles.eyebrow}>האזור שלי</p>
          <h1 className={styles.name}>{user.display_name}</h1>
          <span className={styles.email} dir="ltr">
            {user.email}
          </span>
        </div>
        <ButtonLink to="/scan" icon={<ScanLine aria-hidden="true" />} viewTransition>
          לסרוק קוד
        </ButtonLink>
      </header>

      <section aria-label="עכשיו" className={styles.section}>
        <h2 className={styles.heading}>עכשיו</h2>
        {current.error && <ErrorState error={current.error} onRetry={current.reload} compact />}
        {current.loading && (
          <LoadingRegion>
            <Skeleton height="96px" radius="var(--r-lg)" />
          </LoadingRegion>
        )}
        {!current.loading && !current.error && !current.data && (
          <div className={styles.idle}>
            <p className={styles.idleTitle}>אין לך כניסה פעילה.</p>
            <p className={styles.idleText}>כשמגיעים למקום, סורקים את הקוד שעל השלט.</p>
          </div>
        )}
        {current.data && <NowCard checkIn={current.data} onLeft={reloadAll} />}
      </section>

      <section aria-label="ההזמנות שלי" className={styles.section}>
        <h2 className={styles.heading}>ההזמנות שלי</h2>
        {bookings.error && <ErrorState error={bookings.error} onRetry={bookings.reload} compact />}
        {bookings.loading && (
          <LoadingRegion>
            <div className={styles.skeletons}>
              <Skeleton height="104px" radius="var(--r-lg)" />
              <Skeleton height="104px" radius="var(--r-lg)" />
            </div>
          </LoadingRegion>
        )}
        {bookings.data?.length === 0 && (
          <EmptyState
            icon={<CalendarX2 />}
            title="אין לך הזמנות"
            action={
              <ButtonLink to="/#finder" variant="secondary" icon={<MapPin aria-hidden="true" />}>
                לחיפוש מקום
              </ButtonLink>
            }
          >
            אפשר להזמין חדר קבוצתי או תא מחשב מדף המקום.
          </EmptyState>
        )}
        {bookings.data && bookings.data.length > 0 && (
          <ul className={styles.bookings}>
            {bookings.data.map((booking) => (
              <BookingRow key={booking.id} booking={booking} place={byId.get(booking.place_id)} onChange={reloadAll} />
            ))}
          </ul>
        )}
      </section>

      <Favorites places={places.data} />

      <Account />
    </div>
  )
}

// The check-in that is running: a dark card with a live dot.
function NowCard({ checkIn, onLeft }: { checkIn: CheckIn; onLeft: () => void }) {
  const { timezone } = useInstitution()
  const toast = useToast()
  const leave = useAction()
  return (
    <>
      <div className={styles.now}>
        <span className={styles.liveDot} aria-hidden="true" />
        <div className={styles.nowText}>
          <strong className={styles.nowPlace}>
            {checkIn.place_name}
            {checkIn.seat_label && `, תא ${checkIn.seat_label}`}
          </strong>
          <span className={styles.nowMeta}>
            בניין {checkIn.building_code} · <span className={styles.num}>עד {formatTime(checkIn.expires_at, timezone)}</span>
          </span>
        </div>
        <Button
          variant="secondary"
          icon={<LogOut aria-hidden="true" />}
          busy={leave.busy}
          onClick={() =>
            void leave.run(async () => {
              await checkOut(checkIn.id)
              toast(`יצאת מ-${checkIn.place_name}. המקום פנוי לאחרים.`, 'success')
              onLeft()
            })
          }
        >
          יציאה
        </Button>
      </div>
      {leave.error && <Notice tone="error">{leave.error}</Notice>}
    </>
  )
}

function BookingRow({ booking, place, onChange }: { booking: Booking; place: Place | undefined; onChange: () => void }) {
  const { timezone } = useInstitution()
  const toast = useToast()
  const action = useAction()
  const day = formatDay(booking.starts_at, timezone)
  const time = `${formatTime(booking.starts_at, timezone)}–${formatTime(booking.ends_at, timezone)}`
  const where = `${booking.place_name}${booking.seat_label ? `, תא ${booking.seat_label}` : ''}`
  // A walk-in (sitting down without booking) is shown, but it ends by checking out.
  const canCancel = booking.status === 'booked' && booking.source === 'advance'
  const canExtend = booking.status === 'checked_in'

  return (
    <li className={styles.booking} aria-label={`הזמנה: ${where}, ${day} ${time}`}>
      <div className={styles.thumb}>
        {place && <Photo name={KIND_PHOTO[place.kind]} variant="card" decorative label={false} className={styles.thumbPhoto} />}
      </div>
      <div className={styles.bookingText}>
        <span className={booking.status === 'checked_in' ? `${styles.status} ${styles.statusIn}` : styles.status}>
          {STATUS_LABELS[booking.status] ?? booking.status}
        </span>
        <span className={styles.bookingTitle}>{where}</span>
        <span className={styles.bookingWhen}>
          {day} · <span className={styles.num}>{time}</span>
        </span>
      </div>
      <div className={styles.actions}>
        {canExtend && (
          <Button
            size="sm"
            busy={action.busy}
            onClick={() =>
              void action.run(async () => {
                const longer = await extendBooking(booking.id)
                toast(`הוארך עד ${formatTime(longer.ends_at, timezone)}.`, 'success')
                onChange()
              })
            }
          >
            להאריך
          </Button>
        )}
        {canCancel && (
          <ConfirmButton
            size="sm"
            label="לבטל"
            confirmLabel="כן, לבטל"
            busy={action.busy}
            onConfirm={() =>
              void action.run(async () => {
                await cancelBooking(booking.id)
                toast(`ההזמנה ל-${where} בוטלה.`, 'success')
                onChange()
              })
            }
          />
        )}
      </div>
      {action.error && (
        <Notice tone="error" className={styles.rowError}>
          {action.error}
        </Notice>
      )}
    </li>
  )
}

// Kept on this device only (see logic/favorites.ts).
function Favorites({ places }: { places: Place[] | null }) {
  const { favorites: ids } = useFavorites()
  if (places === null) return null // the bookings above already say if loading failed
  const favorites = places.filter((place) => ids.includes(place.id))
  return (
    <section aria-label="המועדפים" className={styles.section}>
      <h2 className={styles.heading}>המועדפים</h2>
      {favorites.length === 0 ? (
        <div className={styles.idle}>
          <p className={styles.idleTitle}>
            <Star aria-hidden="true" className={styles.idleIcon} /> אין עדיין מועדפים.
          </p>
          <p className={styles.idleText}>לוחצים על הכוכב בכרטיס של מקום, והוא יופיע כאן. המועדפים נשמרים במכשיר הזה.</p>
        </div>
      ) : (
        <ul className={styles.favorites}>
          {favorites.map((place) => (
            <SpaceCard key={place.id} place={place} />
          ))}
        </ul>
      )}
    </section>
  )
}

function Account() {
  const { logout, logoutAll, deleteAccount } = useAuth()
  const navigate = useNavigate()
  const account = useAction()
  return (
    <section aria-label="החשבון" className={styles.section}>
      <h2 className={styles.heading}>החשבון</h2>
      <div className={styles.account}>
        <Button
          variant="secondary"
          icon={<LogOut aria-hidden="true" />}
          busy={account.busy}
          onClick={() =>
            void account.run(async () => {
              await logout()
              navigate('/', { replace: true })
            })
          }
        >
          התנתקות
        </Button>
        <ConfirmButton
          label="להתנתק מכל המכשירים"
          confirmLabel="כן, מכל המכשירים"
          busy={account.busy}
          onConfirm={() =>
            void account.run(async () => {
              await logoutAll()
              navigate('/', { replace: true })
            })
          }
        />
        <ConfirmButton
          label="מחיקת החשבון שלי"
          confirmLabel="כן, למחוק את כל המידע שלי"
          busy={account.busy}
          onConfirm={() =>
            void account.run(async () => {
              await deleteAccount()
              navigate('/', { replace: true })
            })
          }
        />
      </div>
      <p className={styles.privacyNote}>
        המחיקה כוללת את ההזמנות והכניסות שלך, ואי אפשר לבטל אותה. <Link to="/privacy">מדיניות הפרטיות</Link>
      </p>
      {account.error && <Notice tone="error">{account.error}</Notice>}
    </section>
  )
}
