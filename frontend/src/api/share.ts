// "I'm studying here" (backend app/shares.py): a signed link to a stay,
// which stops working by itself when the stay ends.

import { api } from './client'

export interface SharedStay {
  name: string | null // only if the student chose to show it
  here_now: boolean // false: a booking that has not started yet
  starts_at: string
  until: string
  place_id: number
  place_name: string
  building_code: string
  building_name: string | null
  slug: string
  timezone: string
}

export type StayKind = 'check_in' | 'booking'

export function makeShare(kind: StayKind, id: number, showName: boolean): Promise<{ url: string }> {
  return api<{ url: string }>('/shares', { method: 'POST', body: { kind, id, show_name: showName }, auth: true })
}

export function getShare(token: string): Promise<SharedStay> {
  return api<SharedStay>(`/shares/${encodeURIComponent(token)}`)
}
