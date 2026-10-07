import { describe, expect, it } from 'vitest'
import { place } from '../test/fixtures'
import { matchesSearch, normalize } from './search'

describe('normalize', () => {
  it('treats final letters as their regular form', () => {
    expect(normalize('מתחם')).toBe(normalize('מתחמ'))
    expect(normalize('ךםןףץ')).toBe('כמנפצ')
  })

  it('drops niqqud, geresh and quotes, and lower-cases English', () => {
    expect(normalize('סִפְרִיָּה')).toBe('ספריה')
    expect(normalize('מ"מ צ׳יפס')).toBe('ממ ציפס')
    expect(normalize('  EM107 ')).toBe('em107')
  })

  it('reads the full and short spelling of library the same', () => {
    expect(normalize('ספרייה')).toBe(normalize('ספריה'))
  })
})

describe('matchesSearch', () => {
  const lab = place({ name: 'M206', building_code: 'M', kind: 'computer_lab', amenities: ['computers', 'printer'] })
  const room = place({ name: 'EM107', building_code: 'EM', kind: 'group_room', amenities: ['whiteboard'], atmosphere: 'conversation' })

  it('matches everything when the search is empty', () => {
    expect(matchesSearch(lab, '')).toBe(true)
    expect(matchesSearch(lab, '   ')).toBe(true)
  })

  it('finds by name, building, kind, amenity and atmosphere', () => {
    expect(matchesSearch(lab, 'm206')).toBe(true)
    expect(matchesSearch(room, 'בניין EM')).toBe(true)
    expect(matchesSearch(lab, 'חוות')).toBe(true)
    expect(matchesSearch(lab, 'מדפסת')).toBe(true)
    expect(matchesSearch(room, 'לוח')).toBe(true)
    expect(matchesSearch(room, 'לדבר')).toBe(true)
  })

  it('needs every word to match', () => {
    expect(matchesSearch(lab, 'מחשבים M')).toBe(true)
    expect(matchesSearch(lab, 'מחשבים לוח')).toBe(false)
  })

  it('ignores final letters while typing', () => {
    // Half-typed "מתחם" ends in a regular mem: still a match.
    expect(matchesSearch(place({ kind: 'open_area', name: 'מתחם לימוד' }), 'מתחמ')).toBe(true)
  })
})
