// A new password, with a show button and the rules ticking as one types.
// Each rule says met or missing in words too, not by colour alone; the list
// is tied to the field, so a screen reader reads it with the field.

import { Check, Circle, Eye, EyeOff } from 'lucide-react'
import { useId, useState } from 'react'
import { MAX_PASSWORD, passwordRules } from '../logic/passwordRules'
import { Button } from '../ui'
import styles from './pages.module.css'

interface Props {
  value: string
  onChange: (value: string) => void
  label?: string
}

export function NewPasswordField({ value, onChange, label = 'סיסמה חדשה' }: Props) {
  const [shown, setShown] = useState(false)
  const id = useId()
  return (
    <>
      <label htmlFor={`${id}-password`} className={styles.fieldLabel}>
        {label}
      </label>
      <div className={styles.passwordRow}>
        <input
          id={`${id}-password`}
          className={styles.field}
          type={shown ? 'text' : 'password'}
          autoComplete="new-password"
          dir="ltr"
          required
          maxLength={MAX_PASSWORD}
          aria-describedby={`${id}-rules`}
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
        <Button
          variant="ghost"
          size="sm"
          aria-pressed={shown}
          icon={shown ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
          onClick={() => setShown(!shown)}
        >
          {shown ? 'להסתיר' : 'להציג'}
        </Button>
      </div>
      <ul id={`${id}-rules`} className={styles.ruleList}>
        {passwordRules(value).map((rule) => (
          <li key={rule.key} className={rule.met ? styles.ruleMet : undefined}>
            {rule.met ? <Check aria-hidden="true" /> : <Circle aria-hidden="true" />}
            {rule.label}
            <span className="visually-hidden">{rule.met ? ': יש' : ': חסר'}</span>
          </li>
        ))}
      </ul>
    </>
  )
}
