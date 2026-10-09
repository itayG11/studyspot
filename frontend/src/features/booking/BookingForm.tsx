// Booking a group room, or one computer-lab station, ahead of time.
// Three steps: the day, the start time, how long. Then a summary and one
// button. The server checks every rule again; this only offers what fits.
//
// A clash: if someone books the same time a moment earlier, the database
// refuses the second booking (the exclusion constraint). The page then says
// so plainly, reloads the day and offers the nearest free start that still
// fits the same length.

import { CalendarClock } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useLocation } from 'react-router'
import type { Booking, BookingRules, PlaceDetail, Seat } from '../../api/types'
import { createBooking, getAvailability } from '../../api/student'
import { useAuth } from '../../auth/AuthContext'
import { useAction } from '../../hooks/useAction'
import { useApi } from '../../hooks/useApi'
import { durationLabel } from '../../i18n/labels'
import { bookableDays, daySlots, durationsFrom, type Slot } from '../../logic/slots'
import { formatTime, weekdayName } from '../../logic/time'
import { nearestFree } from '../../logic/timeline'
import { weekdayOfDate } from '../../logic/zoned'
import { Button, ButtonLink, Chip, ErrorState } from '../../ui'
import { Ticket } from './Ticket'
import styles from './booking.module.css'

interface Props {
  place: PlaceDetail
  seat: Seat | null // the chosen lab station; null for a whole room
  rules: BookingRules
  timeZone: string
  // The confirmed booking lives with the page, not here: the form is built
  // again when the layout changes (a tablet turned, side panel to sheet),
  // and the ticket must survive that.
  booked: Booking | null
  onBooked: (booking: Booking | null) => void
}

const MINUTE = 60_000

