// What each lab station looks like on the seat map. Pure functions, so they
// are tested without drawing anything.

import type { Seat } from '../api/types'
import { formatTime } from './time'

export type SeatState = 'free' | 'taken' | 'held' | 'closed'

export const SEAT_LABELS: Record<SeatState, string> = {
  free: 'פנוי',
  taken: 'תפוס',
  held: 'מוזמן, או מתפנה בקרוב להזמנה',
  closed: 'סגור',
}

export function seatState(seat: Seat, placeOpen: boolean): SeatState {
  if (seat.occupied) return 'taken'
  if (!placeOpen) return 'closed'
  // free_now uses the server's walk-in rule: at least 15 minutes before the
  // next booking or closing. A seat that is not taken but not free is held.
  return seat.free_now ? 'free' : 'held'
}

export function seatDescription(seat: Seat, placeOpen: boolean, timeZone: string): string {
  const state = seatState(seat, placeOpen)
  if (state === 'free' && seat.free_until) return `${seat.label}: פנוי עד ${formatTime(seat.free_until, timeZone)}`
  return `${seat.label}: ${SEAT_LABELS[state]}`
}
