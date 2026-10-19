// Links that subscribe a calendar app to the student's feed
// (backend/app/calendar_feed.py). webcal:// is the same address with a
// scheme a phone hands to its calendar app.
//
// Google's "?cid=" link is not documented by Google; it is known to work
// (https://til.simonwillison.net/ics/google-calendar-ics-subscribe-link).
// Outlook on the web has no such link we could confirm: the card shows how
// to add the copied address there instead.

export function webcalLink(feedUrl: string): string {
  return feedUrl.replace(/^https?:\/\//, 'webcal://')
}

export function googleSubscribeLink(feedUrl: string): string {
  return `https://calendar.google.com/calendar/render?${new URLSearchParams({ cid: webcalLink(feedUrl) })}`
}
