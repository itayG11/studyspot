import { Search, X } from 'lucide-react'
import { useId, useRef } from 'react'
import styles from './SearchField.module.css'

interface SearchFieldProps {
  label: string // read by screen readers; the placeholder is not a label
  value: string
  onChange: (value: string) => void
  placeholder?: string
}

// The search box. Results follow each keystroke, so nothing here animates.
export function SearchField({ label, value, onChange, placeholder }: SearchFieldProps) {
  const id = useId()
  const input = useRef<HTMLInputElement>(null)
  return (
    <div className={styles.field}>
      <label htmlFor={id} className="visually-hidden">
        {label}
      </label>
      <Search className={styles.icon} aria-hidden="true" />
      <input
        ref={input}
        id={id}
        className={styles.input}
        type="search"
        enterKeyHint="search"
        autoComplete="off"
        spellCheck={false}
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
      />
      {value !== '' && (
        <button
          type="button"
          className={styles.clear}
          aria-label="ניקוי החיפוש"
          onClick={() => {
            onChange('')
            input.current?.focus() // keep typing without reaching for the box again
          }}
        >
          <X aria-hidden="true" />
        </button>
      )}
    </div>
  )
}
