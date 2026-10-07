// Sample server responses for component tests, shaped like the Braude data.
import type { Building, Place, Seat } from '../api/types'

export function building(overrides: Partial<Building> = {}): Building {
  return {
    id: 1, code: 'M', name: null, status: 'active', floors_count: 3,
    latitude: '32.912751', longitude: '35.282293', places_count: 2,
    capacity: 65, occupied: 5, available: 60,
    ...overrides,
  }
}

export function place(overrides: Partial<Place> = {}): Place {
  return {
    id: 1, building_code: 'M', kind: 'computer_lab', name: 'M206', floor: 1,
    location_note: null, capacity: 40, occupied: 2, available: 38,
    is_open: true, bookable: true, counted: false,
    ...overrides,
  }
}

export function seat(overrides: Partial<Seat> = {}): Seat {
  return { id: 1, row: 1, col: 1, label: 'A1', occupied: false, free_now: true, free_until: null, ...overrides }
}

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}
