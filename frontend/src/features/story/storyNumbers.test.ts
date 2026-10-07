import { describe, expect, it } from 'vitest'
import { building, place } from '../../test/fixtures'
import { kindLine, pinBuilding } from './storyNumbers'

describe('kindLine', () => {
  const places = [
    place({ kind: 'computer_lab', available: 30 }),
    place({ kind: 'computer_lab', available: 8 }),
    place({ kind: 'computer_lab', available: 5, is_open: false }),
    place({ kind: 'group_room', free_now: true }),
    place({ kind: 'group_room', free_now: false }),
    place({ kind: 'library', available: 1 }),
  ]

  it('adds up free seats of open places of a kind', () => {
    expect(kindLine(places, 'computer_lab')).toEqual({ count: 38, text: 'תאים פנויים עכשיו' })
    expect(kindLine(places, 'library')).toEqual({ count: 1, text: 'מקום פנוי עכשיו' })
  })

  it('counts whole group rooms, not seats', () => {
    expect(kindLine(places, 'group_room')).toEqual({ count: 1, text: 'חדר פנוי עכשיו' })
    expect(kindLine([...places, place({ kind: 'group_room', free_now: true })], 'group_room').text).toBe('חדרים פנויים עכשיו')
  })

  it('says zero plainly', () => {
    expect(kindLine(places, 'open_area')).toEqual({ count: 0, text: 'מקומות פנויים עכשיו' })
  })
})

describe('pinBuilding', () => {
  it('puts the pin on the placed building with the most room', () => {
    const buildings = [
      building({ code: 'M', available: 40 }),
      building({ code: 'EM', available: 90 }),
      building({ code: 'NX', available: 200, latitude: null, longitude: null }),
      building({ code: 'NG', available: 0, status: 'under_construction' }),
    ]
    expect(pinBuilding(buildings)).toBe('EM')
  })

  it('has no pin without a placed building', () => {
    expect(pinBuilding([building({ latitude: null, longitude: null })])).toBeNull()
  })
})
