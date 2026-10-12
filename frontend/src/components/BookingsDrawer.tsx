// The bookings ahead, in a drawer from the side: open from the header on
// any page, cancel one, and close, without leaving the page. The full list
// (extend, check-in, history) stays in "my area".
//
// It is the same <dialog> as the booking sheet (ui/Sheet): focus stays
// inside, Escape closes it, and focus goes back to the button that opened it.

import type { Booking } from '../api/types'
import { useAction } from '../hooks/useAction'
import { formatDay, formatTime } from '../logic/time'
import { ActionError, ButtonLink, ConfirmButton, Sheet, useToast } from '../ui'
import styles from './BookingsDrawer.module.css'

interface BookingsDrawerProps {
  open: boolean
  bookings: Booking[] // the active ones, soonest first
  timeZone: string
  onClose: () => void
  onCancel: (id: number) => Promise<void>
}

export function BookingsDrawer({ open, bookings, timeZone, onClose, onCancel }: BookingsDrawerProps) {
  return (
    <Sheet open={open} onClose={onClose} title="ההזמנות הקרובות" side="end">
      {bookings.length === 0 ? (
        <p className={styles.empty}>אין הזמנות קרובות.</p>
      ) : (
        <ul className={styles.list}>
          {bookings.map((booking) => (
            <Row key={booking.id} booking={booking} timeZone={timeZone} onCancel={onCancel} />
          ))}
        </ul>
      )}
      <ButtonLink to="/me" variant="ghost" onClick={onClose}>
        לכל ההזמנות באזור שלי
      </ButtonLink>
    </Sheet>
  )
}

function Row({ booking, timeZone, onCancel }: { booking: Booking; timeZone: string; onCancel: (id: number) => Promise<void> }) {
  const toast = useToast()
  const action = useAction()
  const where = `${booking.place_name}${booking.seat_label ? `, תא ${booking.seat_label}` : ''}`
  const day = formatDay(booking.starts_at, timeZone)
  const time = `${formatTime(booking.starts_at, timeZone)}–${formatTime(booking.ends_at, timeZone)}`
  // Like "my area": a walk-in, or a booking already checked into, ends by checking out.
  const canCancel = booking.status === 'booked' && booking.source === 'advance'
  return (
    <li className={styles.row} aria-label={`${where}, ${day} ${time}`}>
      <div className={styles.text}>
        <strong className={styles.place}>{where}</strong>
        <span className={styles.when}>
          {day} · <span className={styles.num}>{time}</span>
        </span>
        {booking.status === 'checked_in' && <span className={styles.in}>אתה כאן עכשיו</span>}
      </div>
      {canCancel && (
        <ConfirmButton
          size="sm"
          label="לבטל"
          confirmLabel="כן, לבטל"
          busy={action.busy}
          onConfirm={() =>
            void action.run(async () => {
              await onCancel(booking.id)
              toast(`ההזמנה ל-${where} בוטלה.`, 'success')
            })
          }
        />
      )}
      <div className={styles.error}>
        <ActionError action={action} />
      </div>
    </li>
  )
}
