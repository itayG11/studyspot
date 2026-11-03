// The look of a building's circle on a map.

import type { PathOptions } from 'leaflet'
import { LEVEL_COLORS, type Level } from '../logic/occupancy'

// A white ring reads on both the dark photo and the light street map.
export function circleStyle(level: Level, ring = '#ffffff', weight = 3): PathOptions {
  return {
    color: ring,
    weight,
    fillColor: level === 'construction' ? '#ffcc00' : LEVEL_COLORS[level],
    fillOpacity: 0.95,
    dashArray: level === 'construction' ? '5 4' : undefined,
  }
}
