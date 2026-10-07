// Booking a group room, or one computer-lab station, ahead of time.
// Three steps: the day, the start time, and how long. The board shows the
// day's slots; booked and past ones cannot be chosen.

import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router'
import type { BookingRules, PlaceDetail, Seat } from '../api/types'
import { createBooking, getAvailability } from '../api/student'
import { useAuth } from '../auth/AuthContext'
import { LoadError } from '../components/LoadError'
import { useAction } from '../hooks/useAction'
import { useApi } from '../hooks/useApi'
import { durationLabel } from '../i18n/labels'
import { bookableDays, daySlots, durationsFrom, type Slot } from '../logic/slots'
import { formatTime, weekdayName } from '../logic/time'
import { weekdayOfDate } from '../logic/zoned'
import styles from './booking.module.css'

interface Props {
  place: PlaceDetail
  seat: Seat | null // the chosen lab station; null for a whole room
  rules: BookingRules
  timeZone: string
}

const MINUTE = 60_000

export function BookingPanel({ place, seat, rules, timeZone }: Props) {
  const { status } = useAuth()
  const location = useLocation()
  // The clock moves on: past slots close while the page is open.
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), MINUTE)
    return () => clearInterval(timer)
  }, [])

  const days = bookableDays(now, place.opening_hours, rules, timeZone)
  const [chosenDay, setDay] = useState<string | null>(null)
  const day = chosenDay && days.includes(chosenDay) ? chosenDay : (days[0] ?? null)
  const [picked, setSlot] = useState<Slot | null>(null)
  const [minutes, setMinutes] = useState<number | null>(null)
  const [booked, setBooked] = useState<string | null>(null)
  const action = useAction()

  const availability = useApi(
    () => getAvailability(place.id, day!),
    day ? `availability-${place.id}-${day}` : null,
  )
  const seatId = seat?.id ?? null
  const slots = day && availability.data
    ? daySlots({ date: day, hours: place.opening_hours, busy: availability.data.busy, seatId, now, rules, timeZone })
    : []
  // The chosen slot as it is now: it may have become past (the clock moved)
  // or booked (after a refresh); then it is no longer chosen.
  const slot = picked ? (slots.find((s) => s.start === picked.start && s.state === 'free') ?? null) : null
  const lengths = slot ? durationsFrom(slot, rules) : []
  const upcoming = slots.filter((s) => s.state !== 'past')

  function choose(next: Slot | null) {
    setSlot(next)
    setMinutes(null)
    setBooked(null)
    action.clearError()
  }

  async function book() {
    if (!slot || !minutes) return
    const ends = new Date(Date.parse(slot.start) + minutes * MINUTE).toISOString()
    const result = await action.run(() =>
      createBooking({ place_id: place.id, seat_id: seatId, starts_at: slot.start, ends_at: ends }),
    )
    if (result) {
      setBooked(`${slot.label}–${formatTime(ends, timeZone)}`)
      setSlot(null)
      setMinutes(null)
      availability.reload()
    }
  }

  if (days.length === 0) return <p className="hint">המקום סגור בכל הימים הקרובים.</p>

  return (
    <div className={styles.panel}>
      <div className={styles.step}>
        <h3 className={styles.stepTitle} data-step="1">יום</h3>
        <div className={styles.days} role="group" aria-label="יום">
          {days.map((d) => (
            <button
              key={d}
              type="button"
              className={styles.day}
              aria-pressed={d === day}
              onClick={() => {
                setDay(d)
                choose(null)
              }}
            >
              <span className={styles.dayName}>{weekdayName(weekdayOfDate(d))}</span>
              <span className={styles.dayDate}>{`${d.slice(8, 10)}/${d.slice(5, 7)}`}</span>
            </button>
          ))}
        </div>
      </div>

      <div className={styles.step}>
        <h3 className={styles.stepTitle} data-step="2">
          שעת התחלה{seat && ` · תא ${seat.label}`}
        </h3>
        {availability.error && <LoadError error={availability.error} onRetry={availability.reload} inline />}
        {availability.loading && <p className="hint">טוען את הזמנים…</p>}
        {availability.data && upcoming.length === 0 && <p className="hint">לא נשארו היום שעות להזמנה. בחר יום אחר.</p>}
        {availability.data && upcoming.length > 0 && (
          <div className={styles.board} role="group" aria-label="שעת התחלה">
            {upcoming.map((s) => (
              <button
                key={s.start}
                type="button"
                className={styles.time}
                disabled={s.state !== 'free'}
                title={s.state === 'tooFar' ? 'עוד אי אפשר להזמין כל כך רחוק מראש' : undefined}
                aria-pressed={s.start === slot?.start}
                onClick={() => choose(s)}
              >
                {s.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {slot && (
        <div className={`${styles.step} rise`}>
          <h3 className={styles.stepTitle} data-step="3">כמה זמן</h3>
          <div className={styles.lengths} role="group" aria-label="אורך">
            {lengths.map((m) => (
              <button
                key={m}
                type="button"
                className={styles.length}
                aria-pressed={m === minutes}
                onClick={() => setMinutes(m)}
              >
                {durationLabel(m)}
              </button>
            ))}
          </div>
        </div>
      )}

      {slot && minutes && (
        <div className={`${styles.ticket} rise`}>
          <span className={styles.ticketText}>
            {place.name}
            {seat && `, תא ${seat.label}`} ·{' '}
            <span className={styles.ticketTime}>
              {slot.label}–{formatTime(new Date(Date.parse(slot.start) + minutes * MINUTE).toISOString(), timeZone)}
            </span>
          </span>
          {status === 'signed-in' ? (
            <button type="button" className="button" disabled={action.busy} onClick={() => void book()}>
              להזמין
            </button>
          ) : (
            <Link className="button" to={`/login?next=${encodeURIComponent(location.pathname)}`}>
              להתחבר כדי להזמין
            </Link>
          )}
        </div>
      )}

      {action.error && <p className="error" role="alert">{action.error}</p>}
      {booked && (
        <p className={styles.success} role="status">
          ההזמנה נקלטה: {booked}. כשתגיע, סרוק את הקוד שבמקום. <Link to="/me">להזמנות שלי</Link>
        </p>
      )}
    </div>
  )
}
