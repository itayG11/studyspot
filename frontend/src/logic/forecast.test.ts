import { describe, expect, it } from 'vitest'
import type { Forecast } from '../api/types'
import { byHour, forecastLimit, levelWord, usualAt } from './forecast'

function make(slots: [string, number][]): Forecast {
  return {
    weekday: 6, capacity: 50, weeks: 4, simulated: false, closed: false, frees_at: null,
    slots: slots.map(([start, people]) => ({ start: `${start}:00`, people })),
  }
}

describe('forecast', () => {
  it('a group room is full with one group, every other place with every seat', () => {
    expect(forecastLimit('group_room', 6)).toBe(1)
    expect(forecastLimit('open_area', 50)).toBe(50)
  })

  it('groups the quarter hours into hours, as their average', () => {
    const hours = byHour(make([['10:00', 10], ['10:15', 20], ['10:30', 30], ['10:45', 40], ['11:00', 45]]), 50)
    expect(hours.map((h) => [h.hour, h.people])).toEqual([[10, 25], [11, 45]])
  })

  it('gives each hour the same levels as the live count', () => {
    const hours = byHour(make([['08:00', 10], ['09:00', 30], ['10:00', 45]]), 50)
    expect(hours.map((h) => h.level)).toEqual(['low', 'medium', 'high'])
  })

  it('never shows more than full', () => {
    expect(byHour(make([['10:00', 70]]), 50)[0].share).toBe(1)
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
})
