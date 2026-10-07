import { describe, expect, it } from 'vitest'
import { building, place } from '../test/fixtures'
import {
  applyFilters,
  countWith,
  distanceMetres,
  EMPTY_FILTERS,
  hasFilters,
  readFilters,
  toggleFlag,
  toggleKind,
  writeFilters,
} from './filters'

const lab = place({ id: 1, name: 'M206', building_code: 'M', kind: 'computer_lab', amenities: ['computers', 'outlets'], atmosphere: 'quiet', suited_for: 'solo' })
const area = place({ id: 2, name: 'מתחם לימוד', building_code: 'L', kind: 'open_area', amenities: ['outlets', 'daylight'], atmosphere: 'conversation', suited_for: 'both', available: 0 })
const room = place({ id: 3, name: 'EM107', building_code: 'EM', kind: 'group_room', amenities: ['whiteboard'], atmosphere: 'conversation', suited_for: 'group', free_now: true })
const ALL = [lab, area, room]

describe('reading and writing the address', () => {
  it('starts empty, in the list view', () => {
    expect(readFilters(new URLSearchParams())).toEqual(EMPTY_FILTERS)
    expect(hasFilters(EMPTY_FILTERS)).toBe(false)
  })

  it('round-trips every field', () => {
    const params = new URLSearchParams('q=מחשב&free=1&quiet=1&kind=library&kind=computer_lab&near=EM&view=map')
    const filters = readFilters(params)
    expect(filters).toEqual({ q: 'מחשב', flags: ['free', 'quiet'], kinds: ['library', 'computer_lab'], near: 'EM', view: 'map' })
    expect(readFilters(writeFilters(filters))).toEqual(filters)
  })

  it('ignores values it does not know, so a crafted link cannot break the page', () => {
    const filters = readFilters(new URLSearchParams('kind=pool&view=3d&near=<script>&q=' + 'א'.repeat(200)))
    expect(filters.kinds).toEqual([])
    expect(filters.view).toBe('list')
    expect(filters.near).toBeNull()
    expect(filters.q).toHaveLength(80)
  })

  it('keeps the old /places?kind= links working', () => {
    expect(readFilters(new URLSearchParams('kind=library')).kinds).toEqual(['library'])
  })

  it('writes nothing for the defaults, so a clean page has a clean address', () => {
    expect(writeFilters(EMPTY_FILTERS).toString()).toBe('')
  })
})

describe('toggling', () => {
  it('turns a chip on and off', () => {
    const on = toggleFlag(EMPTY_FILTERS, 'quiet')
    expect(on.flags).toEqual(['quiet'])
    expect(toggleFlag(on, 'quiet').flags).toEqual([])
    expect(toggleKind(EMPTY_FILTERS, 'library').kinds).toEqual(['library'])
  })
})

describe('applyFilters', () => {
  it('keeps every place without filters, free ones first', () => {
    expect(applyFilters(ALL, EMPTY_FILTERS, []).map((p) => p.id)).toEqual([1, 3, 2])
  })

  it('needs every chip to hold', () => {
    expect(applyFilters(ALL, { ...EMPTY_FILTERS, flags: ['outlets', 'quiet'] }, []).map((p) => p.id)).toEqual([1])
  })

  it('counts a place that suits both as good for a group', () => {
    expect(applyFilters(ALL, toggleFlag(EMPTY_FILTERS, 'group'), []).map((p) => p.id)).toEqual([3, 2])
  })

  it('takes any of the chosen kinds', () => {
    const f = toggleKind(toggleKind(EMPTY_FILTERS, 'open_area'), 'group_room')
    expect(applyFilters(ALL, f, []).map((p) => p.id).sort()).toEqual([2, 3])
  })

  it('combines search with chips', () => {
    expect(applyFilters(ALL, { ...EMPTY_FILTERS, q: 'מתחם', flags: ['free'] }, [])).toEqual([])
  })

  it('sorts by real distance from the chosen building', () => {
    const buildings = [
      building({ code: 'M', latitude: '32.912751', longitude: '35.282293' }),
      building({ code: 'L', latitude: '32.912396', longitude: '35.282790' }),
      building({ code: 'EM', latitude: '32.914079', longitude: '35.281250' }),
    ]
    expect(applyFilters(ALL, { ...EMPTY_FILTERS, near: 'L' }, buildings).map((p) => p.building_code)).toEqual(['L', 'M', 'EM'])
  })
})

describe('countWith', () => {
  it('tells how many places a chip would leave', () => {
    expect(countWith(ALL, EMPTY_FILTERS, 'outlets')).toBe(2)
    expect(countWith(ALL, toggleFlag(EMPTY_FILTERS, 'quiet'), 'outlets')).toBe(1)
    // A chip that is already on: the current number.
    expect(countWith(ALL, toggleFlag(EMPTY_FILTERS, 'outlets'), 'outlets')).toBe(2)
  })
})

describe('distanceMetres', () => {
  it('measures about 60 m between buildings L and M', () => {
    const d = distanceMetres([32.912396, 35.28279], [32.912751, 35.282293])
    expect(d).toBeGreaterThan(55)
    expect(d).toBeLessThan(65)
  })
})
