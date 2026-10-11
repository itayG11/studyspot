// What a signed-in student can do: book, check in, and manage both.

import { api, ApiError } from './client'
import type { Availability, BetweenClasses, Booking, CheckIn, ClassSlot, ImportRow, NewClass } from './types'

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

// The student's own week, and the places it suggests between classes.
export const myClasses = () => api<ClassSlot[]>('/me/classes', { auth: true })
export const addClass = (lesson: NewClass) => api<ClassSlot>('/me/classes', { method: 'POST', body: lesson, auth: true })
// Several classes at once (an imported timetable): each one's answer, in order.
export const addClasses = (lessons: NewClass[]) =>
  api<{ refused: string | null }[]>('/me/classes/bulk', { method: 'POST', body: lessons, auth: true })
// A timetable file from the college: what it holds, nothing saved yet.
export const previewImport = (file: Blob) => api<ImportRow[]>('/me/classes/import', { method: 'POST', file, auth: true })
// A photo of the timetable, read by Claude on the server: the same preview.
export const previewPhoto = (file: Blob) => api<ImportRow[]>('/me/classes/import-photo', { method: 'POST', file, auth: true })
// Which ways in the server offers (a photo needs its key).
export const importOptions = () => api<{ photo: boolean }>('/me/classes/import-options', { auth: true })
// The whole timetable at once.
export const removeAllClasses = () => api<{ removed: number }>('/me/classes', { method: 'DELETE', auth: true })
export const removeClass = (id: number) => api<void>(`/me/classes/${id}`, { method: 'DELETE', auth: true })
// Today's gaps, or another weekday's (its next date, by the forecast).
export const betweenClasses = (weekday?: number) =>
  api<BetweenClasses>(`/me/between-classes${weekday === undefined ? '' : `?weekday=${weekday}`}`, { auth: true })

