// Which times can be booked on a given day, for a whole room or one
// computer-lab station. The server checks every rule again when the booking
// is sent; this only decides what the page offers.

import type { BookingRules, BusyRange, OpeningHours } from '../api/types'
import { addDays, dateInZone, weekdayOfDate, zonedToUtc } from './zoned'

export type SlotState = 'free' | 'busy' | 'past'

export interface Slot {
  start: string // ISO time
  maxEnd: string // the latest end a booking starting here may have
  label: string // "09:15" on the institution's clock
  state: SlotState
}

interface DayInput {
  date: string // "YYYY-MM-DD" on the institution's clock
  hours: OpeningHours[]
  busy: BusyRange[]
  seatId: number | null // the lab station, or null for a whole room
  now: Date
  rules: BookingRules
  timeZone: string
}

const MINUTE = 60_000

export function daySlots({ date, hours, busy, seatId, now, rules, timeZone }: DayInput): Slot[] {
  const step = rules.slot_minutes * MINUTE
  const mine = busy
    .filter((range) => range.seat_id === seatId)
    .map((range) => ({ start: Date.parse(range.starts_at), end: Date.parse(range.ends_at) }))
  // The slot that has already begun can still be booked (the server allows
  // a start up to one slot ago); anything before it is past.
  const currentSlot = Math.floor(now.getTime() / step) * step

  const slots: Slot[] = []
  for (const window of hours.filter((h) => h.weekday === weekdayOfDate(date))) {
    const opens = zonedToUtc(date, window.opens.slice(0, 5), timeZone).getTime()
    const closes = zonedToUtc(date, window.closes.slice(0, 5), timeZone).getTime()
    for (let start = opens; start + step <= closes; start += step) {
      const taken = mine.some((range) => range.start < start + step && start < range.end)
      const nextBooking = Math.min(...mine.filter((range) => range.start >= start + step).map((r) => r.start))
      const maxEnd = Math.min(start + rules.max_minutes * MINUTE, closes, nextBooking)
      slots.push({
        start: new Date(start).toISOString(),
        maxEnd: new Date(maxEnd).toISOString(),
        label: wallClock(start, timeZone),
        state: start < currentSlot ? 'past' : taken ? 'busy' : 'free',
      })
    }
  }
  return slots
}

// The lengths a booking starting at this slot may have, in minutes.
export function durationsFrom(slot: Slot, rules: BookingRules): number[] {
  const longest = (Date.parse(slot.maxEnd) - Date.parse(slot.start)) / MINUTE
  const lengths: number[] = []
  for (let minutes = rules.slot_minutes; minutes <= longest; minutes += rules.slot_minutes) lengths.push(minutes)
  return lengths
}

// Today and the next days_ahead days, without days the place is closed.
export function bookableDays(now: Date, hours: OpeningHours[], rules: BookingRules, timeZone: string): string[] {
  const today = dateInZone(now, timeZone)
  const open = new Set(hours.map((h) => h.weekday))
  const days: string[] = []
  for (let i = 0; i <= rules.days_ahead; i++) {
    const day = addDays(today, i)
    if (open.has(weekdayOfDate(day))) days.push(day)
  }
  return days
}

function wallClock(moment: number, timeZone: string): string {
  return new Intl.DateTimeFormat('he-IL', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone }).format(
    new Date(moment),
  )
}
