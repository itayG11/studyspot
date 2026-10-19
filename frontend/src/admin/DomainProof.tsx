// A waiting email domain, proved without the system admin: the institution's
// IT people add one DNS TXT record, and "check now" approves the rule.
// The admin only passes on a ready message; the record itself is IT's work.

import { useId, useState } from 'react'
import { verifyLoginRule } from '../api/admin'
import type { LoginRule } from '../api/types'
import { useAction } from '../hooks/useAction'
import { itMessage } from './itMessage'
import { ActionError, Button } from '../ui'
import styles from './admin.module.css'

interface Props {
  rule: LoginRule
  institution: string
  onApproved: () => void
}

export function DomainProof({ rule, institution, onApproved }: Props) {
  const id = useId()
  const check = useAction()
  const [copied, setCopied] = useState<'message' | 'value' | null>(null)
  const name = rule.verify_record!
  const value = rule.verify_value!
  const canCopy = typeof navigator !== 'undefined' && Boolean(navigator.clipboard)

  async function copy(what: 'message' | 'value', text: string) {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(what)
    } catch {
      setCopied(null) // blocked by the browser: the text is on the screen to copy by hand
    }
  }

  return (
    <div className={styles.proof} aria-labelledby={`${id}-title`} role="group">
      <p id={`${id}-title`} className={styles.proofTitle}>
        להפעיל בלי לחכות: אימות ברשומת <span dir="ltr">DNS</span>
      </p>
      <ol className={styles.proofSteps}>
        <li>שולחים למחלקת המחשוב את ההודעה המוכנה. יש בה את הרשומה המדויקת.</li>
        <li>הם מוסיפים אותה בהגדרות הדומיין. זה לוקח להם כמה דקות.</li>
        <li>לוחצים כאן "לבדוק עכשיו", והסיומת מתחילה לעבוד.</li>
      </ol>
      <dl className={styles.proofRecord}>
        <dt>סוג</dt>
        <dd dir="ltr">TXT</dd>
        <dt>שם</dt>
        <dd dir="ltr">{name}</dd>
        <dt>ערך</dt>
        <dd dir="ltr">{value}</dd>
      </dl>
      <div className={styles.actions}>
        {canCopy && (
          <Button size="sm" variant="secondary" onClick={() => void copy('message', itMessage(institution, rule.value, name, value))}>
            העתקת הודעה למחלקת המחשוב
          </Button>
        )}
        {canCopy && (
          <Button size="sm" variant="ghost" onClick={() => void copy('value', value)}>
            העתקת הערך בלבד
          </Button>
        )}
        <Button size="sm" busy={check.busy} onClick={() => void check.run(() => verifyLoginRule(rule.id)).then((done) => done && onApproved())}>
          לבדוק עכשיו
        </Button>
      </div>
      <p className="visually-hidden" role="status">
        {copied === 'message' ? 'ההודעה הועתקה' : copied === 'value' ? 'הערך הועתק' : ''}
      </p>
      <ActionError action={check} />
    </div>
  )
}
