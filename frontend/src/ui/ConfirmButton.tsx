// A button for an action that cannot be undone: the first press asks
// "are you sure?", the second does it. "No" puts the first button back.

import { useState } from 'react'
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
  if (!asking) {
    return (
      <Button variant="secondary" size={size} busy={busy} onClick={() => setAsking(true)}>
        {label}
      </Button>
    )
  }
  return (
    <span className={styles.pair}>
      <Button
        variant="danger"
        size={size}
        busy={busy}
        onClick={() => {
          setAsking(false)
          onConfirm()
        }}
      >
        {confirmLabel}
      </Button>
      <Button variant="ghost" size={size} onClick={() => setAsking(false)}>
        לא
      </Button>
    </span>
  )
}
