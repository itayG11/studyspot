import { AnimatePresence, m } from 'motion/react'
import { CircleCheck, Info, TriangleAlert, X } from 'lucide-react'
import { createContext, use, useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { EASE_OUT, ENTER, EXIT } from '../design/motion'
import styles from './Toast.module.css'

export type ToastTone = 'success' | 'error' | 'info'

interface ToastItem {
  id: number
  tone: ToastTone
  message: string
}

type Show = (message: string, tone?: ToastTone) => void

const ToastContext = createContext<Show | null>(null)

// How long a message stays. An error stays longer: it may need reading twice.
const SHOW_MS: Record<ToastTone, number> = { success: 4500, info: 4500, error: 8000 }
// More than this and the oldest one goes; a pile of messages helps nobody.
const MAX_SHOWN = 3

const ICONS = { success: CircleCheck, error: TriangleAlert, info: Info }

// A short message after an action ("the booking was cancelled"). The list
// is a live region, so a screen reader reads each new message once.
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([])
  const nextId = useRef(0)

  const dismiss = useCallback((id: number) => setItems((list) => list.filter((t) => t.id !== id)), [])
  const show = useCallback<Show>((message, tone = 'info') => {
    nextId.current += 1
    const item = { id: nextId.current, tone, message }
    setItems((list) => [...list, item].slice(-MAX_SHOWN))
  }, [])

  return (
    <ToastContext value={show}>
      {children}
      <section className={styles.region} aria-label="הודעות">
        <ol className={styles.list} aria-live="polite">
          <AnimatePresence initial={false}>
            {items.map((item) => (
              <Toast key={item.id} item={item} onDismiss={dismiss} />
            ))}
          </AnimatePresence>
        </ol>
      </section>
    </ToastContext>
  )
}

function Toast({ item, onDismiss }: { item: ToastItem; onDismiss: (id: number) => void }) {
  // Paused while the pointer or focus is on it, so it does not vanish mid-read.
  const [paused, setPaused] = useState(false)
  useEffect(() => {
    if (paused) return
    const timer = setTimeout(() => onDismiss(item.id), SHOW_MS[item.tone])
    return () => clearTimeout(timer)
  }, [paused, item, onDismiss])

  const Icon = ICONS[item.tone]
  return (
    <m.li
      layout
      className={`${styles.toast} ${styles[item.tone]}`}
      // Full transform strings: these run on the compositor, not each frame in JS.
      initial={{ opacity: 0, transform: 'translateY(16px) scale(0.97)' }}
      animate={{ opacity: 1, transform: 'translateY(0px) scale(1)' }}
      exit={{ opacity: 0, transform: 'translateY(8px) scale(0.97)', transition: EXIT }}
      transition={{ ...ENTER, layout: { duration: 0.2, ease: EASE_OUT } }}
      onPointerEnter={() => setPaused(true)}
      onPointerLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      <Icon className={styles.icon} aria-hidden="true" />
      <span className={styles.message}>{item.message}</span>
      <button type="button" className={styles.close} aria-label="סגירת ההודעה" onClick={() => onDismiss(item.id)}>
        <X aria-hidden="true" />
      </button>
    </m.li>
  )
}

// oxlint-disable-next-line react/only-export-components
export function useToast(): Show {
  const show = use(ToastContext)
  if (show === null) throw new Error('useToast must be used inside <ToastProvider>')
  return show
}
