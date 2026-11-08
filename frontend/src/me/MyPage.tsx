// "My area": where I am checked in now, where to study between my classes,
// my bookings, my timetable, my favourite places, and my account.

import { CalendarX2, Coffee, LogOut, MapPin, ScanLine, Star, Timer } from 'lucide-react'
import { InstallTip } from '../components/InstallTip'
import { CalendarFeedCard } from './CalendarFeed'
import { PasswordCard } from './PasswordCard'
import { PushToggle } from './PushToggle'
import { ShareStay } from './ShareStay'
import { Waitlist } from './Waitlist'
import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router'
import { getPlaces } from '../api/campus'
import { betweenClasses, cancelBooking, checkOut, extendBooking, extendOptions, goOnBreak, myCheckIn, myClasses, reportOccupied, stillHere } from '../api/student'
import { useMyBookings } from './myBookings'
import type { Alternative, Booking, CheckIn, Place } from '../api/types'
import { useAuth } from '../auth/AuthContext'
import { REFRESH_INTERVAL_MS } from '../config'
import { SpaceCard } from '../features/finder/SpaceCard'
import { useAction } from '../hooks/useAction'
import { useApi } from '../hooks/useApi'
import { useFavorites } from '../hooks/useFavorites'
import { useInstitution } from '../institution'
import { formatDay, formatTime } from '../logic/time'
import { KIND_PHOTO } from '../media/photos'
import { ActionError, Button, ButtonLink, ConfirmButton, EmptyState, ErrorState, jumpTo, LoadingRegion, Notice, Photo, Skeleton, useToast } from '../ui'
import { BetweenClasses } from './BetweenClasses'
import { Classes } from './Classes'
import styles from './me.module.css'

const STATUS_LABELS: Record<string, string> = {
  booked: 'מוזמן',
  checked_in: 'הגעה אושרה',
}

export function MyPage() {
  const { user } = useAuth()
  const { slug } = useInstitution()
  const current = useApi(myCheckIn, 'my-check-in', REFRESH_INTERVAL_MS)
  const bookings = useMyBookings()
  // For each booking's picture, and for the favourites.
  const places = useApi(() => getPlaces(slug), `places-${slug}`, REFRESH_INTERVAL_MS)
  const classes = useApi(myClasses, 'my-classes')
  // Arriving at /me#my-bookings or #my-timetable (from an error, the privacy
  // page): there, once the sections above it are drawn, once per arrival.
  const { hash } = useLocation()
  const ready = bookings.data !== null && classes.data !== null
  const jumped = useRef<string | null>(null)
  useEffect(() => {
    if (!ready || !hash || jumped.current === hash) return
    jumped.current = hash
    jumpTo(hash.slice(1))
  }, [ready, hash])
  // "Between classes" shows today, or a weekday picked (there or from a break on the grid).
  const [betweenDay, setBetweenDay] = useState<number | null>(null)
  const between = useApi(() => betweenClasses(betweenDay ?? undefined), `between-classes-${betweenDay ?? 'today'}`, REFRESH_INTERVAL_MS)

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
          {user.is_demo ? (
            <span className={styles.email}>משתמש לדוגמה, משותף לכל המבקרים. להזמנות משלך, התחבר עם החשבון שלך.</span>
          ) : (
            <span className={styles.email} dir="ltr">
              {user.email}
            </span>
          )}
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

      <BetweenClasses between={between} classes={classes.data} day={betweenDay} onDay={setBetweenDay} />

      <section id="my-bookings" tabIndex={-1} aria-label="ההזמנות שלי" className={`${styles.section} ${styles.jumpTarget}`}>
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
              <ButtonLink to={`/${slug}#finder`} variant="secondary" icon={<MapPin aria-hidden="true" />}>
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

      <Waitlist />

      <Classes
        classes={classes}
        between={between.data}
        onShowBetween={setBetweenDay}
        onChanged={() => {
          classes.reload()
          between.reload()
        }}
      />

      <Favorites places={places.data} />

      <PushToggle isDemo={user?.is_demo ?? false} />

      <CalendarFeedCard />

      <InstallTip variant="section" />

      <PasswordCard />

      <Account />
    </div>
  )
}

