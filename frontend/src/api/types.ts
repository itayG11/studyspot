// The shapes the server sends, copied from backend/app/schemas.py.
// If the server changes a field, TypeScript points at every place that uses it.

export type PlaceKind = 'group_room' | 'open_area' | 'library' | 'computer_lab'
export type BuildingStatus = 'active' | 'new' | 'under_construction'
export type UserRole = 'student' | 'institution_admin' | 'system_admin'

export interface Institution {
  slug: string
  name: string
  timezone: string
}

// capacity, occupied and available count seats a student can walk into now.
export interface Occupancy {
  capacity: number
  occupied: number
  available: number
}

export interface Building extends Occupancy {
  id: number
  code: string
  name: string | null
  status: BuildingStatus
  floors_count: number
  // Sent as strings (exact decimals); null until the building is on the map.
  latitude: string | null
  longitude: string | null
  places_count: number
}

export interface Place extends Occupancy {
  id: number
  building_code: string
  kind: PlaceKind
  name: string
  floor: number
  location_note: string | null
  is_open: boolean
  bookable: boolean
  counted: boolean
}

export interface OpeningHours {
  weekday: number // 0 = Monday ... 6 = Sunday, like Python
  opens: string // "07:00:00"
  closes: string
}

export interface Seat {
  id: number
  row: number
  col: number
  label: string
  occupied: boolean
  free_now: boolean
  free_until: string | null // ISO time; null when not free, or free all day
}

export interface PlaceDetail extends Place {
  opening_hours: OpeningHours[]
  open_all_day_today: boolean
  lab_rows: number | null
  lab_cols: number | null
  seats: Seat[] | null // only for computer labs
}

export interface Me {
  id: number
  email: string
  display_name: string
  role: UserRole
  institution_slug: string
}

export interface TokenResponse {
  access_token: string
  token_type: 'bearer'
  expires_in: number
  user: Me
}

export interface Providers {
  providers: string[]
  demo: boolean
}

export type DemoPersona = 'student' | 'admin'
