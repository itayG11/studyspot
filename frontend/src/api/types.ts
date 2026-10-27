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
  arrive_early_if_free_minutes: number
  no_show_after_minutes: number
}

// One line of the public list of institutions (only the active ones).
export interface InstitutionListItem {
  slug: string
  name: string
}

// A card on the public institutions page.
export interface InstitutionCard extends InstitutionListItem {
  buildings_count: number
  places_count: number
  is_demo: boolean // the demo campus, with made-up people
}

export interface Institution {
  slug: string
  name: string
  timezone: string
  booking_rules: BookingRules
  // The live numbers include made-up people (the demo campus).
  live_simulated: boolean
  // Closing: everything in it is deleted then. Null when it is not closing.
  closes_at?: string | null
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
  // Full now and not a room: the first quarter hour today that is usually
  // not full, local "HH:MM:SS" (the load forecast).
  usually_frees_at?: string | null
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

export interface SlotForecast {
  start: string // local "HH:MM:SS"
  people: number
}

export interface Forecast {
  weekday: number // Python's numbering: Monday is 0
  capacity: number
  weeks: number // how many past days the averages come from
  simulated: boolean // some counts are the demo campus's made-up ones
  closed: boolean
  slots: SlotForecast[] // empty when closed, or with too little history
  frees_at: string | null // today only, local "HH:MM:SS"
  today?: SlotForecast[] // the weekday asked is today (missing from a server older than the site): its quarter hours so far with anyone in
}

// GET /institutions/{slug}/load/today: the campus, all but the group rooms.
export interface CampusToday {
  weekday: number
  capacity: number
  occupied: number // live, now
  free_now: number // seats free in the places open now: 0 when all are closed
  weeks: number // 0: no forecast yet
  simulated: boolean
  slots: { start: string; usual: number | null; today: number | null }[]
  places: { place_id: number; next_hour: number | null }[] // usual share of full in the coming hour
}

export interface PlaceDetail extends Place {
  institution_slug: string // old links carry no institution; the site reads it here
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
  has_password: boolean // may sign in with a password too
  can_set_password: boolean // signed in by an emailed code before: may set one
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
  can_extend: boolean // "still here" may extend it once (no booking, not used yet)
}

export type CheckInMode = 'sign' | 'screen'

export interface PlaceCode {
  place_id: number
  building_code: string
  place_name: string
  code: string
  // Wave 13: a printed sign, or a screen by the door with a new code every minute.
  check_in_mode: CheckInMode
  screen_active: boolean
  screen_last_seen_at: string | null
}

export interface ScreenLink {
  url: string // shown once: the server keeps only an HMAC of the token
  place: PlaceCode
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

// --- The system admin --------------------------------------------------------

export interface ProxyCheck {
  connected_address: string
  forwarded_for: string
  trusted_hops: number
  counted_address: string
}

export interface SystemInstitution {
  slug: string
  name: string
  timezone: string
  is_active: boolean
  buildings: number
  admins: number
  closes_at?: string | null
  can_close?: boolean // false for the demo and the open campus
}

export interface NewInstitution {
  name: string
  slug: string
  timezone: string
}

export interface InviteCreated {
  id: number
  token: string // shown this once; the server keeps only its HMAC
  expires_at: string
}

export interface Invite {
  id: number
  status: 'open' | 'used' | 'revoked' | 'expired'
  created_at: string
  expires_at: string
  used_at: string | null
}

// --- An institution's own setup (its admin) ---------------------------------

export interface LoginRule {
  id: number
  provider: 'email' | 'microsoft'
  value: string
  approved: boolean // an institution admin's rule waits for the system admin
  // A waiting email rule: the DNS TXT record that approves it without the
  // system admin (its name and value). Null otherwise.
  verify_record?: string | null
  verify_value?: string | null
}

export interface PendingRule extends LoginRule {
  institution_slug: string
  institution_name: string
}

export interface Setup {
  slug: string
  name: string
  timezone: string
  is_active: boolean
  locked: boolean // the shared demo campus: shown, but not changed
  rules: LoginRule[]
  buildings: number
  located_buildings: number
  places: number
  microsoft_client_id: string | null
}

export interface GeocodeResult {
  name: string
  latitude: number
  longitude: number
}

// A class in the student's week (/me/classes). Times are local "HH:MM:SS".
export interface ClassSlot {
  id: number
  weekday: number // Python's numbering: Monday is 0
  starts: string
  ends: string
  building_code: string | null // null: a place the campus does not list yet
  place_text: string | null // that place, in the student's words
  title: string | null
}

// A building of the campus, or a place it does not list, one of the two.
export type NewClass = {
  weekday: number
  starts: string // "HH:MM"
  ends: string
  title: string | null
} & ({ building_code: string; place_text?: undefined } | { place_text: string; building_code?: undefined })

// A place students' classes name that the campus does not list (admin).
export interface MentionedPlace {
  text: string
  students: number
}

// A place to study in a gap between classes (/me/between-classes).
export interface Suggestion {
  place_id: number
  name: string
  kind: PlaceKind
  building_code: string
  walk_there: number // minutes, an estimate
  walk_after: number
  sit_from: string // ISO
  sit_until: string
  sit_minutes: number
  bookable: boolean
  capacity: number
  available: number | null // now, for the gap under way (not for rooms)
  usual: number | null // usually there then, for a gap later today
}

export interface Gap {
  starts: string // local "HH:MM:SS"
  ends: string
  from_building: string // a building's code, or a place named in words
  to_building: string
  from_listed: boolean // from_building is a building's code
  to_listed: boolean
  now: boolean
  suggestions: Suggestion[]
}

export interface BetweenClasses {
  weekday: number
  date: string // "YYYY-MM-DD": today, or the next date of that weekday
  gaps: Gap[]
  routed_walks: boolean // walking times from OpenRouteService: credit it
}

// One class read from a timetable file (POST /me/classes/import).
export interface ImportRow {
  weekday: number
  starts: string // "HH:MM"
  ends: string
  building_code: string | null // null: the student picks one
  building_text: string // what the file says
  title: string | null
}

// A table of buildings and places (backend/app/campus_import.py).
export interface ImportedPlace {
  line: number
  kind: PlaceKind
  name: string
  floor: number
  capacity: number | null
  lab_rows: number | null
  lab_cols: number | null
  location_note: string | null
  // "HH:MM-HH:MM", "closed", or null for the campus's usual hours.
  weekday_hours: string | null
  friday_hours: string | null
  // Why it would not go into the building that is there now.
  when_added: 'place_name_taken' | 'floor_not_in_building' | null
}

export interface ImportedBuilding {
  code: string
  name: string | null
  floors_count: number
  status: BuildingStatus
  latitude: string | null
  longitude: string | null
  // What deleting the building that is there would take with it.
  // locked: a seed building of the shared demo campus, which is never deleted.
  existing: {
    name: string | null
    floors_count: number
    places: number
    upcoming_bookings: number
    classes: number
    locked: boolean
    status: BuildingStatus
  } | null
  places: ImportedPlace[]
}

export interface CampusPreview {
  buildings: ImportedBuilding[]
  problems: { line: number; code: string }[]
}

export interface CampusImportBuilding {
  code: string
  name: string | null
  floors_count: number
  status: BuildingStatus
  latitude: string | null
  longitude: string | null
  action: 'create' | 'add' | 'replace'
  expected_places?: number
  expected_upcoming_bookings?: number
  places: (NewPlace & { weekday_hours?: string; friday_hours?: string })[]
}

export interface CampusSaved {
  buildings_added: number
  buildings_replaced: number
  places_added: number
  places_skipped: number
}

// Wave 14.2: an institution's API key (backend app/api/connections.py).
export interface ApiKey {
  id: number
  name: string
  prefix: string // "ss_live_AbCd": the start of the key, to tell them apart
  created_at: string
  last_used_at: string | null
  revoked_at: string | null
}

export interface ApiKeyCreated {
  key: string // shown once: the server keeps only an HMAC of it
  api_key: ApiKey
}

// Wave 14.3: webhooks (backend app/webhooks.py, app/api/connections.py).
export type WebhookEvent = 'checkin.started' | 'checkin.ended' | 'booking.created' | 'booking.cancelled'

export interface Webhook {
  id: number
  url: string
  events: WebhookEvent[]
  active: boolean
  built_in: boolean // the demo's tester: the server's, not to edit
  created_at: string
}

export interface WebhookCreated {
  secret: string // shown once: derived on the server, never stored
  webhook: Webhook
}

export interface WebhookDelivery {
  id: number
  event_id: string
  event_type: string
  status: 'pending' | 'sent' | 'failed'
  attempts: number
  last_status_code: number | null
  last_error: string | null
  created_at: string
  delivered_at: string | null
  next_attempt_at: string | null
}

// Wave 14.5: the demo campus's webhook tester (backend app/webhook_tester.py).
export interface TestHit {
  id: number
  received_at: string
  event_type: string | null
  event_id: string | null
  headers: Record<string, string>
  body: string // pretty-printed JSON
  signature_ok: boolean
  answered: number // 200, or 503 while "failing" is on
}

export interface WebhookTester {
  webhook: Webhook
  failing: boolean
  hits: TestHit[]
}
