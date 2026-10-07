// Loads data from the server and, if asked, loads it again every few seconds.
//
// "key" names what is being loaded (for example "place-5"). When it changes,
// the old data is dropped at once, so a page never shows another page's data.

import { useEffect, useEffectEvent, useState } from 'react'
import { ApiError } from '../api/client'

export interface ApiState<T> {
  data: T | null
  error: ApiError | null
  loading: boolean
  reload: () => void
}

interface Loaded<T> {
  key: string
  data: T | null
  error: ApiError | null
}

export function useApi<T>(load: () => Promise<T>, key: string, refreshMs?: number): ApiState<T> {
  const [loaded, setLoaded] = useState<Loaded<T> | null>(null)
  const [attempt, setAttempt] = useState(0)
  // Always calls the latest "load", without restarting the timer on every render.
  const fetchData = useEffectEvent(load)

  useEffect(() => {
    let cancelled = false // the page closed or the key changed
    const run = () => {
      fetchData()
        .then((data) => {
          if (!cancelled) setLoaded({ key, data, error: null })
        })
        .catch((reason: unknown) => {
          if (cancelled) return
          const error = reason instanceof ApiError ? reason : new ApiError(0, 'unknown_error')
          // A failed refresh keeps the numbers already on screen.
          setLoaded((previous) => ({ key, data: previous?.key === key ? previous.data : null, error }))
        })
    }
    run()
    const timer = refreshMs ? setInterval(run, refreshMs) : undefined
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [key, refreshMs, attempt])

  const current = loaded?.key === key ? loaded : null
  return {
    data: current?.data ?? null,
    error: current?.error ?? null,
    loading: current === null,
    reload: () => setAttempt((n) => n + 1),
  }
}
