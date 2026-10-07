import { describe, expect, it } from 'vitest'
import { place } from '../../test/fixtures'
import { kindLine } from './storyNumbers'

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
