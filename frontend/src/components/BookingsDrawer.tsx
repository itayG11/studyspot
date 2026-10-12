// The bookings ahead, in a drawer from the side: open from the header on
// any page, cancel one, and close, without leaving the page. The full list
// (extend, check-in, history) stays in "my area".
//
// It is the same <dialog> as the booking sheet (ui/Sheet): focus stays
// inside, Escape closes it, and focus goes back to the button that opened it.

import { useRef, useState } from 'react'
import type { Booking } from '../api/types'
import { useAction } from '../hooks/useAction'
import { formatDay, formatTime } from '../logic/time'
import { ActionError, ButtonLink, ConfirmButton, Sheet } from '../ui'
import styles from './BookingsDrawer.module.css'

interface BookingsDrawerProps {
  open: boolean
  bookings: Booking[] // the active ones, soonest first
  timeZone: string
  onClose: () => void
  onCancel: (id: number) => Promise<void>
}

export function BookingsDrawer({ open, bookings, timeZone, onClose, onCancel }: BookingsDrawerProps) {
  // Said here, not in a toast: the page behind the open drawer, toasts
  // included, is under its backdrop. The note also takes the focus, since
  // the row (and its button) that had it is gone.
  const [done, setDone] = useState<string | null>(null)
  const note = useRef<HTMLParagraphElement>(null)
  const cancelled = (where: string) => {
    setDone(`ההזמנה ל-${where} בוטלה.`)
    requestAnimationFrame(() => note.current?.focus())
  }
  return (
    <Sheet
      open={open}
      onClose={() => {
        setDone(null)
        onClose()
      }}
      title="ההזמנות הקרובות"
      side="end"
    >
      <p ref={note} className={styles.done} role="status" tabIndex={-1}>
        {done}
      </p>
      {bookings.length === 0 ? (
        <p className={styles.empty}>אין הזמנות קרובות.</p>
      ) : (
        <ul className={styles.list}>
          {bookings.map((booking) => (
            <Row key={booking.id} booking={booking} timeZone={timeZone} onCancel={onCancel} onCancelled={cancelled} />
          ))}
        </ul>
      )}
      <ButtonLink to="/me" variant="ghost" onClick={onClose}>
        לכל ההזמנות באזור שלי
      </ButtonLink>
    </Sheet>
  )
}

interface RowProps {
  booking: Booking
  timeZone: string
  onCancel: (id: number) => Promise<void>
  onCancelled: (where: string) => void
}

function Row({ booking, timeZone, onCancel, onCancelled }: RowProps) {
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
              onCancelled(where)
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
