// One write action (book, cancel, check in...): while it runs, its button
// is locked; when it fails, the Hebrew message is ready to show.

import { useState } from 'react'
import { ApiError } from '../api/client'
import { errorMessage } from '../i18n/errors'

export interface Action {
  run: <T>(work: () => Promise<T>) => Promise<T | undefined>
  busy: boolean
  error: string | null
  clearError: () => void
}

export function useAction(): Action {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function run<T>(work: () => Promise<T>): Promise<T | undefined> {
    setBusy(true)
    setError(null)
    try {
      return await work()
    } catch (reason) {
      setError(errorMessage(reason instanceof ApiError ? reason.code : 'unknown_error'))
      return undefined
    } finally {
      setBusy(false)
    }
  }

  return { run, busy, error, clearError: () => setError(null) }
}
