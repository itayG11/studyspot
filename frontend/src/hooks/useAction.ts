// One write action (book, cancel, check in...): while it runs, its button
// is locked; when it fails, the Hebrew message is ready to show.

import { useRef, useState } from 'react'
import { ApiError } from '../api/client'
import { errorMessage } from '../i18n/errors'

export interface Action {
  // onError gets the server's stable code ("slot_taken"), for pages that
  // do more than show the message.
  run: <T>(work: () => Promise<T>, onError?: (code: string) => void) => Promise<T | undefined>
  busy: boolean
  error: string | null
  errorCode: string | null // the server's code, for the way out (ui/ErrorAction)
  clearError: () => void
}

export function useAction(): Action {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [errorCode, setErrorCode] = useState<string | null>(null)
  // A ref, not the state: a quick second press comes before the button is
  // drawn again as locked, and must not send the same request twice.
  const running = useRef(false)

  async function run<T>(work: () => Promise<T>, onError?: (code: string) => void): Promise<T | undefined> {
    if (running.current) return undefined
    running.current = true
    setBusy(true)
    setError(null)
    setErrorCode(null)
    try {
      return await work()
    } catch (reason) {
      const code = reason instanceof ApiError ? reason.code : 'unknown_error'
      setError(errorMessage(code))
      setErrorCode(code)
      onError?.(code)
      return undefined
    } finally {
      running.current = false
      setBusy(false)
    }
  }

  return {
    run, busy, error, errorCode,
    clearError: () => {
      setError(null)
      setErrorCode(null)
    },
  }
}
