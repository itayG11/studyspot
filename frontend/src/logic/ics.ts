// A calendar file (.ics, RFC 5545) for one booking, so it can be added to
// any calendar app. Times are written in UTC; the app shows local time.

interface CalendarEvent {
  uid: string
  title: string
  location: string
  description: string
  start: string // ISO time
  end: string
  stamp?: Date // when the file was made
}

const utc = (date: Date) => date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')

// Text values escape backslash, comma, semicolon and line breaks (any of
// CRLF, LF or a lone CR). Other control characters are dropped, so no
// value can ever start a line of its own in the file.
const text = (value: string) =>
  value
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r\n|\r|\n/g, '\\n')
    // oxlint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f]/g, '')

// Lines longer than 75 bytes are folded: broken, and the next part starts
// with a space. A Hebrew letter is 2 bytes in UTF-8, so this comes quickly.
function fold(line: string): string {
  const encoder = new TextEncoder()
  const parts: string[] = []
  let current = ''
  let bytes = 0
  for (const char of line) {
    const size = encoder.encode(char).length
    const limit = parts.length === 0 ? 75 : 74 // the leading space counts
    if (bytes + size > limit) {
      parts.push(current)
      current = ''
      bytes = 0
    }
    current += char
    bytes += size
  }
  parts.push(current)
  return parts.join('\r\n ')
}

export function calendarFile(event: CalendarEvent): string {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//StudySpot//Booking//HE',
    'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',
    `UID:${event.uid}`,
    `DTSTAMP:${utc(event.stamp ?? new Date())}`,
    `DTSTART:${utc(new Date(event.start))}`,
    `DTEND:${utc(new Date(event.end))}`,
    `SUMMARY:${text(event.title)}`,
    `LOCATION:${text(event.location)}`,
    `DESCRIPTION:${text(event.description)}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ]
  return lines.map((line) => `${fold(line)}\r\n`).join('')
}
