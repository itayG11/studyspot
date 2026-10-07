import type { ButtonHTMLAttributes, ReactNode } from 'react'
import styles from './Chip.module.css'

type ChipProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  selected: boolean
  icon?: ReactNode
  count?: number // how many results this filter leaves
}

// A filter that is on or off. aria-pressed tells a screen reader which.
// No movement on toggle: filters are pressed many times in a row.
export function Chip({ selected, icon, count, className, children, ...rest }: ChipProps) {
  return (
    <button type="button" aria-pressed={selected} className={[styles.chip, className].filter(Boolean).join(' ')} {...rest}>
      {icon}
      <span>{children}</span>
      {count !== undefined && <span className={styles.count}>{count}</span>}
    </button>
  )
}
