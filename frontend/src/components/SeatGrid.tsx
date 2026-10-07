// The computer lab as a floor plan: one square per station, in its row and
// column. Columns run left to right, like the seat labels (A1, A2, ...).

import type { CSSProperties } from 'react'
import type { Seat } from '../api/types'
import { SEAT_LABELS, seatDescription, seatState, type SeatState } from '../logic/seats'
import styles from './SeatGrid.module.css'

interface Props {
  seats: Seat[]
  rows: number
  cols: number
  placeOpen: boolean
  timeZone: string
}

export function SeatGrid({ seats, rows, cols, placeOpen, timeZone }: Props) {
  return (
    <figure className={styles.wrap} dir="ltr" aria-label="מפת התאים">
      <div className={styles.front} dir="rtl">כניסה</div>
      <ul
        aria-label="תאים"
        className={styles.grid}
        style={{ gridTemplateColumns: `repeat(${cols}, auto)`, gridTemplateRows: `repeat(${rows}, auto)` }}
      >
        {seats.map((seat, i) => {
          const description = seatDescription(seat, placeOpen, timeZone)
          return (
            <li
              key={seat.id}
              className={`${styles.seat} ${styles[seatState(seat, placeOpen)]}`}
              style={{ gridRow: seat.row, gridColumn: seat.col, '--i': i } as CSSProperties}
              title={description}
              aria-label={description}
            >
              {seat.label}
            </li>
          )
        })}
      </ul>
      <ul className={styles.legend} dir="rtl">
        {(Object.keys(SEAT_LABELS) as SeatState[]).map((state) => (
          <li key={state}>
            <span className={`${styles.seat} ${styles[state]}`} />
            {SEAT_LABELS[state]}
          </li>
        ))}
      </ul>
    </figure>
  )
}
