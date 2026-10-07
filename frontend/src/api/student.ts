// What a signed-in student can do: book, check in, and manage both.

import { api, ApiError } from './client'
import type { Availability, Booking, CheckIn } from './types'

export const getAvailability = (placeId: number, date: string) =>
  api<Availability>(`/places/${placeId}/availability?date=${encodeURIComponent(date)}`)

export interface NewBooking {
  place_id: number
  seat_id: number | null
  starts_at: string // ISO time with its zone ("Z")
  ends_at: string
}

export const createBooking = (booking: NewBooking) =>
  api<Booking>('/bookings', { method: 'POST', body: booking, auth: true })
export const myBookings = () => api<Booking[]>('/me/bookings', { auth: true })
export const cancelBooking = (id: number) => api<Booking>(`/bookings/${id}/cancel`, { method: 'POST', auth: true })
export const extendBooking = (id: number) => api<Booking>(`/bookings/${id}/extend`, { method: 'POST', auth: true })

export function checkIn(code: string, seatId: number | null) {
  const body = seatId === null ? { code } : { code, seat_id: seatId }
  return api<CheckIn>('/check-ins', { method: 'POST', body, auth: true })
}

// The current check-in, or null when there is none (the server says 404).
export async function myCheckIn(): Promise<CheckIn | null> {
  try {
    return await api<CheckIn>('/me/check-in', { auth: true })
  } catch (error) {
    if (error instanceof ApiError && error.code === 'no_active_check_in') return null
    throw error
  }
}

export const checkOut = (id: number) => api<CheckIn>(`/check-ins/${id}/checkout`, { method: 'POST', auth: true })
