import { describe, expect, it } from 'vitest'
import { formatClock, formatTime, todayWeekday, weekdayName, WEEK_ORDER } from './time'

describe('time', () => {
  it('shows a UTC time in the institution time zone', () => {
    // Israel is UTC+3 in October (daylight saving time).
    expect(formatTime('2026-10-11T07:00:00Z', 'Asia/Jerusalem')).toBe('10:00')
    // ...and UTC+2 in January.
    expect(formatTime('2027-01-10T07:00:00Z', 'Asia/Jerusalem')).toBe('09:00')
  })

  it('trims seconds from opening hours', () => {
    expect(formatClock('07:00:00')).toBe('07:00')
  })

  it('finds today in the institution time zone, not the device one', () => {
    // Saturday 23:30 in UTC is already Sunday 01:30 in Israel.
    expect(todayWeekday('Asia/Jerusalem', new Date('2026-10-10T22:30:00Z'))).toBe(6)
    expect(todayWeekday('UTC', new Date('2026-10-10T22:30:00Z'))).toBe(5)
  })

  it('starts the week on Sunday, with Python weekday numbers', () => {
    expect(weekdayName(WEEK_ORDER[0])).toBe('יום ראשון')
    expect(weekdayName(4)).toBe('יום שישי')
  })
})
