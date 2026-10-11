// "Live", next to numbers that refresh on their own (every 30 seconds).
// On the demo campus the people counted are made up (backend
// app/seed/live.py), and the note says so: never shown as real.

import styles from './LiveNote.module.css'

export function LiveNote({ simulated, className = '' }: { simulated: boolean; className?: string }) {
  return (
    <span className={`${styles.note} ${className}`}>
      <span className={styles.dot} aria-hidden="true" />
      <span>חי</span>
      {simulated && <span className={styles.demo}>· נתוני דמו: נוכחות מדומה</span>}
    </span>
  )
}
