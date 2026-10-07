// The confirmation: a ticket that prints from the top, then a stamp lands
// on it. Rare and happy, so it may take a moment; with "reduce motion" it
// simply fades in.

import { m, useReducedMotionConfig } from 'motion/react'
import { useEffect, useRef } from 'react'
import { CalendarPlus } from 'lucide-react'
import type { Booking } from '../../api/types'
import { EASE_OUT } from '../../design/motion'
import { formatDay, formatTime } from '../../logic/time'
import { Button, ButtonLink } from '../../ui'
import { downloadBooking } from './download'
import styles from './booking.module.css'

interface TicketProps {
  booking: Booking
  floor: number | null
  timeZone: string
  arriveEarlyMinutes: number
  onAnother: () => void
}

export function Ticket({ booking, floor, timeZone, arriveEarlyMinutes, onAnother }: TicketProps) {
  const reduce = useReducedMotionConfig()
  // The "book" button that had the keyboard is gone: the ticket's heading
  // takes it, so a keyboard or screen-reader user stays in place.
  const heading = useRef<HTMLHeadingElement>(null)
  useEffect(() => heading.current?.focus({ preventScroll: true }), [])
  return (
    <div className={styles.ticketWrap}>
      <m.article
        className={styles.ticket}
        initial={reduce ? { opacity: 0 } : { clipPath: 'inset(0% 0% 100% 0%)' }}
        animate={reduce ? { opacity: 1 } : { clipPath: 'inset(0% 0% 0% 0%)' }}
        transition={{ duration: 0.6, ease: EASE_OUT }}
      >
        <p className={styles.ticketEyebrow} role="status">
          ההזמנה נקלטה
        </p>
        <h3 className={styles.ticketPlace} ref={heading} tabIndex={-1}>
          {booking.place_name}
          {booking.seat_label && <span> · תא {booking.seat_label}</span>}
        </h3>
        <p className={styles.ticketDay}>{formatDay(booking.starts_at, timeZone)}</p>
        <p className={styles.ticketTime}>
          {formatTime(booking.starts_at, timeZone)}–{formatTime(booking.ends_at, timeZone)}
        </p>
        <div className={styles.perforation} aria-hidden="true" />
        <p className={styles.ticketNote}>
          כשתגיע, סרוק את הקוד שבמקום. אפשר לאשר הגעה עד {arriveEarlyMinutes} דקות לפני.
        </p>
        <p className={styles.ticketNumber}>הזמנה מספר {booking.id}</p>
        <m.span
          className={styles.stamp}
          aria-hidden="true"
          initial={reduce ? { opacity: 0 } : { opacity: 0, transform: 'rotate(-14deg) scale(1.6)' }}
          animate={reduce ? { opacity: 1 } : { opacity: 1, transform: 'rotate(-14deg) scale(1)' }}
          transition={reduce ? { duration: 0.2 } : { type: 'spring', duration: 0.45, bounce: 0.3, delay: 0.5 }}
        >
          שמור
        </m.span>
      </m.article>
      <div className={styles.ticketActions}>
        <Button variant="secondary" icon={<CalendarPlus aria-hidden="true" />} onClick={() => downloadBooking(booking, floor)}>
          הוספה ליומן
        </Button>
        <ButtonLink to="/me" variant="ghost">
          להזמנות שלי
        </ButtonLink>
        <Button variant="ghost" onClick={onAnother}>
          הזמנה נוספת
        </Button>
      </div>
    </div>
  )
}
