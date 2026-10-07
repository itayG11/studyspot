import { describe, expect, it } from 'vitest'
import { calendarFile } from './ics'

const event = {
  uid: 'booking-42@studyspot',
  title: 'חדר EM107, StudySpot',
  location: 'בניין EM; קומת קרקע',
  start: '2026-10-11T10:30:00Z',
  end: '2026-10-11T12:00:00Z',
  description: 'סרוק את הקוד שבמקום\nכשתגיע',
  stamp: new Date('2026-10-07T18:00:00Z'),
}

describe('calendarFile', () => {
  const text = calendarFile(event)

  it('is a calendar with one event, in UTC times', () => {
    expect(text.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true)
    expect(text).toContain('\r\nBEGIN:VEVENT\r\n')
    expect(text).toContain('\r\nDTSTART:20261011T103000Z\r\n')
    expect(text).toContain('\r\nDTEND:20261011T120000Z\r\n')
    expect(text).toContain('\r\nDTSTAMP:20261007T180000Z\r\n')
    expect(text).toContain('\r\nUID:booking-42@studyspot\r\n')
    expect(text.endsWith('END:VCALENDAR\r\n')).toBe(true)
  })

  it('escapes commas, semicolons and line breaks in text', () => {
    expect(text).toContain('SUMMARY:חדר EM107\\, StudySpot')
    expect(text).toContain('LOCATION:בניין EM\\; קומת קרקע')
    expect(text).toContain('DESCRIPTION:סרוק את הקוד שבמקום\\nכשתגיע')
  })

  it('a lone carriage return or other control character cannot start a new line', () => {
    const file = calendarFile({ ...event, title: 'X\rATTENDEE:mailto:x@example.com\u0000' })
    expect(file).toContain('SUMMARY:X\\nATTENDEE:mailto:x@example.com\r\n')
    expect(file.split('\r\n').some((line) => line.startsWith('ATTENDEE'))).toBe(false)
    // oxlint-disable-next-line no-control-regex
    expect(file.replace(/\r\n/g, '')).not.toMatch(/[\u0000-\u001f]/)
  })

  it('folds long lines at 75 bytes, continuing with a space', () => {
    const long = calendarFile({ ...event, description: 'א'.repeat(100) })
    const lines = long.split('\r\n')
    const encoder = new TextEncoder()
    expect(lines.every((line) => encoder.encode(line).length <= 75)).toBe(true)
    const description = lines.slice(lines.findIndex((l) => l.startsWith('DESCRIPTION:'))).filter((l, i) => i === 0 || l.startsWith(' '))
    expect(description.map((l, i) => (i === 0 ? l : l.slice(1))).join('')).toBe(`DESCRIPTION:${'א'.repeat(100)}`)
  })

  it('uses CRLF line endings only', () => {
    expect(text.replaceAll('\r\n', '')).not.toMatch(/[\r\n]/)
  })
})
