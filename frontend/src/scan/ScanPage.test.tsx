import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { resetSessionForTests } from '../api/client'
import type { Booking, PlaceDetail } from '../api/types'
import { AuthProvider } from '../auth/AuthContext'
import { InstitutionProvider } from '../institution'
import { jsonResponse, place, seat } from '../test/fixtures'
import { ScanPage } from './ScanPage'

const SIG = 'A'.repeat(43)
const ME = { id: 1, email: 'a@b', display_name: 'סטודנט', role: 'student', institution_slug: 'braude' }
const INSTITUTION = {
  slug: 'braude', name: 'מכללת בראודה', timezone: 'Asia/Jerusalem',
  booking_rules: { slot_minutes: 15, max_minutes: 120, days_ahead: 4, max_upcoming: 2, arrive_early_minutes: 10, no_show_after_minutes: 15 },
}
const NOW = new Date('2026-10-11T07:00:00Z') // Sunday 10:00 in Israel

const AREA: PlaceDetail = {
  ...place({ id: 5, kind: 'open_area', name: 'מתחם לימוד', building_code: 'L', capacity: 50, available: 50, occupied: 0, bookable: false, counted: true }),
  opening_hours: [], open_all_day_today: false, lab_rows: null, lab_cols: null, seats: null,
}
const LAB: PlaceDetail = {
  ...place({ id: 1 }),
  opening_hours: [], open_all_day_today: false, lab_rows: 1, lab_cols: 2,
  seats: [seat(), seat({ id: 2, col: 2, label: 'A2', occupied: true, free_now: false })],
}

let places: Record<number, PlaceDetail> = {}
let bookings: Booking[] = []
let checkInResponse: () => Response
let checkInBody: unknown = null

beforeEach(() => {
  vi.useFakeTimers({ now: NOW, shouldAdvanceTime: true })
  resetSessionForTests()
  places = { 5: AREA, 1: LAB }
  bookings = []
  checkInBody = null
  checkInResponse = () =>
    jsonResponse({
      id: 1, place_id: 5, place_name: 'מתחם לימוד', building_code: 'L', seat_id: null, seat_label: null,
      started_at: NOW.toISOString(), expires_at: '2026-10-11T09:00:00Z', ended_at: null, end_reason: null,
      booking_id: null, cut_short_by: null,
    }, 201)
  vi.stubGlobal('fetch', vi.fn((url: string, init: RequestInit) => {
    const path = new URL(url).pathname
    if (path === '/auth/refresh')
      return Promise.resolve(jsonResponse({ access_token: 't', token_type: 'bearer', expires_in: 900, user: ME }))
    if (path === '/institutions/braude') return Promise.resolve(jsonResponse(INSTITUTION))
    if (path === '/me/bookings') return Promise.resolve(jsonResponse(bookings))
    const placeMatch = /^\/places\/(\d+)$/.exec(path)
    if (placeMatch) {
      const found = places[Number(placeMatch[1])]
      return Promise.resolve(found ? jsonResponse(found) : jsonResponse({ detail: 'place_not_found' }, 404))
    }
    if (path === '/check-ins') {
      checkInBody = JSON.parse(String(init.body))
      return Promise.resolve(checkInResponse())
    }
    return Promise.resolve(jsonResponse({ detail: 'unknown' }, 404))
  }))
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

function renderScan(path: string) {
  const router = createMemoryRouter(
    [{ path: '/scan', element: <ScanPage /> }, { path: '/me', element: <p>האזור שלי</p> }],
    { initialEntries: [path] },
  )
  render(
    <AuthProvider>
      <InstitutionProvider>
        <RouterProvider router={router} />
      </InstitutionProvider>
    </AuthProvider>,
  )
  return router
}

const user = () => userEvent.setup({ advanceTimers: vi.advanceTimersByTime })

describe('ScanPage', () => {
  it('shows the place, checks in, and takes the code out of the address', async () => {
    const router = renderScan(`/scan?c=p5.v1.${SIG}`)
    expect(await screen.findByRole('heading', { name: 'מתחם לימוד' })).toBeInTheDocument()
    expect(router.state.location.search).toBe('') // not kept in the history
    await user().click(screen.getByRole('button', { name: 'אני כאן' }))
    expect(await screen.findByText(/נכנסת. המקום שמור לך עד 12:00/)).toBeInTheDocument()
    expect(checkInBody).toEqual({ code: `p5.v1.${SIG}` })
  })

  it('in a lab without a booking, a free station must be chosen', async () => {
    renderScan(`/scan?c=p1.v1.${SIG}`)
    expect(await screen.findByRole('heading', { name: 'M206' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'אני כאן' })).toBeDisabled()
    expect(screen.queryByRole('button', { name: /A2/ })).not.toBeInTheDocument() // taken: not a choice
    await user().click(screen.getByRole('button', { name: /A1/ }))
    await user().click(screen.getByRole('button', { name: 'אני כאן' }))
    expect(checkInBody).toEqual({ code: `p1.v1.${SIG}`, seat_id: 1 })
  })

  it('in a lab with a booking now, the booking is confirmed without choosing', async () => {
    bookings = [{
      id: 4, place_id: 1, place_name: 'M206', building_code: 'M', seat_id: 2, seat_label: 'A2',
      starts_at: '2026-10-11T07:05:00Z', ends_at: '2026-10-11T08:00:00Z', status: 'booked', source: 'advance',
    }]
    renderScan(`/scan?c=p1.v1.${SIG}`)
    expect(await screen.findByText(/יש לך הזמנה לתא A2/)).toBeInTheDocument()
    await user().click(screen.getByRole('button', { name: 'אני כאן' }))
    expect(checkInBody).toEqual({ code: `p1.v1.${SIG}` })
  })

  it('explains when the time was cut short', async () => {
    checkInResponse = () => jsonResponse({
      id: 2, place_id: 1, place_name: 'M206', building_code: 'M', seat_id: 1, seat_label: 'A1',
      started_at: NOW.toISOString(), expires_at: '2026-10-11T07:45:00Z', ended_at: null, end_reason: null,
      booking_id: 9, cut_short_by: 'booking',
    }, 201)
    renderScan(`/scan?c=p1.v1.${SIG}`)
    await user().click(await screen.findByRole('button', { name: /A1/ }))
    await user().click(screen.getByRole('button', { name: 'אני כאן' }))
    expect(await screen.findByText(/התא מוזמן אחריך/)).toBeInTheDocument()
  })

  it('shows the server refusal in Hebrew', async () => {
    checkInResponse = () => jsonResponse({ detail: 'place_full' }, 409)
    renderScan(`/scan?c=p5.v1.${SIG}`)
    await user().click(await screen.findByRole('button', { name: 'אני כאן' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('המקום מלא כרגע')
  })

  it('without a code, a pasted code works too', async () => {
    renderScan('/scan')
    await user().type(await screen.findByLabelText('הקוד מהשלט'), `p5.v1.${SIG}`)
    await user().click(screen.getByRole('button', { name: 'המשך' }))
    expect(await screen.findByRole('heading', { name: 'מתחם לימוד' })).toBeInTheDocument()
  })

  it('a text that is not a code is refused before asking the server', async () => {
    renderScan('/scan?c=hello')
    expect(await screen.findByRole('alert')).toHaveTextContent('הקוד לא תקין')
  })
})