export function BookingForm({ place, seat, rules, timeZone, booked, onBooked }: Props) {
  const { status, user } = useAuth()
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
  // seen: the times on screen when the clash happened. They are stale (the
  // taken time still looks free), so nothing is offered until fresh ones come.
  const [clash, setClash] = useState<{ from: string; minutes: number; seen: unknown } | null>(null)
  const action = useAction()

  const availability = useApi(() => getAvailability(place.id, day!), day ? `availability-${place.id}-${day}` : null)
  const seatId = seat?.id ?? null
  const slots =
    day && availability.data
      ? daySlots({ date: day, hours: place.opening_hours, busy: availability.data.busy, seatId, now, rules, timeZone })
      : []
  // The chosen slot as it is now: it may have become past (the clock moved)
  // or booked (after a refresh); then it is no longer chosen.
  const slot = picked ? (slots.find((s) => s.start === picked.start && s.state === 'free') ?? null) : null
  const lengths = slot ? durationsFrom(slot, rules) : []
  const upcoming = slots.filter((s) => s.state !== 'past')
  const checking = clash !== null && availability.data === clash.seen
  const suggestion = clash && !checking ? nearestFree(slots, clash.from, clash.minutes) : null
  const endOf = (start: string, length: number) => new Date(Date.parse(start) + length * MINUTE).toISOString()

  function choose(next: Slot | null, length: number | null = null) {
    setSlot(next)
    setMinutes(length)
    setClash(null)
    action.clearError()
  }

  async function book() {
    if (!slot || !minutes) return
    const request = { place_id: place.id, seat_id: seatId, starts_at: slot.start, ends_at: endOf(slot.start, minutes) }
    const result = await action.run(
      () => createBooking(request),
      (code) => {
        if (code !== 'slot_taken') return
        setClash({ from: slot.start, minutes, seen: availability.data })
        setSlot(null)
        availability.reload()
      },
    )
    if (result) {
      onBooked(result)
      setSlot(null)
      setMinutes(null)
      availability.reload()
    }
  }

  if (booked) {
    return (
      <Ticket
        booking={booked}
        floor={place.floor}
        timeZone={timeZone}
        arriveEarlyMinutes={rules.arrive_early_minutes}
        onAnother={() => onBooked(null)}
      />
    )
  }
  // The server would refuse at the last step (other_institution); say it first.
  if (user && user.institution_slug !== place.institution_slug) {
    return <p className={styles.hint}>רק סטודנטים של המוסד הזה יכולים להזמין כאן.</p>
  }
  if (days.length === 0) return <p className={styles.hint}>המקום סגור בכל הימים הקרובים.</p>

  return (
    <div className={styles.form}>
      <fieldset className={styles.step}>
        <legend className={styles.stepTitle}>
          <span className={styles.stepNumber}>1</span> יום
        </legend>
        <div className={styles.row} role="group" aria-label="יום">
          {days.map((d) => (
            <Chip
              key={d}
              selected={d === day}
              className={styles.dayChip}
              onClick={() => {
                setDay(d)
                choose(null)
              }}
            >
              {weekdayName(weekdayOfDate(d))} <span className={styles.date}>{`${d.slice(8, 10)}/${d.slice(5, 7)}`}</span>
            </Chip>
          ))}
        </div>
      </fieldset>

      <fieldset className={styles.step}>
        <legend className={styles.stepTitle}>
          <span className={styles.stepNumber}>2</span> שעת התחלה{seat && ` · תא ${seat.label}`}
        </legend>
        {!availability.data && availability.error && <ErrorState error={availability.error} onRetry={availability.reload} compact />}
        {availability.loading && !availability.data && <p className={styles.hint}>טוען את הזמנים…</p>}
        {availability.data && upcoming.length === 0 && <p className={styles.hint}>לא נשארו ביום הזה שעות להזמנה. בחר יום אחר.</p>}
        {availability.data && upcoming.length > 0 && (
          <div className={styles.times} role="group" aria-label="שעת התחלה">
            {upcoming.map((s) => (
              <button
                key={s.start}
                type="button"
                className={styles.time}
                disabled={s.state !== 'free'}
                title={s.state === 'tooFar' ? 'עוד אי אפשר להזמין כל כך רחוק מראש' : s.state === 'busy' ? 'תפוס' : undefined}
                aria-pressed={s.start === slot?.start}
                onClick={() => choose(s)}
              >
                {s.label}
              </button>
            ))}
          </div>
        )}
      </fieldset>

      {clash && (
        <div className={styles.clash} role="alert">
          <strong>מישהו הזמין את הזמן הזה ממש עכשיו.</strong>
          {checking ? (
            <span>בודק מה עוד פנוי…</span>
          ) : suggestion ? (
            <Button
              variant="secondary"
              size="sm"
              icon={<CalendarClock aria-hidden="true" />}
              onClick={() => choose(suggestion, clash.minutes)}
            >
              הזמן הפנוי הקרוב: {suggestion.label}–{formatTime(endOf(suggestion.start, clash.minutes), timeZone)}
            </Button>
          ) : (
            <span>אין ביום הזה זמן פנוי מאוחר יותר באורך הזה. נסה אורך קצר יותר או יום אחר.</span>
          )}
        </div>
      )}

      {slot && (
        <fieldset className={styles.step}>
          <legend className={styles.stepTitle}>
            <span className={styles.stepNumber}>3</span> כמה זמן
          </legend>
          <div className={styles.row} role="group" aria-label="אורך">
            {lengths.map((m) => (
              <Chip key={m} selected={m === minutes} onClick={() => setMinutes(m)}>
                {durationLabel(m)}
              </Chip>
            ))}
          </div>
        </fieldset>
      )}

      {slot && minutes && (
        <div className={styles.summary}>
          <p className={styles.summaryText}>
            {place.name}
            {seat && `, תא ${seat.label}`}
            <span className={styles.summaryTime}>
              {weekdayName(weekdayOfDate(day!))} · {slot.label}–{formatTime(endOf(slot.start, minutes), timeZone)}
            </span>
          </p>
          {status === 'signed-in' ? (
            <Button size="lg" block busy={action.busy} onClick={() => void book()}>
              להזמין
            </Button>
          ) : (
            <ButtonLink size="lg" block to={`/login?next=${encodeURIComponent(location.pathname)}`}>
              להתחבר כדי להזמין
            </ButtonLink>
          )}
        </div>
      )}

      {action.error && !clash && (
        <p className={styles.error} role="alert">
          {action.error}
        </p>
      )}
    </div>
  )
}
