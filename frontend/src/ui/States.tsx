import { RotateCw, TriangleAlert, WifiOff } from 'lucide-react'
import type { ReactNode } from 'react'
import type { ApiError } from '../api/client'
import { errorMessage } from '../i18n/errors'
import { Button } from './Button'
import styles from './States.module.css'

// Nothing to show, and what to do about it ("no results: remove a filter").
export function EmptyState({ icon, title, children, action }: { icon?: ReactNode; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <section className={styles.state}>
      {icon && (
        <span className={styles.icon} aria-hidden="true">
          {icon}
        </span>
      )}
      <h2 className={styles.title}>{title}</h2>
      {children && <div className={styles.text}>{children}</div>}
      {action}
    </section>
  )
}

// A load that failed. No connection gets its own picture and words, since
// the student can fix that one. "compact" is a strip above data that is
// still on screen from before.
export function ErrorState({ error, onRetry, compact = false }: { error: ApiError; onRetry: () => void; compact?: boolean }) {
  const offline = error.code === 'network_error'
  const Icon = offline ? WifiOff : TriangleAlert
  const title = offline ? 'אין חיבור' : 'משהו השתבש'
  if (compact) {
    return (
      <div className={styles.strip} role="alert">
        <Icon aria-hidden="true" className={styles.stripIcon} />
        <span>{errorMessage(error.code)}</span>
        <Button variant="ghost" size="sm" icon={<RotateCw aria-hidden="true" />} onClick={onRetry}>
          נסה שוב
        </Button>
      </div>
    )
  }
  return (
    <section className={styles.state} role="alert">
      <span className={`${styles.icon} ${styles.iconError}`} aria-hidden="true">
        <Icon />
      </span>
      <h2 className={styles.title}>{title}</h2>
      <p className={styles.text}>{errorMessage(error.code)}</p>
      <Button variant="secondary" icon={<RotateCw aria-hidden="true" />} onClick={onRetry}>
        נסה שוב
      </Button>
    </section>
  )
}
