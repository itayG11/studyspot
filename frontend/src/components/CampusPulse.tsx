// The campus's pulse, in the header on every page: how many places are free
// right now, from the live count (the same answer as the home page's load
// chart, src/features/load/campusToday.tsx). Group rooms are not in it: they
// are booked whole, not counted by the person. On the demo campus the
// people are made up, and it says so. A press goes to the search.

import { Link } from 'react-router'
import type { CampusToday } from '../api/types'
import styles from './CampusPulse.module.css'

export function CampusPulse({ today, home }: { today: CampusToday | null; home: string }) {
  if (today === null || today.capacity === 0) return null
  // From the places open now only: at night, 0, not the campus's size.
  const free = Math.max(0, today.free_now)
  const words = `${free} מקומות פנויים עכשיו בקמפוס${today.simulated ? ', נתוני דמו' : ''}`
  return (
    <Link to={`${home}#finder`} className={styles.pulse} aria-label={words}>
      <span className={styles.dot} aria-hidden="true" />
      <span aria-hidden="true">
        <strong className={styles.number}>{free}</strong>
        {/* On a phone "now" goes; "free" stays, so the number is not a riddle. */}
        <span> פנויים</span>
        <span className={styles.words}> עכשיו</span>
        {today.simulated && <span className={styles.demo}> · דמו</span>}
      </span>
    </Link>
  )
}
