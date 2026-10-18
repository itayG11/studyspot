// The signed-in student's bookings, loaded once for the whole page and
// refreshed every 30 seconds: the header's "my area" count and drawer, the
// my-area page and the scan page read the same answer, instead of asking
// the server twice (wave 7.4). A cancel on the page updates the header too.

import { createContext, useContext, type ReactNode } from 'react'
import { myBookings } from '../api/student'
import type { Booking } from '../api/types'
import { REFRESH_INTERVAL_MS } from '../config'
import { useApi, type ApiState } from '../hooks/useApi'
import { activeBookings } from '../logic/bookings'

interface Answer {
  all: Booking[]
  // Still ahead or under way, soonest first. Counted when the answer
  // arrives, against the clock at that moment (not while drawing).
  ahead: Booking[]
}

const load = () =>
  myBookings().then((all): Answer => ({
    all,
    ahead: activeBookings(all, new Date()).toSorted((a, b) => a.starts_at.localeCompare(b.starts_at)),
  }))

const Context = createContext<ApiState<Answer> | null>(null)

export function MyBookingsProvider({ userId, children }: { userId: number | null; children: ReactNode }) {
  const bookings = useApi(load, userId === null ? null : `my-bookings-${userId}`, REFRESH_INTERVAL_MS)
  return <Context.Provider value={userId === null ? null : bookings}>{children}</Context.Provider>
}

// The shared answer; a page shown without the header (in a test) loads its own.
function useAnswer(): ApiState<Answer> {
  const shared = useContext(Context)
  const own = useApi(load, shared === null ? 'my-bookings' : null, REFRESH_INTERVAL_MS)
  return shared ?? own
}

// oxlint-disable-next-line react/only-export-components
export function useMyBookings(): ApiState<Booking[]> {
  const answer = useAnswer()
  return { ...answer, data: answer.data?.all ?? null }
}

// oxlint-disable-next-line react/only-export-components
export function useBookingsAhead(): ApiState<Booking[]> {
  const answer = useAnswer()
  return { ...answer, data: answer.data?.ahead ?? null }
}
