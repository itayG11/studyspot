// A button for an action that cannot be undone: the first press asks
// "are you sure?", the second does it.

import { useState } from 'react'

interface Props {
  label: string
  confirmLabel: string
  onConfirm: () => void
  disabled?: boolean
}

export function ConfirmButton({ label, confirmLabel, onConfirm, disabled = false }: Props) {
  const [asking, setAsking] = useState(false)
  if (!asking) {
    return (
      <button type="button" className="button button-secondary" disabled={disabled} onClick={() => setAsking(true)}>
        {label}
      </button>
    )
  }
  return (
    <span className="confirm-pair">
      <button
        type="button"
        className="button button-danger"
        disabled={disabled}
        onClick={() => {
          setAsking(false)
          onConfirm()
        }}
      >
        {confirmLabel}
      </button>
      <button type="button" className="link-button" onClick={() => setAsking(false)}>
        לא
      </button>
    </span>
  )
}
