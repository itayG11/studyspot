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
  // Choosing a station (to book it, or to sit in it). Without these the
  // map only shows the stations.
  canSelect?: (seat: Seat) => boolean
  selectedId?: number | null
  onSelect?: (seat: Seat) => void
}

export function SeatGrid({ seats, rows, cols, placeOpen, timeZone, canSelect, selectedId, onSelect }: Props) {
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
          const classes = [styles.seat, styles[seatState(seat, placeOpen)], seat.id === selectedId && styles.selected]
          const position = { gridRow: seat.row, gridColumn: seat.col, '--i': i } as CSSProperties
          if (onSelect && canSelect?.(seat)) {
            return (
              <li key={seat.id} style={position} className={styles.cell}>
                <button
                  type="button"
                  className={classes.filter(Boolean).join(' ')}
                  title={description}
                  aria-label={description}
                  aria-pressed={seat.id === selectedId}
                  onClick={() => onSelect(seat)}
                >
                  {seat.label}
                </button>
              </li>
            )
          }
          return (
            <li
              key={seat.id}
              className={classes.filter(Boolean).join(' ')}
              style={position}
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
