// "Add to calendar" as a link that opens the calendar with the event
// filled in: no file to download. Google Calendar for most students, and
// Outlook on the web for a school account (the college's is Microsoft's).

export interface CalendarEvent {
  title: string
  location: string
  details: string
  start: string // ISO time, from the server
  end: string
}

// 2026-10-11T07:00:00Z -> 20261011T070000Z, the form Google asks for.
const compactUtc = (iso: string) => new Date(iso).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')

// URLSearchParams encodes every value, so a name with & or # stays text.
export function googleCalendarLink(event: CalendarEvent): string {
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: event.title,
    dates: `${compactUtc(event.start)}/${compactUtc(event.end)}`,
    location: event.location,
    details: event.details,
  })
  return `https://calendar.google.com/calendar/render?${params}`
}

// Works in a desktop browser; on a phone's browser Outlook's page may not
// open the form (the Ticket says so next to the link).
export function outlookCalendarLink(event: CalendarEvent): string {
  const params = new URLSearchParams({
    rru: 'addevent',
    subject: event.title,
    startdt: new Date(event.start).toISOString(),
    enddt: new Date(event.end).toISOString(),
    location: event.location,
    body: event.details,
  })
  return `https://outlook.office.com/calendar/0/deeplink/compose?${params}`
}
