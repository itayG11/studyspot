// Wording and colours for places and buildings. Pure functions, no drawing.

import type { Building, Place, PlaceKind } from '../api/types'
import { STATUS_LABELS } from '../i18n/labels'

// One line about how much room there is, worded for each kind of place.
export function availabilityText(place: Place): string {
  if (place.kind === 'group_room') return `חדר שלם עד ${place.capacity} אנשים, בהזמנה מראש`
  if (!place.is_open) return 'סגור עכשיו'
  const unit = place.kind === 'computer_lab' ? 'תאים' : 'מקומות'
  return `${place.available} ${unit} פנויים מתוך ${place.capacity}`
}

export function buildingSummary(building: Building): string {
  if (building.status === 'under_construction') return STATUS_LABELS.under_construction
  if (building.places_count === 0) return 'אין עדיין מקומות לימוד'
  if (building.capacity === 0) return 'אין עכשיו מקום פתוח לישיבה חופשית'
  return `${building.available} מקומות פנויים מתוך ${building.capacity}`
}

// Each kind of place has its own strip colour on its card.
export const KIND_COLORS: Record<PlaceKind, string> = {
  open_area: '#0f9d58',
  library: '#2f5bd3',
  computer_lab: '#141a2e',
  group_room: '#ff5b14',
}
