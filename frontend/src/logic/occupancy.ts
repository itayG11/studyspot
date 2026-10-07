import type { Building, Place } from '../api/types'

export type Level = 'low' | 'medium' | 'high' | 'closed' | 'construction'

// Thresholds chosen for the demo; easy to change.
export const MEDIUM_FROM = 0.5
export const HIGH_FROM = 0.85

export const LEVEL_COLORS: Record<Level, string> = {
  low: '#2e9e4f',
  medium: '#e0a400',
  high: '#d64541',
  closed: '#8c8c8c',
  construction: '#5b6b8c',
}

export const LEVEL_LABELS: Record<Level, string> = {
  low: 'יש הרבה מקום',
  medium: 'מתמלא',
  high: 'כמעט מלא',
  closed: 'סגור, או אין מקומות פתוחים',
  construction: 'בבנייה',
}

// The server counts only places a student can walk into right now
// (open, and not group rooms). capacity 0 means nothing is open.
export function occupancyLevel(building: Building): Level {
  if (building.status === 'under_construction') return 'construction'
  return shareLevel(building.occupied, building.capacity)
}

// A group room is booked as a whole, so it has no "how full" level.
export function placeLevel(place: Place): Level {
  if (!place.is_open || place.kind === 'group_room') return 'closed'
  return shareLevel(place.occupied, place.capacity)
}

function shareLevel(occupied: number, capacity: number): Level {
  if (capacity === 0) return 'closed'
  const share = occupied / capacity
  if (share >= HIGH_FROM) return 'high'
  if (share >= MEDIUM_FROM) return 'medium'
  return 'low'
}

export function position(building: Building): [number, number] | null {
  if (building.latitude === null || building.longitude === null) return null
  return [Number(building.latitude), Number(building.longitude)]
}
