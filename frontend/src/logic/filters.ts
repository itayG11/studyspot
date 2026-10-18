// The finder's search and filters, kept in the address so a link shows the
// same results to someone else. Pure functions.
//
// Address format: ?q=...&free=1&quiet=1&kind=library&near=EM&view=map
//   &building=M&people=4&amenity=projector (the expanded filters)
// Unknown values are ignored: the address is input from anyone.

import type { Amenity, Building, Place, PlaceKind } from '../api/types'
import { AMENITIES, KINDS } from '../i18n/labels'
import { isFreeNow } from './availability'
import { position } from './occupancy'
import { matchesSearch } from './search'

export type Flag = 'free' | 'quiet' | 'group' | 'computers' | 'outlets'
export type View = 'list' | 'map'

export const FLAGS: Flag[] = ['free', 'quiet', 'group', 'computers', 'outlets']

export interface Filters {
  q: string
  flags: Flag[]
  kinds: PlaceKind[]
  near: string | null // a building code: sort by distance from it
  view: View
  // The expanded filters
  building: string | null // only this building's places
  people: number | null // room for at least this many
  amenities: Amenity[] // every one of these
}

export const EMPTY_FILTERS: Filters = { q: '', flags: [], kinds: [], near: null, view: 'list', building: null, people: null, amenities: [] }

// The group sizes the expanded filter offers.
export const PEOPLE_OPTIONS = [2, 4, 8, 20]

const MAX_QUERY = 80
const BUILDING_CODE = /^[A-Z]{1,4}$/

const FLAG_TESTS: Record<Flag, (place: Place) => boolean> = {
  free: isFreeNow,
  quiet: (p) => p.atmosphere === 'quiet',
  group: (p) => p.suited_for !== 'solo',
  computers: (p) => p.amenities.includes('computers'),
  outlets: (p) => p.amenities.includes('outlets'),
}

const code = (value: string | null) => (value !== null && BUILDING_CODE.test(value) ? value : null)

export function readFilters(params: URLSearchParams): Filters {
  const people = Number(params.get('people'))
  // Only a size the panel offers: ?people=7 would filter while it showed "any".
  const amenities = params.getAll('amenity')
  return {
    q: (params.get('q') ?? '').slice(0, MAX_QUERY),
    flags: FLAGS.filter((flag) => params.get(flag) === '1'),
    kinds: params.getAll('kind').filter((k): k is PlaceKind => (KINDS as string[]).includes(k)),
    near: code(params.get('near')),
    view: params.get('view') === 'map' ? 'map' : 'list',
    building: code(params.get('building')),
    people: PEOPLE_OPTIONS.includes(people) && params.get('people') === String(people) ? people : null,
    amenities: AMENITIES.filter((a) => amenities.includes(a)),
  }
}

export function writeFilters(filters: Filters): URLSearchParams {
  const params = new URLSearchParams()
  if (filters.q) params.set('q', filters.q)
  for (const flag of filters.flags) params.set(flag, '1')
  for (const kind of filters.kinds) params.append('kind', kind)
  if (filters.near) params.set('near', filters.near)
  if (filters.view === 'map') params.set('view', 'map')
  if (filters.building) params.set('building', filters.building)
  if (filters.people) params.set('people', String(filters.people))
  for (const amenity of filters.amenities) params.append('amenity', amenity)
  return params
}

export function hasFilters(filters: Filters): boolean {
  return filters.q.trim() !== '' || filters.flags.length > 0 || filters.kinds.length > 0 || advancedCount(filters) > 0
}

// How many of the expanded filters are on: the number on their button.
export function advancedCount(filters: Filters): number {
  return Number(filters.building !== null) + Number(filters.people !== null) + filters.amenities.length
}

const toggle = <T,>(list: T[], item: T, order: T[]): T[] =>
  list.includes(item) ? list.filter((x) => x !== item) : order.filter((x) => x === item || list.includes(x))

export const toggleFlag = (filters: Filters, flag: Flag): Filters => ({ ...filters, flags: toggle(filters.flags, flag, FLAGS) })
export const toggleKind = (filters: Filters, kind: PlaceKind): Filters => ({ ...filters, kinds: toggle(filters.kinds, kind, KINDS) })
export const toggleAmenity = (filters: Filters, amenity: Amenity): Filters => ({ ...filters, amenities: toggle(filters.amenities, amenity, AMENITIES) })

function passes(place: Place, filters: Filters): boolean {
  return (
    matchesSearch(place, filters.q) &&
    filters.flags.every((flag) => FLAG_TESTS[flag](place)) &&
    (filters.kinds.length === 0 || filters.kinds.includes(place.kind)) &&
    (filters.building === null || place.building_code === filters.building) &&
    (filters.people === null || place.capacity >= filters.people) &&
    filters.amenities.every((a) => place.amenities.includes(a))
  )
}

// The places that pass, in order: by distance from the chosen building if
// there is one, otherwise the ones free right now first.
export function applyFilters(places: Place[], filters: Filters, buildings: Building[]): Place[] {
  const kept = places.filter((p) => passes(p, filters))
  const origin = buildings.find((b) => b.code === filters.near)
  const from = origin ? position(origin) : null
  if (from) {
    const where = new Map(buildings.map((b) => [b.code, position(b)]))
    const distance = (p: Place) => {
      const to = where.get(p.building_code)
      return to ? distanceMetres(from, to) : Infinity
    }
    return kept.toSorted((a, b) => distance(a) - distance(b))
  }
  return kept.toSorted((a, b) => Number(isFreeNow(b)) - Number(isFreeNow(a)))
}

// How many places there would be with this chip on: the number on the chip.
export function countWith(places: Place[], filters: Filters, flag: Flag): number {
  const withFlag = filters.flags.includes(flag) ? filters : toggleFlag(filters, flag)
  return places.filter((p) => passes(p, withFlag)).length
}

const EARTH_RADIUS = 6_371_000

// The haversine formula: distance on the earth's surface between two points.
export function distanceMetres([lat1, lon1]: [number, number], [lat2, lon2]: [number, number]): number {
  const rad = (deg: number) => (deg * Math.PI) / 180
  const dLat = rad(lat2 - lat1)
  const dLon = rad(lon2 - lon1)
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLon / 2) ** 2
  return 2 * EARTH_RADIUS * Math.asin(Math.sqrt(a))
}
