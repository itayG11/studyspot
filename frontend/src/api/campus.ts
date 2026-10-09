// The campus endpoints. All of them are public: no sign-in needed.

import { api } from './client'
import type { Building, Institution, InstitutionListItem, Place, PlaceDetail, PlaceKind, Providers } from './types'

const base = (slug: string) => `/institutions/${encodeURIComponent(slug)}`

export const getInstitutions = () => api<InstitutionListItem[]>('/institutions')
export const getInstitution = (slug: string) => api<Institution>(base(slug))
export const getBuildings = (slug: string) => api<Building[]>(`${base(slug)}/buildings`)
export const getPlace = (id: number) => api<PlaceDetail>(`/places/${id}`)
export const getProviders = () => api<Providers>('/auth/providers')

export function getPlaces(slug: string, filter: { kind?: PlaceKind; building?: string } = {}) {
  const query = new URLSearchParams()
  if (filter.kind) query.set('kind', filter.kind)
  if (filter.building) query.set('building', filter.building)
  const suffix = query.size ? `?${query}` : ''
  return api<Place[]>(`${base(slug)}/places${suffix}`)
}
