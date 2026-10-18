import { CircleCheck, Info, TriangleAlert } from 'lucide-react'
import type { ReactNode } from 'react'
import styles from './Notice.module.css'

type Tone = 'info' | 'warning' | 'error' | 'success'

const ICONS = { info: Info, warning: TriangleAlert, error: TriangleAlert, success: CircleCheck }

// A short message in the flow of the page: a warning before an action, or
// why an action failed. An error is announced at once (role="alert"); the
// others are read where they are.
export function Notice({ tone = 'info', children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  const Icon = ICONS[tone]
  return (
    <div className={[styles.notice, styles[tone], className].filter(Boolean).join(' ')} role={tone === 'error' ? 'alert' : undefined}>
      <Icon aria-hidden="true" className={styles.icon} />
      <div>{children}</div>
    </div>
  )
}
