// A building's live totals, worked out from the places list (wave 7.1).
//
// The home page refreshes the places every 30 seconds. It used to refresh
// the buildings too, and the server worked out every place's occupancy for
// each list. Now the buildings (names, map position) load once, and their
// numbers follow the places. The rule is the server's (list_buildings in
// backend/app/api/campus.py): open places a student can walk into, so no
// group rooms, which are booked.

import type { Building, Place } from '../api/types'

export function withLiveTotals(buildings: Building[], places: Place[]): Building[] {
  return buildings.map((building) => {
    const walkIn = places.filter(
      (p) => p.building_code === building.code && p.is_open && p.kind !== 'group_room',
    )
    const capacity = walkIn.reduce((sum, p) => sum + p.capacity, 0)
    const occupied = walkIn.reduce((sum, p) => sum + p.occupied, 0)
    return { ...building, capacity, occupied, available: Math.max(capacity - occupied, 0) }
  })
}
