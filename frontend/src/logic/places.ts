// Wording for places. Pure functions, no drawing.

import type { Place } from '../api/types'

// One line about how much room there is, worded for each kind of place.
export function availabilityText(place: Place): string {
  if (place.kind === 'group_room') return `חדר שלם עד ${place.capacity} אנשים, בהזמנה מראש`
  if (!place.is_open) return 'סגור עכשיו'
  const unit = place.kind === 'computer_lab' ? 'תאים' : 'מקומות'
  return `${place.available} ${unit} פנויים מתוך ${place.capacity}`
}
