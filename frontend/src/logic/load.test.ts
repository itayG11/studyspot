import { describe, expect, it } from 'vitest'
import { compareToUsual, hourly, mergeToday } from './load'

describe('hourly', () => {
  it('averages the quarter hours of each hour, and today only so far', () => {
    const hours = hourly([
      { start: '09:00:00', usual: 10, today: 4 },
      { start: '09:15:00', usual: 20, today: 6 },
      { start: '09:30:00', usual: 30, today: null },
      { start: '10:00:00', usual: 40, today: null },
    ])
    expect(hours).toEqual([
      { hour: 9, usual: 20, today: 5 },
      { hour: 10, usual: 40, today: null },
    ])
  })

  it('keeps "no usual yet" apart from zero', () => {
    expect(hourly([{ start: '08:00:00', usual: null, today: 0 }])).toEqual([{ hour: 8, usual: null, today: 0 }])
  })
})

describe('mergeToday', () => {
  it('puts a place\'s counts of today next to its usual quarter hours', () => {
    const slots = mergeToday(
      [{ start: '09:00:00', people: 3 }, { start: '09:15:00', people: 5 }],
      [{ start: '09:00:00', people: 2 }],
      '09:20',
    )
    expect(slots).toEqual([
      { start: '09:00:00', usual: 3, today: 2 },
      { start: '09:15:00', usual: 5, today: 0 }, // under way, nobody counted: 0, not "to come"
    ])
  })

  it('a quarter hour still to come has no today', () => {
    expect(mergeToday([{ start: '10:00:00', people: 3 }], [], '09:59')).toEqual([{ start: '10:00:00', usual: 3, today: null }])
  })
})

describe('compareToUsual', () => {
  it('says busier or quieter only with a clear difference', () => {
    expect(compareToUsual(130, 100)).toBe('busier')
    expect(compareToUsual(70, 100)).toBe('quieter')
    expect(compareToUsual(105, 100)).toBe('usual')
    expect(compareToUsual(3, 1)).toBe('usual') // a handful of people is no trend
    expect(compareToUsual(5, null)).toBeNull()
  })
})
