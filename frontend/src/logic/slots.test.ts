import { describe, expect, it } from 'vitest'
import type { BookingRules, BusyRange, OpeningHours } from '../api/types'
import { bookableDays, daySlots, durationsFrom } from './slots'

const TZ = 'Asia/Jerusalem'
const RULES: BookingRules = {
  slot_minutes: 15, max_minutes: 120, days_ahead: 4, max_upcoming: 2,
  arrive_early_minutes: 10, no_show_after_minutes: 15,
}
// Sunday to Thursday 07:00-20:00, Friday 07:00-14:00 (Python weekdays).
const HOURS: OpeningHours[] = [
  ...[6, 0, 1, 2, 3].map((weekday) => ({ weekday, opens: '07:00:00', closes: '20:00:00' })),
  { weekday: 4, opens: '07:00:00', closes: '14:00:00' },
]
const SUNDAY = '2026-10-11'
const before = new Date('2026-10-10T12:00:00Z') // Saturday, the day before

function clock(iso: string) {
  return new Date(iso).toISOString().slice(11, 16) // UTC "HH:MM"
}

describe('daySlots', () => {
  it('offers every 15 minutes of the opening hours', () => {
    const slots = daySlots({ date: SUNDAY, hours: HOURS, busy: [], seatId: null, now: before, rules: RULES, timeZone: TZ })
    expect(slots).toHaveLength(52) // 13 hours x 4
    expect(clock(slots[0].start)).toBe('04:00') // 07:00 in Israel
    expect(slots.every((s) => s.state === 'free')).toBe(true)
  })

  it('a free slot may run up to two hours, but not past closing', () => {
    const slots = daySlots({ date: SUNDAY, hours: HOURS, busy: [], seatId: null, now: before, rules: RULES, timeZone: TZ })
    expect(clock(slots[0].maxEnd)).toBe('06:00') // 07:00 + 2h = 09:00 local
    expect(clock(slots.at(-1)!.maxEnd)).toBe('17:00') // 19:45 slot ends at closing, 20:00 local
  })

  it('marks booked time, and stops a free slot before the next booking', () => {
    const busy: BusyRange[] = [{ seat_id: null, starts_at: '2026-10-11T06:00:00Z', ends_at: '2026-10-11T07:00:00Z' }]
    const slots = daySlots({ date: SUNDAY, hours: HOURS, busy, seatId: null, now: before, rules: RULES, timeZone: TZ })
    const at = (local: string) => slots.find((s) => s.label === local)!
    expect(at('09:00').state).toBe('busy')
    expect(at('09:45').state).toBe('busy')
    expect(at('10:00').state).toBe('free')
    expect(clock(at('08:00').maxEnd)).toBe('06:00') // up to 09:00 local, where the booking starts
  })

  it('in a computer lab only the chosen station counts', () => {
    const busy: BusyRange[] = [{ seat_id: 7, starts_at: '2026-10-11T06:00:00Z', ends_at: '2026-10-11T07:00:00Z' }]
    const slots = daySlots({ date: SUNDAY, hours: HOURS, busy, seatId: 8, now: before, rules: RULES, timeZone: TZ })
    expect(slots.find((s) => s.label === '09:00')!.state).toBe('free')
  })

  it('earlier today is past; the current slot can still be booked', () => {
    const now = new Date('2026-10-11T07:05:00Z') // 10:05 local
    const slots = daySlots({ date: SUNDAY, hours: HOURS, busy: [], seatId: null, now, rules: RULES, timeZone: TZ })
    expect(slots.find((s) => s.label === '09:45')!.state).toBe('past')
    expect(slots.find((s) => s.label === '10:00')!.state).toBe('free')
  })

  it('a closed day has no slots', () => {
    expect(daySlots({ date: '2026-10-17', hours: HOURS, busy: [], seatId: null, now: before, rules: RULES, timeZone: TZ })).toEqual([])
  })
})

describe('durationsFrom', () => {
  it('offers 15-minute steps up to the longest allowed', () => {
    const start = '2026-10-11T04:00:00.000Z'
    const maxEnd = '2026-10-11T05:00:00.000Z'
    expect(durationsFrom({ start, maxEnd, label: '07:00', state: 'free' }, RULES)).toEqual([15, 30, 45, 60])
  })
})

describe('bookableDays', () => {
  it('lists today and the next four days, without days the place is closed', () => {
    const friday = new Date('2026-10-16T06:00:00Z')
    expect(bookableDays(friday, HOURS, RULES, TZ)).toEqual(['2026-10-16', '2026-10-18', '2026-10-19', '2026-10-20'])
  })
})
