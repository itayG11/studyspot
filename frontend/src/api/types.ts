// The shapes the server sends, copied from backend/app/schemas.py.
// If the server changes a field, TypeScript points at every place that uses it.

export type PlaceKind = 'group_room' | 'open_area' | 'library' | 'computer_lab'
export type BuildingStatus = 'active' | 'new' | 'under_construction'
export type UserRole = 'student' | 'institution_admin' | 'system_admin'
export type Atmosphere = 'quiet' | 'conversation' | 'mixed'
export type SuitedFor = 'solo' | 'group' | 'both'
export type Amenity = 'outlets' | 'whiteboard' | 'projector' | 'screen' | 'computers' | 'ac' | 'daylight' | 'printer'

export interface BookingRules {
  slot_minutes: number
  max_minutes: number
  days_ahead: number // calendar days to offer
  horizon_minutes: number // the exact limit the server checks
  max_upcoming: number
  arrive_early_minutes: number
  no_show_after_minutes: number
}

export interface Institution {
  slug: string
  name: string
  timezone: string
  booking_rules: BookingRules
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
  atmosphere: Atmosphere
  suited_for: SuitedFor
  amenities: Amenity[] // sorted
  details_are_demo: boolean // the three fields above are sample data
  // Group rooms only (null elsewhere): free right now, and if not, from when.
  free_now: boolean | null
  free_from: string | null
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
  is_demo: boolean // a shared demo user: no e-mail of its own, cannot be deleted
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
  email?: boolean // a one-time code by email (absent on older servers)
}

export interface EmailStart {
  expires_in: number // seconds the code is valid
}

export type DemoPersona = 'student' | 'admin'

export type BookingStatus = 'booked' | 'checked_in' | 'completed' | 'cancelled' | 'no_show'

export interface BusyRange {
  seat_id: number | null
  starts_at: string
  ends_at: string
}

export interface Availability {
  place_id: number
  date: string
  busy: BusyRange[]
}

export interface Booking {
  id: number
  place_id: number
  place_name: string
  building_code: string
  seat_id: number | null
  seat_label: string | null
  starts_at: string
  ends_at: string
  status: BookingStatus
  source: 'advance' | 'walk_in'
}

export interface CheckIn {
  id: number
  place_id: number
  place_name: string
  building_code: string
  seat_id: number | null
  seat_label: string | null
  started_at: string
  expires_at: string
  ended_at: string | null
  end_reason: 'checkout' | 'expired' | 'moved' | null
  booking_id: number | null
  cut_short_by: 'booking' | 'closing' | null
}

export interface PlaceCode {
  place_id: number
  building_code: string
  place_name: string
  code: string
}

export interface NewBuilding {
  code: string
  name?: string
  floors_count: number
}

export interface BuildingCreated {
  id: number
  code: string
  name: string | null
  floors_count: number
  latitude: string | null
  longitude: string | null
}

// A computer lab gives rows and columns of stations; the others a capacity.
export interface NewPlace {
  kind: PlaceKind
  name: string
  floor: number
  capacity?: number
  lab_rows?: number
  lab_cols?: number
  location_note?: string
}

export interface PlaceCreated {
  id: number
  building_id: number
  name: string
  kind: PlaceKind
  capacity: number
}

export interface BuildingLocation {
  id: number
  code: string
  latitude: string
  longitude: string
}
