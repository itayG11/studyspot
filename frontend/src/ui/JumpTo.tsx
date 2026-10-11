// A link inside a sentence to a section of the same page ("the seat map
// below", "between classes today"): scrolls there and gives it the focus,
// so a keyboard or screen reader user lands there too. Smoothly, unless the
// visitor asked for less motion. The target needs the id, and tabIndex -1.

import type { ReactNode } from 'react'
import { jumpTo } from './jump'
import styles from './JumpTo.module.css'

export function JumpTo({ id, children }: { id: string; children: ReactNode }) {
  return (
    <button type="button" className={styles.link} onClick={() => jumpTo(id)}>
      {children}
    </button>
  )
}
