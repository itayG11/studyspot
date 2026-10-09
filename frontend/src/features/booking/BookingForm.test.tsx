import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Booking, BookingRules, PlaceDetail } from '../../api/types'
import { resetSessionForTests } from '../../api/client'
import { AuthProvider } from '../../auth/AuthContext'
import { jsonResponse, place } from '../../test/fixtures'
import { BookingForm } from './BookingForm'

const RULES: BookingRules = {
  slot_minutes: 15, max_minutes: 120, days_ahead: 4, horizon_minutes: 5760, max_upcoming: 2,
  arrive_early_minutes: 10, no_show_after_minutes: 15,
}
const ME = { id: 1, email: 'a@b', display_name: 'סטודנט', role: 'student', institution_slug: 'braude' }
// Sunday 11 October 2026, 08:00 in Israel.
const NOW = new Date('2026-10-11T05:00:00Z')

const ROOM: PlaceDetail = {
  ...place({ id: 3, kind: 'group_room', name: 'EM107', building_code: 'EM', capacity: 15, bookable: true }),
  institution_slug: 'braude',
  opening_hours: [6, 0, 1, 2, 3].map((weekday) => ({ weekday, opens: '07:00:00', closes: '20:00:00' })),
  open_all_day_today: false,
  lab_rows: null,
  lab_cols: null,
  seats: null,
}

let fetchMock: ReturnType<typeof vi.fn>
let bookingBody: unknown = null
// The next answers to POST /bookings; when empty, the booking succeeds.
let bookingAnswers: (() => Response)[] = []
// When set, the availability answer waits until it is released.
let holdAvailability: Promise<void> | null = null
let busy = [{ seat_id: null, starts_at: '2026-10-11T06:00:00Z', ends_at: '2026-10-11T07:00:00Z' }]

const BOOKED = {
  id: 9, place_id: 3, place_name: 'EM107', building_code: 'EM', seat_id: null, seat_label: null,
  starts_at: '2026-10-11T07:00:00Z', ends_at: '2026-10-11T08:30:00Z', status: 'booked', source: 'advance',
}

