import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { resetSessionForTests } from '../api/client'
import type { Booking, CheckIn } from '../api/types'
import { AuthProvider } from '../auth/AuthContext'
import { InstitutionProvider } from '../institution'
import { FAVORITES_KEY } from '../logic/favorites'
import { jsonResponse, place } from '../test/fixtures'
import { MyPage } from './MyPage'

const ME = { id: 1, email: 'demo.student@studyspot.invalid', display_name: 'סטודנט לדוגמה', role: 'student', institution_slug: 'braude' }
const INSTITUTION = {
  slug: 'braude', name: 'מכללת בראודה', timezone: 'Asia/Jerusalem',
  booking_rules: { slot_minutes: 15, max_minutes: 120, days_ahead: 4, horizon_minutes: 5760, max_upcoming: 2, arrive_early_minutes: 10, no_show_after_minutes: 15 },
}
const ROOM: Booking = {
  id: 7, place_id: 3, place_name: 'EM107', building_code: 'EM', seat_id: null, seat_label: null,
  starts_at: '2026-10-12T07:00:00Z', ends_at: '2026-10-12T09:00:00Z', status: 'booked', source: 'advance',
}
const LAB: Booking = {
  id: 8, place_id: 1, place_name: 'M206', building_code: 'M', seat_id: 1, seat_label: 'A1',
  starts_at: '2026-10-11T07:00:00Z', ends_at: '2026-10-11T08:00:00Z', status: 'checked_in', source: 'advance',
}
const CHECK_IN: CheckIn = {
  id: 3, place_id: 1, place_name: 'M206', building_code: 'M', seat_id: 1, seat_label: 'A1',
  started_at: '2026-10-11T07:00:00Z', expires_at: '2026-10-11T08:00:00Z', ended_at: null, end_reason: null,
  booking_id: 8, cut_short_by: null,
}

let bookings: Booking[]
let checkIn: CheckIn | null
let calls: string[]

beforeEach(() => {
  resetSessionForTests()
  bookings = [LAB, ROOM]
  checkIn = CHECK_IN
  calls = []
  vi.stubGlobal('fetch', vi.fn((url: string, init: RequestInit) => {
    const path = new URL(url).pathname
    if (init.method === 'POST') calls.push(path)
    if (path === '/auth/refresh')
      return Promise.resolve(jsonResponse({ access_token: 't', token_type: 'bearer', expires_in: 900, user: ME }))
    if (path === '/institutions/braude') return Promise.resolve(jsonResponse(INSTITUTION))
    if (path === '/institutions/braude/places')
      return Promise.resolve(jsonResponse([place({ id: 1, name: 'M206', kind: 'computer_lab' }), place({ id: 3, name: 'EM107', kind: 'group_room' })]))
    if (path === '/me/bookings') return Promise.resolve(jsonResponse(bookings))
    if (path === '/me/check-in')
      return Promise.resolve(checkIn ? jsonResponse(checkIn) : jsonResponse({ detail: 'no_active_check_in' }, 404))
    if (path === '/bookings/7/cancel') {
      bookings = [LAB]
      return Promise.resolve(jsonResponse({ ...ROOM, status: 'cancelled' }))
    }
    if (path === '/bookings/8/extend') return Promise.resolve(jsonResponse({ detail: 'no_time_to_extend' }, 409))
    if (path === '/check-ins/3/checkout') {
      checkIn = null
      return Promise.resolve(jsonResponse({ ...CHECK_IN, ended_at: '2026-10-11T07:30:00Z', end_reason: 'checkout' }))
    }
    if (path === '/auth/logout-all') return Promise.resolve(new Response(null, { status: 204 }))
    return Promise.resolve(jsonResponse({ detail: 'unknown' }, 404))
  }))
})

afterEach(() => {
  vi.unstubAllGlobals()
  localStorage.clear()
})

function renderMe() {
  const router = createMemoryRouter([{ path: '/me', element: <MyPage /> }, { path: '/', element: <p>מפה</p> }], {
    initialEntries: ['/me'],
  })
  render(
    <AuthProvider>
      <InstitutionProvider>
        <RouterProvider router={router} />
      </InstitutionProvider>
    </AuthProvider>,
  )
  return router
}

describe('MyPage', () => {
  it('shows who is signed in, the check-in and the bookings', async () => {
    renderMe()
    expect(await screen.findByText('סטודנט לדוגמה')).toBeInTheDocument()
    const current = screen.getByRole('region', { name: 'עכשיו' })
    expect(await within(current).findByText(/M206/)).toBeInTheDocument()
    expect(within(current).getByText(/עד 11:00/)).toBeInTheDocument()
    expect(await screen.findAllByRole('listitem', { name: /הזמנה/ })).toHaveLength(2)
  })

  it('cancels a booking after asking', async () => {
    renderMe()
    const room = await screen.findByRole('listitem', { name: /EM107/ })
    await userEvent.click(within(room).getByRole('button', { name: 'לבטל' }))
    await userEvent.click(within(room).getByRole('button', { name: 'כן, לבטל' }))
    expect(calls).toContain('/bookings/7/cancel')
    await waitFor(() => expect(screen.getAllByRole('listitem', { name: /הזמנה/ })).toHaveLength(1))
  })

  it('only a confirmed booking can be extended, and a refusal is explained', async () => {
    renderMe()
    const room = await screen.findByRole('listitem', { name: /EM107/ })
    expect(within(room).queryByRole('button', { name: 'להאריך' })).not.toBeInTheDocument()
    const lab = screen.getByRole('listitem', { name: /M206/ })
    await userEvent.click(within(lab).getByRole('button', { name: 'להאריך' }))
    expect(await within(lab).findByRole('alert')).toHaveTextContent('אין זמן להאריך')
  })

  it('checks out', async () => {
    renderMe()
    const current = await screen.findByRole('region', { name: 'עכשיו' })
    await userEvent.click(await within(current).findByRole('button', { name: 'יציאה' }))
    expect(calls).toContain('/check-ins/3/checkout')
    expect(await screen.findByText('אין לך כניסה פעילה.')).toBeInTheDocument()
  })

  it('signs out of every device after asking', async () => {
    const router = renderMe()
    await userEvent.click(await screen.findByRole('button', { name: 'להתנתק מכל המכשירים' }))
    await userEvent.click(screen.getByRole('button', { name: 'כן, מכל המכשירים' }))
    expect(calls).toContain('/auth/logout-all')
    expect(await screen.findByText('מפה')).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/')
  })

  it('shows the favourite places, and says how to add one when there are none', async () => {
    renderMe()
    const favorites = await screen.findByRole('region', { name: 'המועדפים' })
    expect(await within(favorites).findByText('אין עדיין מועדפים.')).toBeInTheDocument()
  })

  it('a favourite place appears as a card that links to it', async () => {
    localStorage.setItem(FAVORITES_KEY, JSON.stringify([3]))
    renderMe()
    const favorites = await screen.findByRole('region', { name: 'המועדפים' })
    const link = await within(favorites).findByRole('link', { name: 'EM107' })
    expect(link).toHaveAttribute('href', '/spaces/3')
    await userEvent.click(within(favorites).getByRole('button', { name: 'מועדף: EM107' }))
    expect(await within(favorites).findByText('אין עדיין מועדפים.')).toBeInTheDocument()
  })
})
