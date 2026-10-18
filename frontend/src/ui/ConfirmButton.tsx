// A button for an action that cannot be undone: the first press asks
// "are you sure?", the second does it. "No" puts the first button back.

import { useEffect, useRef, useState } from 'react'
import { Button } from './Button'
import styles from './ConfirmButton.module.css'

interface Props {
  label: string
  confirmLabel: string
  onConfirm: () => void
  busy?: boolean
  size?: 'sm' | 'md'
}

export function ConfirmButton({ label, confirmLabel, onConfirm, busy = false, size = 'md' }: Props) {
  const [asking, setAsking] = useState(false)
  // The button that had the keyboard is replaced: focus follows to the
  // question, and back to the first button after "no" or "yes".
  const first = useRef<HTMLButtonElement>(null)
  const sure = useRef<HTMLButtonElement>(null)
  const moved = useRef(false)
  useEffect(() => {
    if (!moved.current) return // nothing moves on the first render
    ;(asking ? sure : first).current?.focus()
  }, [asking])
  const ask = (next: boolean) => {
    moved.current = true
    setAsking(next)
  }
  if (!asking) {
    return (
      <Button ref={first} variant="secondary" size={size} busy={busy} onClick={() => ask(true)}>
        {label}
      </Button>
    )
  }
  return (
    <span className={styles.pair}>
      <Button
        ref={sure}
        variant="danger"
        size={size}
        busy={busy}
        onClick={() => {
          ask(false)
          onConfirm()
        }}
      >
        {confirmLabel}
      </Button>
      <Button variant="ghost" size={size} onClick={() => ask(false)}>
        לא
      </Button>
    </span>
  )
}
