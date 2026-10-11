// A failed action's message, with the way out when there is one.

import type { Action } from '../hooks/useAction'
import { ErrorAction } from './ErrorAction'
import { Notice } from './Notice'

export function ActionError({ action }: { action: Pick<Action, 'error' | 'errorCode'> }) {
  if (!action.error) return null
  return (
    <Notice tone="error">
      {action.error}
      <ErrorAction code={action.errorCode} />
    </Notice>
  )
}
