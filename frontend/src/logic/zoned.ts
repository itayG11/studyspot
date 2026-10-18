// Dates and times on the institution's clock, whatever the clock of the
// visitor's device. A date is a "YYYY-MM-DD" string and a time is "HH:MM",
// as people at the institution would read them on a wall clock.
//
// JavaScript's Date only knows UTC and the device's own zone, so the zone
// offset is read from Intl (the browser's built-in time zone database).

function partsIn(moment: Date, timeZone: string): Record<string, number> {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(moment)
  const values: Record<string, number> = {}
  for (const part of parts) if (part.type !== 'literal') values[part.type] = Number(part.value)
  return values
}

// How many minutes the zone is ahead of UTC at this moment (+180 in an
// Israeli summer).
function offsetMinutes(moment: Date, timeZone: string): number {
  const p = partsIn(moment, timeZone)
  const asIfUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second)
  return Math.round((asIfUtc - moment.getTime()) / 60_000)
}

export function zonedToUtc(date: string, time: string, timeZone: string): Date {
  const [year, month, day] = date.split('-').map(Number)
  const [hour, minute] = time.split(':').map(Number)
  const wall = Date.UTC(year, month - 1, day, hour, minute)
  // First guess with the offset at that wall time, then check once more:
  // the guess can land on the other side of a clock change.
  let result = wall - offsetMinutes(new Date(wall), timeZone) * 60_000
  const corrected = wall - offsetMinutes(new Date(result), timeZone) * 60_000
  if (corrected !== result) result = corrected
  return new Date(result)
}

export function dateInZone(moment: Date, timeZone: string): string {
  const p = partsIn(moment, timeZone)
  return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`
}

// Calendar arithmetic on the date string itself, so no time zone is involved.
export function addDays(date: string, days: number): string {
  const [year, month, day] = date.split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10)
}

// 0 = Monday ... 6 = Sunday, like Python and the server's opening hours.
export function weekdayOfDate(date: string): number {
  const [year, month, day] = date.split('-').map(Number)
  return (new Date(Date.UTC(year, month - 1, day)).getUTCDay() + 6) % 7
}