beforeEach(() => {
  vi.useFakeTimers({ now: NOW, shouldAdvanceTime: true })
  resetSessionForTests()
  bookingBody = null
  bookingAnswers = []
  busy = [{ seat_id: null, starts_at: '2026-10-11T06:00:00Z', ends_at: '2026-10-11T07:00:00Z' }]
  holdAvailability = null
  fetchMock = vi.fn((url: string, init: RequestInit) => {
    const path = new URL(url).pathname
    if (path === '/auth/refresh')
      return Promise.resolve(jsonResponse({ access_token: 't', token_type: 'bearer', expires_in: 900, user: ME }))
    if (path === '/places/3/availability') {
      const answer = () => jsonResponse({ place_id: 3, date: '2026-10-11', busy })
      return holdAvailability ? holdAvailability.then(answer) : Promise.resolve(answer())
    }
    if (path === '/bookings') {
      bookingBody = JSON.parse(String(init.body))
      const answer = bookingAnswers.shift()
      return Promise.resolve(answer ? answer() : jsonResponse(BOOKED, 201))
    }
    return Promise.resolve(jsonResponse({ detail: 'unknown' }, 404))
  })
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

function Form() {
  const [booked, setBooked] = useState<Booking | null>(null)
  return <BookingForm place={ROOM} seat={null} rules={RULES} timeZone="Asia/Jerusalem" booked={booked} onBooked={setBooked} />
}

function renderPanel() {
  const router = createMemoryRouter(
    [{ path: '/spaces/3', element: <Form /> }],
    { initialEntries: ['/spaces/3'] },
  )
  render(
    <AuthProvider>
      <RouterProvider router={router} />
    </AuthProvider>,
  )
}

describe('BookingForm', () => {
  it('a student of another institution is told so before choosing a time', async () => {
    ME.institution_slug = 'demo'
    try {
      renderPanel()
      expect(await screen.findByText('רק סטודנטים של המוסד הזה יכולים להזמין כאן.')).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: '10:00' })).not.toBeInTheDocument()
    } finally {
      ME.institution_slug = 'braude'
    }
  })

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
    // The ticket replaces the form.
    expect(await screen.findByText('ההזמנה נקלטה')).toBeInTheDocument()
    expect(screen.getByText('10:00–11:30')).toBeInTheDocument()
    expect(screen.getByText('הזמנה מספר 9')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /EM107/ })).toHaveFocus() // the keyboard stays on the ticket
    expect(bookingBody).toEqual({
      place_id: 3,
      seat_id: null,
      starts_at: '2026-10-11T07:00:00.000Z', // 10:00 in Israel
      ends_at: '2026-10-11T08:30:00.000Z',
    })
  })

  it('after a clash, says so and offers the nearest free time of the same length', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    // Someone books 10:00-11:30 a moment before us.
    let release = () => {}
    bookingAnswers.push(() => {
      holdAvailability = new Promise((resolve) => (release = resolve))
      busy = [...busy, { seat_id: null, starts_at: '2026-10-11T07:00:00Z', ends_at: '2026-10-11T08:30:00Z' }]
      return jsonResponse({ detail: 'slot_taken' }, 409)
    })
    renderPanel()
    await user.click(await screen.findByRole('button', { name: '10:00' }))
    await user.click(screen.getByRole('button', { name: 'שעה וחצי' }))
    await user.click(screen.getByRole('button', { name: 'להזמין' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('מישהו הזמין את הזמן הזה ממש עכשיו.')
    // Until the fresh times arrive, the taken time is never offered back.
    expect(screen.queryByRole('button', { name: /הזמן הפנוי הקרוב/ })).not.toBeInTheDocument()
    expect(screen.getByText('בודק מה עוד פנוי…')).toBeInTheDocument()
    holdAvailability = null
    release()
    const offer = await screen.findByRole('button', { name: /הזמן הפנוי הקרוב: 11:30–13:00/ })
    expect(screen.getByRole('button', { name: '10:00' })).toBeDisabled()
    await user.click(offer)
    await user.click(screen.getByRole('button', { name: 'להזמין' }))
    expect(await screen.findByText('ההזמנה נקלטה')).toBeInTheDocument()
    expect(bookingBody).toMatchObject({ starts_at: '2026-10-11T08:30:00.000Z', ends_at: '2026-10-11T10:00:00.000Z' })
  })

  it('adds the booking to a calendar by a link, with no file to download', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    renderPanel()
    await user.click(await screen.findByRole('button', { name: '10:00' }))
    await user.click(screen.getByRole('button', { name: 'שעה וחצי' }))
    await user.click(screen.getByRole('button', { name: 'להזמין' }))
    const google = await screen.findByRole('link', { name: /הוספה ליומן Google/ })
    const url = new URL(google.getAttribute('href')!)
    expect(url.hostname).toBe('calendar.google.com')
    expect(url.searchParams.get('dates')).toBe('20261011T070000Z/20261011T083000Z') // 10:00-11:30 in Israel
    expect(url.searchParams.get('text')).toContain('EM107')
    // A new tab, which cannot reach back into this page.
    expect(google).toHaveAttribute('target', '_blank')
    expect(google.getAttribute('rel')).toContain('noopener')
    const outlook = screen.getByRole('link', { name: /Outlook/ })
    expect(new URL(outlook.getAttribute('href')!).hostname).toBe('outlook.office.com')
  })

  it('a slot just before a booking offers only the time until it', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    renderPanel()
    await user.click(await screen.findByRole('button', { name: '08:30' }))
    expect(screen.getByRole('button', { name: 'חצי שעה' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'שעה' })).not.toBeInTheDocument()
  })
})

describe('BookingForm as time passes', () => {
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
