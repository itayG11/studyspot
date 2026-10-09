// What an institution admin can do. The server checks the role on every call.

import { api } from './client'
import type { BuildingCreated, BuildingLocation, NewBuilding, NewPlace, PlaceCode, PlaceCreated } from './types'

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
