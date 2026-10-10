// What an institution admin can do. The server checks the role on every call.

import { api } from './client'
import type { BuildingCreated, BuildingLocation, GeocodeResult, LoginRule, NewBuilding, NewPlace, PlaceCode, PlaceCreated, Setup } from './types'

export const getCodes = (slug: string) =>
  api<PlaceCode[]>(`/admin/institutions/${encodeURIComponent(slug)}/codes`, { auth: true })
export const revokeCode = (placeId: number) =>
  api<PlaceCode>(`/admin/places/${placeId}/revoke-code`, { method: 'POST', auth: true })

// The server keeps 6 decimals (about 10 cm); more would be refused.
export const placeBuilding = (buildingId: number, latitude: number, longitude: number) =>
  api<BuildingLocation>(`/admin/buildings/${buildingId}/location`, {
    method: 'POST',
    auth: true,
    body: { latitude: Number(latitude.toFixed(6)), longitude: Number(longitude.toFixed(6)) },
  })

// New buildings and places. A new place opens at the campus's usual hours,
// and its sign is ready in the signs tab.
export const addBuilding = (slug: string, building: NewBuilding) =>
  api<BuildingCreated>(`/admin/institutions/${encodeURIComponent(slug)}/buildings`, {
    method: 'POST',
    auth: true,
    body: building,
  })

export const addPlace = (buildingId: number, place: NewPlace) =>
  api<PlaceCreated>(`/admin/buildings/${buildingId}/places`, { method: 'POST', auth: true, body: place })

// The institution's own setup: details, who signs in, opening it.
const own = (slug: string) => `/admin/institutions/${encodeURIComponent(slug)}`

export const getSetup = (slug: string) => api<Setup>(`${own(slug)}/setup`, { auth: true })
export const updateInstitution = (slug: string, body: Partial<Pick<Setup, 'name' | 'timezone' | 'is_active'>>) =>
  api<Setup>(own(slug), { method: 'PATCH', auth: true, body })
export const addLoginRule = (slug: string, provider: LoginRule['provider'], value: string) =>
  api<LoginRule>(`${own(slug)}/login-rules`, { method: 'POST', auth: true, body: { provider, value } })
export const removeLoginRule = (id: number) => api<void>(`/admin/login-rules/${id}`, { method: 'DELETE', auth: true })

// Where a place is, through our server to OpenStreetMap (one search a press).
export const geocode = (query: string) =>
  api<GeocodeResult[]>(`/admin/geocode?${new URLSearchParams({ q: query })}`, { auth: true })
