import { X } from 'lucide-react'
import { useEffect, useId, useRef, type ReactNode } from 'react'
import styles from './Sheet.module.css'

interface SheetProps {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
}

// A panel over the page: rises from the bottom on a phone, where the thumb
// is, and opens in the middle on a wide screen.
//
// Built on the browser's own <dialog> opened with showModal(): it keeps
// focus inside, closes on Escape, makes the page behind it unreachable,
// and returns focus to the button that opened it. The open and close
// movement is CSS (@starting-style), so it runs off the main thread.
export function Sheet({ open, onClose, title, children }: SheetProps) {
  const dialog = useRef<HTMLDialogElement>(null)
  const titleId = useId()

  useEffect(() => {
    const element = dialog.current
    if (!element) return
    if (open && !element.open) element.showModal()
    if (!open && element.open) element.close()
  }, [open])

  return (
    <dialog
      ref={dialog}
      className={styles.sheet}
      aria-labelledby={titleId}
      // Escape, or close() above. Only report a close the parent did not ask for.
      onClose={() => {
        if (open) onClose()
      }}
      // A click on the dim area around the panel lands on the dialog itself.
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div className={styles.panel}>
        <div className={styles.handle} aria-hidden="true" />
        <header className={styles.head}>
          <h2 id={titleId} className={styles.title}>
            {title}
          </h2>
          <button type="button" className={styles.close} aria-label="סגירה" onClick={onClose}>
            <X aria-hidden="true" />
          </button>
        </header>
        {children}
      </div>
    </dialog>
  )
}
