// Loads data from the server and, if asked, loads it again every few seconds.
//
// "key" names what is being loaded (for example "place-5"). When it changes,
// the old data is dropped at once, so a page never shows another page's data.
// A key of null means "nothing to load" (for example an invalid address).

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

export function useApi<T>(load: () => Promise<T>, key: string | null, refreshMs?: number): ApiState<T> {
  const [loaded, setLoaded] = useState<Loaded<T> | null>(null)
  const [attempt, setAttempt] = useState(0)
  // Always calls the latest "load", without restarting the timer on every render.
  const fetchData = useEffectEvent(load)

  useEffect(() => {
    if (key === null) return
    let cancelled = false // the page closed or the key changed
    let inFlight = false
    const run = () => {
      inFlight = true
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
        .finally(() => {
          inFlight = false
        })
    }
    run()
    // A refresh is skipped while the last one is still on its way (so answers
    // cannot arrive out of order), and while the tab is in the background.
    const tick = () => {
      if (!inFlight && document.visibilityState === 'visible') run()
    }
    const timer = refreshMs ? setInterval(tick, refreshMs) : undefined
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [key, refreshMs, attempt])

  const current = key !== null && loaded?.key === key ? loaded : null
  return {
    data: current?.data ?? null,
    error: current?.error ?? null,
    loading: key !== null && current === null,
    reload: () => setAttempt((n) => n + 1),
  }
}
