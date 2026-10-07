import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { BookingRules, PlaceDetail } from '../api/types'
import { resetSessionForTests } from '../api/client'
import { AuthProvider } from '../auth/AuthContext'
import { jsonResponse, place } from '../test/fixtures'
import { BookingPanel } from './BookingPanel'

const RULES: BookingRules = {
  slot_minutes: 15, max_minutes: 120, days_ahead: 4, horizon_minutes: 5760, max_upcoming: 2,
  arrive_early_minutes: 10, no_show_after_minutes: 15,
}
const ME = { id: 1, email: 'a@b', display_name: 'סטודנט', role: 'student', institution_slug: 'braude' }
// Sunday 11 October 2026, 08:00 in Israel.
const NOW = new Date('2026-10-11T05:00:00Z')

const ROOM: PlaceDetail = {
  ...place({ id: 3, kind: 'group_room', name: 'EM107', building_code: 'EM', capacity: 15, bookable: true }),
  opening_hours: [6, 0, 1, 2, 3].map((weekday) => ({ weekday, opens: '07:00:00', closes: '20:00:00' })),
  open_all_day_today: false,
  lab_rows: null,
  lab_cols: null,
  seats: null,
}

let fetchMock: ReturnType<typeof vi.fn>
let bookingBody: unknown = null

beforeEach(() => {
  vi.useFakeTimers({ now: NOW, shouldAdvanceTime: true })
  resetSessionForTests()
  bookingBody = null
  fetchMock = vi.fn((url: string, init: RequestInit) => {
    const path = new URL(url).pathname
    if (path === '/auth/refresh')
      return Promise.resolve(jsonResponse({ access_token: 't', token_type: 'bearer', expires_in: 900, user: ME }))
    if (path === '/places/3/availability')
      return Promise.resolve(
        jsonResponse({ place_id: 3, date: '2026-10-11', busy: [{ seat_id: null, starts_at: '2026-10-11T06:00:00Z', ends_at: '2026-10-11T07:00:00Z' }] }),
      )
    if (path === '/bookings') {
      bookingBody = JSON.parse(String(init.body))
      return Promise.resolve(jsonResponse({ id: 9 }, 201))
    }
    return Promise.resolve(jsonResponse({ detail: 'unknown' }, 404))
  })
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

function renderPanel() {
  const router = createMemoryRouter(
    [{ path: '/places/3', element: <BookingPanel place={ROOM} seat={null} rules={RULES} timeZone="Asia/Jerusalem" /> }],
    { initialEntries: ['/places/3'] },
  )
  render(
    <AuthProvider>
      <RouterProvider router={router} />
    </AuthProvider>,
  )
}

describe('BookingPanel', () => {
  it('shows booked times as unavailable', async () => {
    renderPanel()
    expect(await screen.findByRole('button', { name: '09:00' })).toBeDisabled() // 06:00 UTC
    expect(screen.getByRole('button', { name: '10:00' })).toBeEnabled()
  })

  it('sends the chosen time as an exact moment', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    renderPanel()
    await user.click(await screen.findByRole('button', { name: '10:00' }))
    await user.click(screen.getByRole('button', { name: 'שעה וחצי' }))
    await user.click(screen.getByRole('button', { name: 'להזמין' }))
    expect(await screen.findByText(/ההזמנה נקלטה/)).toBeInTheDocument()
    expect(bookingBody).toEqual({
      place_id: 3,
      seat_id: null,
      starts_at: '2026-10-11T07:00:00.000Z', // 10:00 in Israel
      ends_at: '2026-10-11T08:30:00.000Z',
    })
  })

  it('a slot just before a booking offers only the time until it', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    renderPanel()
    await user.click(await screen.findByRole('button', { name: '08:30' }))
    expect(screen.getByRole('button', { name: 'חצי שעה' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'שעה' })).not.toBeInTheDocument()
  })
})

describe('BookingPanel as time passes', () => {
  it('a chosen time that becomes too late is no longer offered for booking', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    renderPanel()
    await user.click(await screen.findByRole('button', { name: '08:00' })) // 05:00 UTC, now is 05:00
    await user.click(screen.getByRole('button', { name: 'רבע שעה' }))
    expect(screen.getByRole('button', { name: 'להזמין' })).toBeInTheDocument()
    await act(() => vi.advanceTimersByTimeAsync(16 * 60_000)) // 08:16: past its no-show deadline
    expect(screen.queryByRole('button', { name: 'להזמין' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '08:00' })).not.toBeInTheDocument()
  })
})
