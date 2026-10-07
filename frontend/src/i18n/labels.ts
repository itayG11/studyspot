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

const DURATIONS: Record<number, string> = {
  15: 'רבע שעה',
  30: 'חצי שעה',
  45: 'שלושה רבעי שעה',
  60: 'שעה',
  75: 'שעה ורבע',
  90: 'שעה וחצי',
  105: 'שעה ושלושה רבעים',
  120: 'שעתיים',
}

export function durationLabel(minutes: number): string {
  return DURATIONS[minutes] ?? `${minutes} דקות`
}
