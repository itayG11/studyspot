// The live line on each space card ("38 of 50 free", "free from 13:30"),
// with the tone of its badge. Pure functions.

import type { Place } from '../api/types'
import type { Availability } from '../ui/Badge'
import { placeLevel, type Level } from './occupancy'
import { formatTime } from './time'

const TONES: Record<Level, Availability> = {
  low: 'free',
  medium: 'filling',
  high: 'full',
  closed: 'closed',
  construction: 'closed',
}

export interface SpaceStatus {
  tone: Availability
  label: string
}

export function spaceStatus(place: Place, timeZone: string): SpaceStatus {
  if (!place.is_open) return { tone: 'closed', label: 'סגור עכשיו' }
  if (place.kind === 'group_room') {
    if (place.free_now) return { tone: 'free', label: 'פנוי עכשיו' }
    if (place.free_from) return { tone: 'full', label: `פנוי מ-${formatTime(place.free_from, timeZone)}` }
    return { tone: 'full', label: 'תפוס' }
  }
  if (place.available === 0) return { tone: 'full', label: 'מלא' }
  return { tone: TONES[placeLevel(place)], label: `${place.available} מתוך ${place.capacity} פנויים` }
}

// Can a student use it right now: an open place with room, or a group room
// that nobody holds.
export function isFreeNow(place: Place): boolean {
  if (!place.is_open) return false
  if (place.kind === 'group_room') return place.free_now === true
  return place.available > 0
}
