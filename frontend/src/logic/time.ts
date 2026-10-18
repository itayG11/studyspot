import { dateInZone, weekdayOfDate } from './zoned'

// Times are shown in the institution's time zone, whatever the time zone of
// the visitor's device. The server sends ISO times in UTC.

// Python numbers weekdays from Monday = 0; the week here starts on Sunday.
const WEEKDAY_NAMES = ['שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת', 'ראשון']
export const WEEK_ORDER = [6, 0, 1, 2, 3, 4, 5]

export function weekdayName(weekday: number): string {
  return `יום ${WEEKDAY_NAMES[weekday]}`
}

// "2026-10-11T07:00:00Z" -> "10:00" in Asia/Jerusalem.
export function formatTime(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat('he-IL', {
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    timeZone,
  }).format(new Date(iso))
}

// Today's weekday in the given time zone, numbered like Python (Monday = 0).
export function todayWeekday(timeZone: string, now: Date = new Date()): number {
  const name = new Intl.DateTimeFormat('en-US', { weekday: 'short', timeZone }).format(now)
  return ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(name)
}

// "יום שני 12/10" for a moment, on the institution's calendar.
export function formatDay(iso: string, timeZone: string): string {
  const date = dateInZone(new Date(iso), timeZone)
  return `${weekdayName(weekdayOfDate(date))} ${date.slice(8, 10)}/${date.slice(5, 7)}`
}

// "07:00:00" (a wall-clock time from the opening hours) -> "07:00".
export function formatClock(value: string): string {
  return value.slice(0, 5)
}
