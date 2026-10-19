import { describe, expect, it } from 'vitest'
import { googleSubscribeLink, webcalLink } from './calendarFeed'

const FEED = 'https://getstudyspot.me/api/calendar.ics?t=abc-DEF_123'

describe('calendar feed links', () => {
  it('webcal: the same address, which a phone opens in its calendar app', () => {
    expect(webcalLink(FEED)).toBe('webcal://getstudyspot.me/api/calendar.ics?t=abc-DEF_123')
  })

  it('Google: the webcal address, encoded whole into cid', () => {
    const link = new URL(googleSubscribeLink(FEED))
    expect(link.origin + link.pathname).toBe('https://calendar.google.com/calendar/render')
    expect(link.searchParams.get('cid')).toBe(webcalLink(FEED))
  })

  it('only an https address becomes webcal', () => {
    expect(webcalLink('http://localhost:5173/api/calendar.ics?t=x')).toBe('webcal://localhost:5173/api/calendar.ics?t=x')
  })
})
