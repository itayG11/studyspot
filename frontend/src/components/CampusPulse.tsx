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
  const free = Math.max(0, today.capacity - today.occupied)
  const words = `${free} מקומות פנויים עכשיו בקמפוס${today.simulated ? ', נתוני דמו' : ''}`
  return (
    <Link to={`${home}#finder`} className={styles.pulse} aria-label={words}>
      <span className={styles.dot} aria-hidden="true" />
      <span aria-hidden="true">
        <strong className={styles.number}>{free}</strong>
        <span className={styles.words}> פנויים עכשיו</span>
        {today.simulated && <span className={styles.demo}> · דמו</span>}
      </span>
    </Link>
  )
}
