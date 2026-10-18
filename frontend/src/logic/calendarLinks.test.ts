import { describe, expect, it } from 'vitest'
import { googleCalendarLink, outlookCalendarLink } from './calendarLinks'

const event = {
  title: 'EM107 · StudySpot',
  location: 'בניין EM, קומת קרקע',
  details: 'כשתגיע, סרוק את הקוד שבמקום.',
  start: '2026-10-11T07:00:00Z', // 10:00 in Israel
  end: '2026-10-11T08:30:00Z',
}

describe('googleCalendarLink', () => {
  it('opens a new event in Google Calendar, filled in, with UTC times', () => {
    const url = new URL(googleCalendarLink(event))
    expect(url.origin + url.pathname).toBe('https://calendar.google.com/calendar/render')
    expect(url.searchParams.get('action')).toBe('TEMPLATE')
    expect(url.searchParams.get('text')).toBe('EM107 · StudySpot')
    expect(url.searchParams.get('dates')).toBe('20261011T070000Z/20261011T083000Z')
    expect(url.searchParams.get('location')).toBe('בניין EM, קומת קרקע')
    expect(url.searchParams.get('details')).toBe('כשתגיע, סרוק את הקוד שבמקום.')
  })

  it('encodes text, so a name with & or # cannot break the address', () => {
    const url = new URL(googleCalendarLink({ ...event, title: 'A & B #1' }))
    expect(url.searchParams.get('text')).toBe('A & B #1')
    expect(url.searchParams.get('dates')).toBe('20261011T070000Z/20261011T083000Z')
  })
})

describe('outlookCalendarLink', () => {
  it("opens a new event in Outlook on the web (a school or work account, like the college's)", () => {
    const url = new URL(outlookCalendarLink(event))
    expect(url.origin + url.pathname).toBe('https://outlook.office.com/calendar/0/deeplink/compose')
    expect(url.searchParams.get('rru')).toBe('addevent')
    expect(url.searchParams.get('subject')).toBe('EM107 · StudySpot')
    expect(url.searchParams.get('startdt')).toBe('2026-10-11T07:00:00.000Z')
    expect(url.searchParams.get('enddt')).toBe('2026-10-11T08:30:00.000Z')
    expect(url.searchParams.get('location')).toBe('בניין EM, קומת קרקע')
    expect(url.searchParams.get('body')).toBe('כשתגיע, סרוק את הקוד שבמקום.')
  })
})
