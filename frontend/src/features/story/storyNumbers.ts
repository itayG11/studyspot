// The live numbers the story tells. Pure functions.

import type { Place, PlaceKind } from '../../api/types'
import { isFreeNow } from '../../logic/availability'

const UNITS: Record<PlaceKind, [one: string, many: string]> = {
  computer_lab: ['תא פנוי עכשיו', 'תאים פנויים עכשיו'],
  open_area: ['מקום פנוי עכשיו', 'מקומות פנויים עכשיו'],
  library: ['מקום פנוי עכשיו', 'מקומות פנויים עכשיו'],
  group_room: ['חדר פנוי עכשיו', 'חדרים פנויים עכשיו'],
}

// "38 stations free now": seats for walk-in places, whole rooms for group rooms.
export function kindLine(places: Place[], kind: PlaceKind): { count: number; text: string } {
  const ofKind = places.filter((p) => p.kind === kind)
  const count =
    kind === 'group_room'
      ? ofKind.filter(isFreeNow).length
      : ofKind.filter((p) => p.is_open).reduce((sum, p) => sum + p.available, 0)
  const [one, many] = UNITS[kind]
  return { count, text: count === 1 ? one : many }
}
