import type { ApiError } from '../api/client'
import { errorMessage } from '../i18n/errors'

// A failed load: the Hebrew message and a "try again" button.
// "inline" is the small version, shown above data that is still on screen.
export function LoadError({ error, onRetry, inline = false }: { error: ApiError; onRetry: () => void; inline?: boolean }) {
  return (
    <div className={inline ? 'load-error inline' : 'load-error'} role="alert">
      <span>{errorMessage(error.code)}</span>
      <button type="button" className="link-button" onClick={onRetry}>
        נסה שוב
      </button>
    </div>
  )
}
