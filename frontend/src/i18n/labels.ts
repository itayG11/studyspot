import type { BuildingStatus, PlaceKind } from '../api/types'

export const KIND_LABELS: Record<PlaceKind, string> = {
  group_room: 'חדר לימוד קבוצתי',
  open_area: 'מתחם לימוד פתוח',
  library: 'ספרייה',
  computer_lab: 'חוות מחשבים',
}

// The order the filter buttons appear in.
export const KINDS: PlaceKind[] = ['open_area', 'library', 'computer_lab', 'group_room']

export const STATUS_LABELS: Record<BuildingStatus, string> = {
  active: 'פעיל',
  new: 'בניין חדש',
  under_construction: 'בבנייה',
}

export function floorLabel(floor: number): string {
  return floor === 0 ? 'קומת קרקע' : `קומה ${floor}`
}
