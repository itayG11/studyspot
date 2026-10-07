// Small facts about a booking, used by the scan page and the "my area" page.

import type { Booking, BookingRules } from '../api/types'

const MINUTE = 60_000

// Arrival can be confirmed from a few minutes before the start until the
// no-show deadline (10 and 15 minutes in the Braude rules).
export function inArrivalWindow(booking: Booking, now: Date, rules: BookingRules): boolean {
  const start = Date.parse(booking.starts_at)
  const opens = start - rules.arrive_early_minutes * MINUTE
  const closes = start + rules.no_show_after_minutes * MINUTE
  return booking.status === 'booked' && opens <= now.getTime() && now.getTime() < closes
}

// The booking a scan at this place would confirm, if there is one.
export function bookingToConfirm(bookings: Booking[], placeId: number, now: Date, rules: BookingRules): Booking | null {
  return bookings.find((b) => b.place_id === placeId && inArrivalWindow(b, now, rules)) ?? null
}
