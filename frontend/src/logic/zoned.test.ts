import { describe, expect, it } from 'vitest'
import { addDays, dateInZone, weekdayOfDate, zonedToUtc } from './zoned'

const TZ = 'Asia/Jerusalem'

describe('zonedToUtc', () => {
  it('turns Braude wall-clock time into the exact moment', () => {
    // October: daylight saving time, UTC+3.
    expect(zonedToUtc('2026-10-11', '10:00', TZ).toISOString()).toBe('2026-10-11T07:00:00.000Z')
    // January: winter time, UTC+2.
    expect(zonedToUtc('2027-01-10', '10:00', TZ).toISOString()).toBe('2027-01-10T08:00:00.000Z')
  })

  it('handles the day the clocks go back', () => {
    // Israel leaves daylight saving time on 25 October 2026 at 02:00 (UTC+3 to UTC+2).
    expect(zonedToUtc('2026-10-24', '12:00', TZ).toISOString()).toBe('2026-10-24T09:00:00.000Z')
    expect(zonedToUtc('2026-10-25', '12:00', TZ).toISOString()).toBe('2026-10-25T10:00:00.000Z')
  })
})

describe('dates in the institution time zone', () => {
  it('today is the local date, not the UTC one', () => {
    // 22:30 UTC on the 10th is already 01:30 on the 11th in Israel.
    expect(dateInZone(new Date('2026-10-10T22:30:00Z'), TZ)).toBe('2026-10-11')
  })

  it('adds days across a month end', () => {
    expect(addDays('2026-10-30', 3)).toBe('2026-11-02')
  })

  it('numbers weekdays like Python (Monday = 0)', () => {
    expect(weekdayOfDate('2026-10-11')).toBe(6) // a Sunday
    expect(weekdayOfDate('2026-10-16')).toBe(4) // a Friday
  })
})
