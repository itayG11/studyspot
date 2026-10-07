import styles from './ui.module.css'

// How full a place is, as a bar. "taken" of "total" seats.
export function Meter({ taken, total, color }: { taken: number; total: number; color: string }) {
  const share = total > 0 ? Math.min(taken / total, 1) : 0
  return (
    <div className={styles.meter} role="img" aria-label={`${taken} תפוסים מתוך ${total}`}>
      <div className={styles.meterFill} style={{ width: `${share * 100}%`, background: color }} />
    </div>
  )
}
