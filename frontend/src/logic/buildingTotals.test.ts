import { describe, expect, it } from 'vitest'
import type { Building, Place } from '../api/types'
import { withLiveTotals } from './buildingTotals'

const building = (code: string): Building => ({
  id: code.charCodeAt(0), code, name: null, status: 'active', floors_count: 2,
  latitude: null, longitude: null, places_count: 0, capacity: 99, occupied: 99, available: 0,
})
const place = (over: Partial<Place>): Place => ({
  id: 1, building_code: 'M', kind: 'open_area', name: 'x', floor: 1, location_note: null,
  is_open: true, bookable: false, capacity: 40, occupied: 10, available: 30, ...over,
} as Place)

describe('withLiveTotals', () => {
  it('counts the open places a student can walk into, as the server does', () => {
    const [m] = withLiveTotals([building('M')], [
      place({ id: 1, capacity: 40, occupied: 10, available: 30 }),
      place({ id: 2, kind: 'computer_lab', capacity: 20, occupied: 5, available: 15 }),
      place({ id: 3, is_open: false, capacity: 50, occupied: 0, available: 50 }), // closed
      place({ id: 4, kind: 'group_room', capacity: 6, occupied: 0, available: 6 }), // booked, not walked into
    ])
    expect(m).toMatchObject({ capacity: 60, occupied: 15, available: 45 })
  })

  it('gives each building only its own places, and zero to a building without any', () => {
    const [m, l] = withLiveTotals([building('M'), building('L')], [place({ building_code: 'M' })])
    expect(m.available).toBe(30)
    expect(l).toMatchObject({ capacity: 0, occupied: 0, available: 0 })
  })

  it('never shows fewer than zero free, even when over capacity', () => {
    const [m] = withLiveTotals([building('M')], [place({ capacity: 10, occupied: 12, available: 0 })])
    expect(m.available).toBe(0)
  })

  it('keeps everything else about the building', () => {
    const [m] = withLiveTotals([{ ...building('M'), name: 'הנדסה', places_count: 3 }], [])
    expect(m).toMatchObject({ code: 'M', name: 'הנדסה', places_count: 3 })
  })
})
