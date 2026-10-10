// Reading the load forecast (GET /places/{id}/forecast) for the page:
// hours instead of quarter hours, and the same levels as the live count.

import type { Forecast, PlaceKind } from '../api/types'
import { HIGH_FROM, MEDIUM_FROM } from './occupancy'

export type ForecastLevel = 'low' | 'medium' | 'high'

export interface HourForecast {
  hour: number // local, 0–23
  people: number // the average of its quarter hours
  share: number // of full, 0–1
  level: ForecastLevel
}

// One group fills a room; every other place is full when every seat is.
export function forecastLimit(kind: PlaceKind, capacity: number): number {
  return kind === 'group_room' ? 1 : capacity
}

export function byHour(forecast: Forecast, limit: number): HourForecast[] {
  const hours = new Map<number, number[]>()
  for (const slot of forecast.slots) {
    const hour = Number(slot.start.slice(0, 2))
    hours.set(hour, [...(hours.get(hour) ?? []), slot.people])
  }
  return [...hours].map(([hour, quarters]) => {
    const people = Math.round((quarters.reduce((a, b) => a + b, 0) / quarters.length) * 10) / 10
    const share = limit > 0 ? Math.min(people / limit, 1) : 0
    return { hour, people, share, level: share >= HIGH_FROM ? 'high' : share >= MEDIUM_FROM ? 'medium' : 'low' }
  })
}

// The usual count of the quarter hour a local "HH:MM" falls in.
export function usualAt(forecast: Forecast, clock: string): number | null {
  const minutes = toMinutes(clock)
  const slot = forecast.slots.find((s) => toMinutes(s.start) <= minutes && minutes < toMinutes(s.start) + 15)
  return slot ? slot.people : null
}

// "Usually frees up at": the first quarter hour after the one under way at
// a local "HH:MM" that is usually not full. Worked out here from the same
// answer, so it moves on with the clock while the page stays open.
export function freesAt(forecast: Forecast, clock: string, limit: number): string | null {
  const current = Math.floor(toMinutes(clock) / 15) * 15
  const slot = forecast.slots.find((s) => toMinutes(s.start) > current && s.people < limit - 0.5)
  return slot ? slot.start.slice(0, 5) : null
}

const WORDS: Record<ForecastLevel, string> = { low: 'שקט', medium: 'בינוני', high: 'עמוס' }
const ROOM_WORDS: Record<ForecastLevel, string> = {
  low: 'בדרך כלל פנוי',
  medium: 'לפעמים תפוס',
  high: 'בדרך כלל תפוס',
}

export function levelWord(level: ForecastLevel, kind: PlaceKind): string {
  return (kind === 'group_room' ? ROOM_WORDS : WORDS)[level]
}

function toMinutes(clock: string): number {
  return Number(clock.slice(0, 2)) * 60 + Number(clock.slice(3, 5))
}
