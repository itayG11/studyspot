import { describe, expect, it } from 'vitest'
import type { Forecast } from '../api/types'
import { forecastLimit, freesAt, levelWord, usualAt } from './forecast'

function make(slots: [string, number][]): Forecast {
  return {
    weekday: 6, capacity: 50, weeks: 4, simulated: false, closed: false, frees_at: null, today: [],
    slots: slots.map(([start, people]) => ({ start: `${start}:00`, people })),
  }
}

describe('forecast', () => {
  it('a group room is full with one group, every other place with every seat', () => {
    expect(forecastLimit('group_room', 6)).toBe(1)
    expect(forecastLimit('open_area', 50)).toBe(50)
  })

  it('reads the usual count of the quarter hour a time falls in', () => {
    const forecast = make([['10:00', 10], ['10:15', 20]])
    expect(usualAt(forecast, '10:20')).toBe(20)
    expect(usualAt(forecast, '09:59')).toBeNull()
  })

  it('names the levels in words, not only colours', () => {
    expect(levelWord('low', 'open_area')).toBe('שקט')
    expect(levelWord('high', 'library')).toBe('עמוס')
    expect(levelWord('high', 'group_room')).toBe('בדרך כלל תפוס')
  })

  it('frees up in the first later quarter hour that is usually not full', () => {
    const forecast = make([['10:00', 20], ['10:15', 50], ['10:30', 50], ['10:45', 30]])
    expect(freesAt(forecast, '10:05', 50)).toBe('10:45') // 10:00 is under way: no news
    expect(freesAt(forecast, '10:50', 50)).toBeNull()
  })
})
