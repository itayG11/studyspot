import type { ReactNode } from 'react'
import styles from './Badge.module.css'

export type Availability = 'free' | 'filling' | 'full' | 'closed'

// A coloured shape and words: free is a full dot, filling a half dot, full a
// ring with a bar, closed a dash. Colour is never the only signal, for
// colour-blind students and for print.
export function Badge({ tone, children }: { tone: Availability; children: ReactNode }) {
  return (
    <span className={`${styles.badge} ${styles[tone]}`}>
      <Shape tone={tone} />
      {children}
    </span>
  )
}

function Shape({ tone }: { tone: Availability }) {
  return (
    <svg viewBox="0 0 12 12" aria-hidden="true" className={styles.shape} data-shape={tone}>
      {tone === 'free' && <circle cx="6" cy="6" r="5" fill="currentColor" />}
      {tone === 'filling' && (
        <>
          <circle cx="6" cy="6" r="4.25" fill="none" stroke="currentColor" strokeWidth="1.5" />
          <path d="M6 1.75a4.25 4.25 0 0 1 0 8.5z" fill="currentColor" />
        </>
      )}
      {tone === 'full' && (
        <>
          <circle cx="6" cy="6" r="4.25" fill="none" stroke="currentColor" strokeWidth="1.5" />
          <path d="M3 9 9 3" stroke="currentColor" strokeWidth="1.5" />
        </>
      )}
      {tone === 'closed' && <path d="M2 6h8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />}
    </svg>
  )
}
