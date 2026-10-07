import type { Amenity, Atmosphere, BuildingStatus, PlaceKind, SuitedFor } from '../api/types'

export const KIND_LABELS: Record<PlaceKind, string> = {
  group_room: 'חדר לימוד קבוצתי',
  open_area: 'מתחם לימוד פתוח',
  library: 'ספרייה',
  computer_lab: 'חוות מחשבים',
}

// The order the filter buttons appear in.
export const KINDS: PlaceKind[] = ['open_area', 'library', 'computer_lab', 'group_room']

export const AMENITY_LABELS: Record<Amenity, string> = {
  outlets: 'שקעים',
  whiteboard: 'לוח מחיק',
  projector: 'מקרן',
  screen: 'מסך',
  computers: 'מחשבים',
  ac: 'מיזוג',
  daylight: 'אור יום',
  printer: 'מדפסת',
}

export const ATMOSPHERE_LABELS: Record<Atmosphere, string> = {
  quiet: 'שקט',
  conversation: 'אפשר לדבר',
  mixed: 'מעורב',
}

export const SUITED_LABELS: Record<SuitedFor, string> = {
  solo: 'ללימוד לבד',
  group: 'לקבוצה',
  both: 'לבד או בקבוצה',
}

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
