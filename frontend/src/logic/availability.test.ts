import { describe, expect, it } from 'vitest'
import { place } from '../test/fixtures'
import { isFreeNow, spaceStatus } from './availability'

const TZ = 'Asia/Jerusalem'

describe('spaceStatus', () => {
  it('says a closed place is closed, whatever its numbers', () => {
    expect(spaceStatus(place({ is_open: false }), TZ)).toEqual({ tone: 'closed', label: 'סגור עכשיו' })
  })

  it('counts free seats in walk-in places, by how full they are', () => {
    expect(spaceStatus(place({ capacity: 50, occupied: 12, available: 38 }), TZ)).toEqual({ tone: 'free', label: '38 מתוך 50 פנויים' })
    expect(spaceStatus(place({ capacity: 50, occupied: 30, available: 20 }), TZ).tone).toBe('filling')
    expect(spaceStatus(place({ capacity: 50, occupied: 50, available: 0 }), TZ)).toEqual({ tone: 'full', label: 'מלא' })
  })

  it('says when a booked group room frees up, in campus time', () => {
    const room = place({ kind: 'group_room', free_now: false, free_from: '2026-10-11T10:30:00Z' })
    expect(spaceStatus(room, TZ)).toEqual({ tone: 'full', label: 'פנוי מ-13:30' })
    expect(spaceStatus(place({ kind: 'group_room', free_now: true }), TZ)).toEqual({ tone: 'free', label: 'פנוי עכשיו' })
  })
})

describe('a room whose last stay may not have left yet', () => {
  it('says so, in a softer tone, and still counts as free', () => {
    const room = place({ kind: 'group_room', free_now: true, maybe_still_taken: true })
    expect(spaceStatus(room, TZ)).toEqual({ tone: 'filling', label: 'פנוי, אולי עדיין תפוס' })
    expect(isFreeNow(room)).toBe(true)
  })

  it('is not said of a room that is taken, closed, or not marked', () => {
    expect(spaceStatus(place({ kind: 'group_room', free_now: false, maybe_still_taken: true }), TZ).label).toBe('תפוס')
    expect(spaceStatus(place({ kind: 'group_room', free_now: true, maybe_still_taken: true, is_open: false }), TZ).label).toBe('סגור עכשיו')
    expect(spaceStatus(place({ kind: 'group_room', free_now: true }), TZ).label).toBe('פנוי עכשיו')
  })
})

describe('a room whose student stepped out for a while', () => {
  it('says until when, in campus time, and is not free', () => {
    const room = place({ kind: 'group_room', free_now: false, on_break_until: '2026-10-11T10:30:00Z' })
    expect(spaceStatus(room, TZ)).toEqual({ tone: 'full', label: 'בהפסקה עד 13:30' })
    expect(isFreeNow(room)).toBe(false)
  })
})

describe('isFreeNow', () => {
  it('is an open place with room, or a group room nobody holds', () => {
    expect(isFreeNow(place({ available: 3 }))).toBe(true)
    expect(isFreeNow(place({ available: 0 }))).toBe(false)
    expect(isFreeNow(place({ available: 3, is_open: false }))).toBe(false)
    expect(isFreeNow(place({ kind: 'group_room', free_now: true, available: 0 }))).toBe(true)
    expect(isFreeNow(place({ kind: 'group_room', free_now: false }))).toBe(false)
  })
})
