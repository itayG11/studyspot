// The campus's load today (live, usual, today so far), loaded once for the
// whole page and refreshed every 30 seconds: the header's pulse and the home
// page's chart read the same answer, instead of asking the server twice.

import { createContext, useContext, type ReactNode } from 'react'
import { getCampusToday } from '../../api/campus'
import type { CampusToday } from '../../api/types'
import { REFRESH_INTERVAL_MS } from '../../config'
import { useApi, type ApiState } from '../../hooks/useApi'

const Context = createContext<ApiState<CampusToday> | null>(null)

export function CampusTodayProvider({ slug, children }: { slug: string; children: ReactNode }) {
  const today = useApi(() => getCampusToday(slug), `today-${slug}`, REFRESH_INTERVAL_MS)
  return <Context.Provider value={today}>{children}</Context.Provider>
}

// oxlint-disable-next-line react/only-export-components
export function useCampusToday(): ApiState<CampusToday> {
  const today = useContext(Context)
  if (today === null) throw new Error('useCampusToday outside CampusTodayProvider')
  return today
}
