// Today as one bar: when the place is open, and for a room or a station,
// when it is booked. Read right to left, like Hebrew; a line marks now.
// The bar is a picture; the same facts are in a list for screen readers.

import { useEffect, useEffectEvent, useState } from 'react'
import { getAvailability } from '../../api/student'
import type { BookingRules, PlaceDetail } from '../../api/types'
import { REFRESH_INTERVAL_MS } from '../../config'
import { useApi } from '../../hooks/useApi'
import { daySlots, type SlotState } from '../../logic/slots'
import { formatTime } from '../../logic/time'
import { segments } from '../../logic/timeline'
import { dateInZone } from '../../logic/zoned'
import { ErrorState } from '../../ui'
import styles from './space.module.css'

interface Props {
  place: PlaceDetail
  seatId: number | null // a lab station; null for the whole place
  rules: BookingRules
  timeZone: string
  // Changes when the student books here, so today's bar shows it at once.
  bookedId?: number | null
}

const MINUTE = 60_000

export function AvailabilityTimeline({ place, seatId, rules, timeZone, bookedId = null }: Props) {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), MINUTE)
    return () => clearInterval(timer)
  }, [])
  const today = dateInZone(now, timeZone)
  // Walk-in places have no bookings: their day is just open or closed.
  // Refreshed like the rest of the page, so other students' bookings show too.
  const availability = useApi(
    () => getAvailability(place.id, today),
    place.bookable ? `availability-${place.id}-${today}` : null,
    REFRESH_INTERVAL_MS,
  )
  const { reload } = availability
  const reloadOnBooking = useEffectEvent(reload)
  useEffect(() => {
    if (bookedId !== null) reloadOnBooking()
  }, [bookedId])
  const busy = place.bookable ? (availability.data?.busy ?? null) : []

  if (place.bookable && !availability.data && availability.error) {
    return <ErrorState error={availability.error} onRetry={availability.reload} compact />
  }
  if (busy === null) return <div className={styles.barSkeleton} aria-hidden="true" />

  // "Past" here means the time is over, not the booking rule's deadline.
  const slots = daySlots({ date: today, hours: place.opening_hours, busy, seatId, now, rules: { ...rules, no_show_after_minutes: rules.slot_minutes }, timeZone })
  const parts = segments(slots, rules.slot_minutes)
  if (parts.length === 0) return <p className={styles.muted}>סגור היום.</p>

  const labels: Record<SlotState, string> = {
    free: place.bookable ? 'פנוי' : 'פתוח',
    busy: 'תפוס',
    past: 'עבר',
    tooFar: 'פנוי',
  }
  // Where "now" falls on the bar, as a share of the open time.
  let before = 0
  for (const part of parts) {
    const start = Date.parse(part.start)
    const end = Date.parse(part.end)
    if (now.getTime() >= end) before += part.share
    else if (now.getTime() > start) before += part.share * ((now.getTime() - start) / (end - start))
  }
  const showNow = now.getTime() > Date.parse(parts[0].start) && now.getTime() < Date.parse(parts.at(-1)!.end)

  return (
    <div className={styles.timeline}>
      <div className={styles.bar} aria-hidden="true">
        {parts.map((part) => (
          <span key={part.start} className={styles[`seg_${part.state}`]} style={{ flexGrow: part.share }} />
        ))}
        {showNow && <span className={styles.now} style={{ insetInlineStart: `${before * 100}%` }} />}
      </div>
      <div className={styles.ticks} aria-hidden="true">
        <span>{formatTime(parts[0].start, timeZone)}</span>
        <span>{formatTime(parts.at(-1)!.end, timeZone)}</span>
      </div>
      <ul className="visually-hidden">
        {parts.map((part) => (
          <li key={part.start}>
            {formatTime(part.start, timeZone)}–{formatTime(part.end, timeZone)}: {labels[part.state]}
          </li>
        ))}
      </ul>
      <ul className={styles.legend} aria-hidden="true">
        <li>
          <span className={styles.seg_free} /> {labels.free}
        </li>
        {place.bookable && (
          <li>
            <span className={styles.seg_busy} /> תפוס
          </li>
        )}
        <li>
          <span className={styles.seg_past} /> עבר
        </li>
      </ul>
    </div>
  )
}
