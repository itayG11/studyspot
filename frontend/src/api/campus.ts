// The campus endpoints. All of them are public: no sign-in needed.

import { INSTITUTION } from '../config'
import { api } from './client'
import type { Building, Institution, Place, PlaceDetail, PlaceKind, Providers } from './types'

const base = `/institutions/${encodeURIComponent(INSTITUTION)}`

export const getInstitution = () => api<Institution>(base)
export const getBuildings = () => api<Building[]>(`${base}/buildings`)
export const getPlace = (id: number) => api<PlaceDetail>(`/places/${id}`)
export const getProviders = () => api<Providers>('/auth/providers')

export function getPlaces(filter: { kind?: PlaceKind; building?: string } = {}) {
  const query = new URLSearchParams()
  if (filter.kind) query.set('kind', filter.kind)
  if (filter.building) query.set('building', filter.building)
  const suffix = query.size ? `?${query}` : ''
  return api<Place[]>(`${base}/places${suffix}`)
}
