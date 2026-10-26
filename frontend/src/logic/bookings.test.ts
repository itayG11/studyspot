import { describe, expect, it } from 'vitest'
import type { Booking, BookingRules } from '../api/types'
import { bookingToConfirm, inArrivalWindow, activeBookings } from './bookings'

const RULES = { arrive_early_minutes: 10, arrive_early_if_free_minutes: 30, no_show_after_minutes: 15 } as BookingRules
const BOOKING: Booking = {
  id: 1, place_id: 3, place_name: 'EM107', building_code: 'EM', seat_id: null, seat_label: null,
  starts_at: '2026-10-11T07:00:00Z', ends_at: '2026-10-11T08:00:00Z', status: 'booked', source: 'advance',
}
const at = (iso: string) => new Date(iso)

describe('inArrivalWindow', () => {
  it('opens thirty minutes before the start (the server checks the place is free) and closes fifteen after', () => {
    expect(inArrivalWindow(BOOKING, at('2026-10-11T06:29:00Z'), RULES)).toBe(false)
    expect(inArrivalWindow(BOOKING, at('2026-10-11T06:30:00Z'), RULES)).toBe(true)
    expect(inArrivalWindow(BOOKING, at('2026-10-11T06:50:00Z'), RULES)).toBe(true)
    expect(inArrivalWindow(BOOKING, at('2026-10-11T07:14:00Z'), RULES)).toBe(true)
    expect(inArrivalWindow(BOOKING, at('2026-10-11T07:15:00Z'), RULES)).toBe(false)
  })

  it('a booking already confirmed is not waiting for arrival', () => {
    expect(inArrivalWindow({ ...BOOKING, status: 'checked_in' }, at('2026-10-11T07:00:00Z'), RULES)).toBe(false)
  })
})

describe('bookingToConfirm', () => {
  it('finds the booking of this place only', () => {
    const now = at('2026-10-11T07:00:00Z')
    expect(bookingToConfirm([BOOKING], 3, now, RULES)?.id).toBe(1)
    expect(bookingToConfirm([BOOKING], 4, now, RULES)).toBeNull()
  })
})

describe('activeBookings', () => {
  const at = (h: number) => new Date(Date.UTC(2026, 9, 12, h)).toISOString()
  const booking = (status: Booking['status'], ends: number): Booking => ({
    id: ends, place_id: 1, place_name: 'M206', building_code: 'M', seat_id: null, seat_label: null,
    starts_at: at(ends - 1), ends_at: at(ends), status, source: 'advance',
  })
  it('counts the bookings still ahead or under way, not the ones over or cancelled', () => {
    const now = new Date(Date.UTC(2026, 9, 12, 10))
    const all = [booking('booked', 12), booking('checked_in', 11), booking('booked', 9), booking('cancelled', 13), booking('completed', 12)]
    expect(activeBookings(all, now).map((b) => b.id)).toEqual([12, 11])
  })
})
