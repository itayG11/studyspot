import { describe, expect, it } from 'vitest'
import type { Building } from '../api/types'
import { occupancyLevel, position } from './occupancy'

function building(overrides: Partial<Building>): Building {
  return {
    id: 1, code: 'M', name: null, status: 'active', floors_count: 3,
    latitude: '32.912751', longitude: '35.282293', places_count: 2,
    capacity: 100, occupied: 0, available: 100,
    ...overrides,
  }
}

describe('occupancyLevel', () => {
  it.each([
    [0, 'low'],
    [49, 'low'],
    [50, 'medium'],
    [84, 'medium'],
    [85, 'high'],
    [100, 'high'],
  ])('%i of 100 taken is %s', (occupied, level) => {
    expect(occupancyLevel(building({ occupied }))).toBe(level)
  })

  it('nothing open now is closed, not empty', () => {
    expect(occupancyLevel(building({ capacity: 0, occupied: 0 }))).toBe('closed')
  })

  it('a building under construction is marked as such', () => {
    expect(occupancyLevel(building({ status: 'under_construction', capacity: 0 }))).toBe('construction')
  })
})

describe('position', () => {
  it('reads the decimal strings', () => {
    expect(position(building({}))).toEqual([32.912751, 35.282293])
  })

  it('is null for a building that is not on the map yet', () => {
    expect(position(building({ latitude: null, longitude: null }))).toBeNull()
  })
})