const STILL_HERE_OFFER_MS = 30 * 60_000
const ENDING_SOON_MS = 10 * 60_000 // the time is nearly up: say that leaving frees the place
const REPORT_FROM_MS = 30 * 60_000 // a booked room or seat can be reported taken from this long before its start...
const REPORT_UNTIL_MS = 15 * 60_000 // ...until this long after it (the arrival window, backend/app/reports.py)
const PREVIOUS_MAY_STAY_MS = 30 * 60_000 // a booked room this close to its start: the last student may still be there

// The check-in that is running: a dark card with a live dot.
function NowCard({ checkIn, onLeft }: { checkIn: CheckIn; onLeft: () => void }) {
  const { timezone } = useInstitution()
  const toast = useToast()
  const leave = useAction()
  const stay = useAction()
  const rest = useAction()
  // The clock moves on while the page is open: the offer appears near the end,
  // as the "still here?" notice does (backend/app/reminders.py).
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60_000)
    return () => clearInterval(timer)
  }, [])
  const ending = Date.parse(checkIn.expires_at) - now <= STILL_HERE_OFFER_MS
  const endingSoon = Date.parse(checkIn.expires_at) - now <= ENDING_SOON_MS
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
        {checkIn.can_break && (
          <Button
            variant="secondary"
            icon={<Coffee aria-hidden="true" />}
            busy={rest.busy}
            onClick={() =>
              void rest.run(async () => {
                const away = await goOnBreak(checkIn.id)
                toast(`המקום שמור לך עד ${formatTime(away.break_until ?? away.expires_at, timezone)}. כשחוזרים, סורקים את השלט.`, 'success')
                onLeft()
              })
            }
          >
            יוצא להפסקה
          </Button>
        )}
        {checkIn.can_extend && ending && (
          <Button
            variant="secondary"
            icon={<Timer aria-hidden="true" />}
            busy={stay.busy}
            onClick={() =>
              void stay.run(async () => {
                const longer = await stillHere(checkIn.id)
                toast(`הכניסה הוארכה עד ${formatTime(longer.expires_at, timezone)}. בפעם הבאה מאריכים בסריקה.`, 'success')
                onLeft()
              })
            }
          >
            עדיין כאן
          </Button>
        )}
        <ShareStay kind="check_in" id={checkIn.id} placeName={checkIn.place_name} />
      </div>
      {checkIn.break_until && (
        <p className={styles.endingSoon}>
          בהפסקה עד {formatTime(checkIn.break_until, timezone)}. כשחוזרים, סורקים את השלט, אחרת המקום יתפנה.
        </p>
      )}
      {endingSoon && (
        <p className={styles.endingSoon}>הזמן נגמר בקרוב. אם סיימת, אפשר ללחוץ "יציאה", והמקום יתפנה לאחרים.</p>
      )}
      <ActionError action={leave} />
      <ActionError action={stay} />
      <ActionError action={rest} />
    </>
  )
}

// Ends to offer when extending: every half hour after the current end, up
// to the latest free one, which is always offered. At most four buttons.
function extendEnds(currentEnd: string, latest: string): string[] {
  const step = 30 * 60_000
  const last = Date.parse(latest)
  const ends: string[] = []
  for (let at = Date.parse(currentEnd) + step; at < last && ends.length < 3; at += step) ends.push(new Date(at).toISOString())
  ends.push(new Date(last).toISOString())
  return ends
}

