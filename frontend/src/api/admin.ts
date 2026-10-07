// What an institution admin can do. The server checks the role on every call.

import { INSTITUTION } from '../config'
import { api } from './client'
import type { BuildingLocation, PlaceCode } from './types'

export const getCodes = () => api<PlaceCode[]>(`/admin/institutions/${encodeURIComponent(INSTITUTION)}/codes`, { auth: true })
export const revokeCode = (placeId: number) =>
  api<PlaceCode>(`/admin/places/${placeId}/revoke-code`, { method: 'POST', auth: true })

// The server keeps 6 decimals (about 10 cm); more would be refused.
export const placeBuilding = (buildingId: number, latitude: number, longitude: number) =>
  api<BuildingLocation>(`/admin/buildings/${buildingId}/location`, {
    method: 'POST',
    auth: true,
    body: { latitude: Number(latitude.toFixed(6)), longitude: Number(longitude.toFixed(6)) },
  })
