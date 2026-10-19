// The screen by the door (backend app/api/screens.py). No sign-in: the
// screen's secret link goes in a header, never in the address.

import { api } from './client'

export interface ScreenView {
  place_name: string
  building_code: string
  code: string | null // null while the place is closed
  seconds_left: number // until the next code
  occupied: number
  capacity: number
}

export function getScreen(token: string): Promise<ScreenView> {
  return api<ScreenView>('/screen', { headers: { 'X-Screen-Token': token } })
}
