import { AirVent, Computer, Monitor, Plug, Presentation, Printer, Projector, Sun, type LucideIcon } from 'lucide-react'
import type { Amenity } from '../../api/types'

export const AMENITY_ICONS: Record<Amenity, LucideIcon> = {
  outlets: Plug,
  whiteboard: Presentation,
  projector: Projector,
  screen: Monitor,
  computers: Computer,
  ac: AirVent,
  daylight: Sun,
  printer: Printer,
}

// The card shows three; these say the most about a place, so they go first.
const PRIORITY: Amenity[] = ['computers', 'whiteboard', 'outlets', 'printer', 'screen', 'projector', 'daylight', 'ac']

export function topAmenities(amenities: Amenity[], count = 3): Amenity[] {
  return PRIORITY.filter((a) => amenities.includes(a)).slice(0, count)
}
