// One choice out of a few (list or map, the admin's tabs): plain toggle
// buttons in a group, honest about what they are, and a mark under the
// chosen one that slides to the next (Motion's layoutId). The mark is
// decoration: the state is aria-pressed. With "reduce motion" on, Motion
// moves it without the slide (MotionProvider).

import { m } from 'motion/react'
import { useId, type ReactNode } from 'react'
import { SPRING } from '../design/motion'
import styles from './Segmented.module.css'

interface Option<T extends string> {
  value: T
  label: ReactNode
}

interface Props<T extends string> {
  label: string
  options: Option<T>[]
  value: T
  onChange: (value: T) => void
  className?: string
}

export function Segmented<T extends string>({ label, options, value, onChange, className }: Props<T>) {
  const id = useId() // one mark per group: two groups on a page do not swap theirs
  return (
    <div className={[styles.group, className].filter(Boolean).join(' ')} role="group" aria-label={label}>
      {options.map((option) => {
        const chosen = option.value === value
        return (
          <button key={option.value} type="button" className={styles.option} aria-pressed={chosen} onClick={() => onChange(option.value)}>
            {chosen && <m.span layoutId={`segmented-${id}`} className={styles.mark} transition={SPRING} data-segmented-mark aria-hidden="true" />}
            <span className={styles.label}>{option.label}</span>
          </button>
        )
      })}
    </div>
  )
}
