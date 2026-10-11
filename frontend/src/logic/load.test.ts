import { describe, expect, it } from 'vitest'
import { compareToUsual, hourly, withToday } from './load'

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

describe('withToday', () => {
  it('puts today next to each usual hour, up to the hour under way', () => {
    const hours = withToday(
      [{ hour: 9, usual: 3, today: null }, { hour: 10, usual: 5, today: null }, { hour: 11, usual: 4, today: null }],
      [{ start: '09:00:00', people: 4 }],
      '10:20',
    )
    expect(hours).toEqual([
      { hour: 9, usual: 3, today: 4 },
      { hour: 10, usual: 5, today: 0 }, // under way, nobody counted (or a few): 0, not "to come"
      { hour: 11, usual: 4, today: null },
    ])
  })

  it('with no forecast yet, today alone', () => {
    expect(withToday([], [{ start: '08:00:00', people: 5 }], '09:00')).toEqual([{ hour: 8, usual: null, today: 5 }])
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
