import type { Booking } from '../../api/types'
import { floorLabel } from '../../i18n/labels'
import { calendarFile } from '../../logic/ics'

// Hands the booking to the browser as a calendar file to save or open.
export function downloadBooking(booking: Booking, floor: number | null): void {
  const where = `בניין ${booking.building_code}${floor === null ? '' : `, ${floorLabel(floor)}`}`
  const file = calendarFile({
    uid: `booking-${booking.id}@studyspot`,
    title: `${booking.place_name}${booking.seat_label ? `, תא ${booking.seat_label}` : ''} · StudySpot`,
    location: where,
    description: 'כשתגיע, סרוק את הקוד שבמקום כדי לאשר שהגעת.',
    start: booking.starts_at,
    end: booking.ends_at,
  })
  const url = URL.createObjectURL(new Blob([file], { type: 'text/calendar;charset=utf-8' }))
  const link = document.createElement('a')
  link.href = url
  link.download = `studyspot-${booking.id}.ics`
  link.click()
  URL.revokeObjectURL(url)
}