function BookingRow({ booking, place, onChange }: { booking: Booking; place: Place | undefined; onChange: () => void }) {
  const { slug, timezone, overstay_policy: policy } = useInstitution()
  const toast = useToast()
  const action = useAction()
  const report = useAction()
  const [elsewhere, setElsewhere] = useState<Alternative[] | null>(null)
  const day = formatDay(booking.starts_at, timezone)
  const time = `${formatTime(booking.starts_at, timezone)}–${formatTime(booking.ends_at, timezone)}`
  const where = `${booking.place_name}${booking.seat_label ? `, תא ${booking.seat_label}` : ''}`
  // A walk-in (sitting down without booking) is shown, but it ends by checking out.
  const canCancel = booking.status === 'booked' && booking.source === 'advance'
  const canExtend = booking.status === 'checked_in'
  // "Extend" first asks how far is free, and offers ends to choose from (the
  // live practice run, 26 Oct: it went to the longest end without asking).
  const [ends, setEnds] = useState<string[] | null>(null)
  // A booked room about to start whose last stay ended by the clock a moment ago (wave 19).
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60_000)
    return () => clearInterval(timer)
  }, [])
  const previousMayStay =
    booking.status === 'booked' && place?.maybe_still_taken === true && Date.parse(booking.starts_at) - now <= PREVIOUS_MAY_STAY_MS

  // Someone is in the room or seat that was booked (wave 19.2): sayable in the arrival window only.
  const untilStart = Date.parse(booking.starts_at) - now
  const canReport =
    policy === 'reports' && !booking.reported && booking.status === 'booked' && (place?.kind === 'group_room' || place?.kind === 'computer_lab') &&
    untilStart <= REPORT_FROM_MS && untilStart > -REPORT_UNTIL_MS

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
        {previousMayStay && <span className={styles.bookingNote}>הקודם אולי עוד לא יצא. אפשר לחכות כמה דקות.</span>}
      </div>
      <div className={styles.actions}>
        <ShareStay kind="booking" id={booking.id} placeName={booking.place_name} />
        {canExtend && ends === null && (
          <Button
            size="sm"
            busy={action.busy}
            onClick={() =>
              void action.run(async () => {
                const { latest } = await extendOptions(booking.id)
                setEnds(latest ? extendEnds(booking.ends_at, latest) : [])
              })
            }
          >
            להאריך
          </Button>
        )}
        {canReport && elsewhere === null && (
          <ConfirmButton
            size="sm"
            label="יש מישהו במקום"
            confirmLabel="כן, לדווח"
            busy={report.busy}
            onConfirm={() =>
              void report.run(async () => {
                const result = await reportOccupied(booking.id)
                setElsewhere(result.alternatives)
              })
            }
          />
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
      {elsewhere !== null && (
        <div className={styles.elsewhere}>
          <p>הדיווח נשמר למוסד, בלי שם של מי שהיה שם.</p>
          {elsewhere.length === 0 ? (
            <p>אין כרגע מקום פנוי קרוב לכל זמן ההזמנה. אפשר לחכות כמה דקות, או לחפש בדף הבית.</p>
          ) : (
            <ul aria-label="מקומות פנויים קרובים">
              {elsewhere.map((a) => (
                <li key={`${a.place_id}-${a.seat_id ?? 'room'}`}>
                  <Link to={`/${slug}/spaces/${a.place_id}`}>
                    {a.place_name}
                    {a.seat_label && `, תא ${a.seat_label}`}
                  </Link>{' '}
                  · בניין {a.building_code} · {a.walk_minutes} דקות הליכה
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      {report.error && (
        <Notice tone="error" className={styles.rowError}>
          {report.error}
        </Notice>
      )}
      {ends !== null && ends.length === 0 && (
        <Notice className={styles.rowError}>
          אין זמן פנוי להארכה: המקום מוזמן אחריך, או שהוא נסגר.{' '}
          <Button size="sm" variant="ghost" onClick={() => setEnds(null)}>
            הבנתי
          </Button>
        </Notice>
      )}
      {ends !== null && ends.length > 0 && (
        <div className={styles.actions} role="group" aria-label="עד מתי להאריך">
          {ends.map((end) => (
            <Button
              key={end}
              size="sm"
              variant="secondary"
              busy={action.busy}
              onClick={() =>
                void action.run(async () => {
                  try {
                    const longer = await extendBooking(booking.id, end)
                    toast(`הוארך עד ${formatTime(longer.ends_at, timezone)}.`, 'success')
                    setEnds(null)
                    onChange()
                  } catch (error) {
                    // Someone took the time meanwhile: offer what is free now.
                    const { latest } = await extendOptions(booking.id).catch(() => ({ latest: null }))
                    setEnds(latest ? extendEnds(booking.ends_at, latest) : [])
                    throw error
                  }
                })
              }
            >
              עד {formatTime(end, timezone)}
            </Button>
          ))}
          <Button size="sm" variant="ghost" onClick={() => setEnds(null)}>
            לא עכשיו
          </Button>
        </div>
      )}
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
  const { user, logout, logoutAll, deleteAccount } = useAuth()
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
        {/* The demo users are shared by every visitor: not theirs to delete. */}
        {!user?.is_demo && (
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
        )}
      </div>
      <p className={styles.privacyNote}>
        {!user?.is_demo && 'המחיקה כוללת את ההזמנות והכניסות שלך, ואי אפשר לבטל אותה. '}
        <Link to="/privacy">מדיניות הפרטיות</Link>
      </p>
      <ActionError action={account} />
    </section>
  )
}
