import { describe, expect, it } from 'vitest'
import { place } from '../test/fixtures'
import { quickPicks } from './quick'

const lab = place({ id: 1, name: 'M206', kind: 'computer_lab', atmosphere: 'quiet', suited_for: 'solo', amenities: ['computers'], available: 30, capacity: 40 })
const library = place({ id: 2, name: 'ספרייה', kind: 'library', atmosphere: 'quiet', suited_for: 'both', amenities: [], available: 12, capacity: 60 })
const area = place({ id: 3, name: 'מתחם', kind: 'open_area', atmosphere: 'conversation', suited_for: 'both', amenities: ['outlets'], available: 40, capacity: 50 })
const room = place({ id: 4, name: 'EM107', kind: 'group_room', atmosphere: 'conversation', suited_for: 'group', amenities: ['whiteboard'], available: 0, capacity: 8, free_now: true })
const fullArea = { ...area, id: 5, name: 'מלא', available: 0 }
const closed = { ...library, id: 6, name: 'סגור', is_open: false }
const ALL = [lab, library, area, room, fullArea, closed]

describe('quickPicks', () => {
  it('alone and quiet: open, free now, quiet, not only for groups; the roomiest first', () => {
    const picks = quickPicks(ALL, { who: 'solo', need: 'quiet' })
    expect(picks.map((p) => p.place.id)).toEqual([1, 2])
  })

  it('a group that talks: rooms and places that suit groups, where talking is fine', () => {
    expect(quickPicks(ALL, { who: 'group', need: 'talk' }).map((p) => p.place.id)).toEqual([3, 4])
  })

  it('a computer: only places with computers', () => {
    expect(quickPicks(ALL, { who: 'solo', need: 'computer' }).map((p) => p.place.id)).toEqual([1])
  })

  it('never more than three, and never a full or closed place', () => {
    const many = Array.from({ length: 6 }, (_, i) => ({ ...area, id: 10 + i, available: 10 + i }))
    const picks = quickPicks([...many, fullArea, closed], { who: 'solo', need: 'talk' })
    expect(picks).toHaveLength(3)
    expect(picks.map((p) => p.place.id)).toEqual([15, 14, 13])
  })

  it('says why each place was picked', () => {
    const [first] = quickPicks(ALL, { who: 'solo', need: 'quiet' })
    expect(first.reasons).toEqual(['30 מקומות פנויים עכשיו', 'שקט', 'מתאים ללימוד לבד'])
    const [, roomPick] = quickPicks(ALL, { who: 'group', need: 'talk' })
    expect(roomPick.reasons).toEqual(['החדר פנוי עכשיו', 'אפשר לדבר', 'מתאים לקבוצה'])
  })
})
