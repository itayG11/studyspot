import { act, render, screen } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { PlaceDetail } from '../../api/types'
import { REFRESH_INTERVAL_MS } from '../../config'
import { AuthProvider } from '../../auth/AuthContext'
import { resetSessionForTests } from '../../api/client'
import { InstitutionProvider } from '../../institution'
import { jsonResponse, place, seat } from '../../test/fixtures'
import { SpacePage } from './SpacePage'

const INSTITUTION = {
  slug: 'braude', name: 'מכללת בראודה', timezone: 'Asia/Jerusalem',
  booking_rules: { slot_minutes: 15, max_minutes: 120, days_ahead: 4, horizon_minutes: 5760, max_upcoming: 2, arrive_early_minutes: 10, no_show_after_minutes: 15 },
}

function lab(overrides: Partial<PlaceDetail> = {}): PlaceDetail {
  return {
    ...place(),
    opening_hours: [{ weekday: 6, opens: '07:00:00', closes: '20:00:00' }],
    open_all_day_today: false,
    lab_rows: 1,
    lab_cols: 2,
    seats: [seat(), seat({ id: 2, col: 2, label: 'A2', occupied: true, free_now: false })],
    ...overrides,
  }
}

let placeResponses: (() => Response)[] = []
let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  placeResponses = []
  fetchMock = vi.fn((url: string) => {
    const path = new URL(url).pathname
    if (path === '/institutions/braude') return Promise.resolve(jsonResponse(INSTITUTION))
    if (path.startsWith('/auth/')) return Promise.resolve(jsonResponse({ detail: 'not_authenticated' }, 401))
    const next = placeResponses.shift()
    return next ? Promise.resolve(next()) : Promise.reject(new TypeError('Failed to fetch'))
  })
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

function renderAt(path: string) {
  const router = createMemoryRouter([{ path: '/spaces/:spaceId', Component: SpacePage }], { initialEntries: [path] })
  resetSessionForTests()
  render(
    <AuthProvider>
      <InstitutionProvider>
        <RouterProvider router={router} />
      </InstitutionProvider>
    </AuthProvider>,
  )
}

const placeCalls = () => fetchMock.mock.calls.filter(([url]) => new URL(url).pathname.startsWith('/places'))

describe('SpacePage', () => {
  it('an invalid address shows "not found" without asking the server', async () => {
    renderAt('/spaces/abc')
    expect(await screen.findByText('הדף לא נמצא')).toBeInTheDocument()
    expect(placeCalls()).toHaveLength(0)
  })

  it('an unknown place shows "not found"', async () => {
    placeResponses.push(() => jsonResponse({ detail: 'place_not_found' }, 404))
    renderAt('/spaces/99')
    expect(await screen.findByText('הדף לא נמצא')).toBeInTheDocument()
  })

  it('shows the lab, its free and taken stations and the opening hours', async () => {
    placeResponses.push(() => jsonResponse(lab()))
    renderAt('/spaces/1')
    expect(await screen.findByRole('heading', { name: 'M206' })).toBeInTheDocument()
    expect(screen.getByLabelText('A1: פנוי')).toBeInTheDocument()
    expect(screen.getByLabelText('A2: תפוס')).toBeInTheDocument()
    expect(screen.getByRole('row', { name: /יום ראשון/ })).toHaveTextContent('07:00–20:00')
    expect(screen.getByRole('row', { name: /יום שבת/ })).toHaveTextContent('סגור')
  })

  it('a closed lab shows its free stations as closed', async () => {
    placeResponses.push(() => jsonResponse(lab({ is_open: false, seats: [seat({ free_now: false })] })))
    renderAt('/spaces/1')
    expect(await screen.findByLabelText('A1: סגור')).toBeInTheDocument()
    expect(screen.getByText('סגור עכשיו')).toBeInTheDocument()
  })

  it("shows today's timeline of a group room, with the booked hour", async () => {
    vi.useFakeTimers({ now: new Date('2026-10-11T05:00:00Z'), shouldAdvanceTime: true }) // Sunday 08:00
    const room = lab({ id: 3, kind: 'group_room', name: 'EM107', lab_rows: null, lab_cols: null, seats: null, bookable: true, free_now: true })
    placeResponses.push(() => jsonResponse(room))
    placeResponses.push(() =>
      jsonResponse({ place_id: 3, date: '2026-10-11', busy: [{ seat_id: null, starts_at: '2026-10-11T06:00:00Z', ends_at: '2026-10-11T07:00:00Z' }] }),
    )
    renderAt('/spaces/3')
    expect(await screen.findByRole('heading', { name: 'EM107' })).toBeInTheDocument()
    expect(await screen.findByText('09:00–10:00: תפוס')).toBeInTheDocument()
    expect(screen.getByText('07:00–08:00: עבר')).toBeInTheDocument()
    expect(screen.getByText('10:00–20:00: פנוי')).toBeInTheDocument()
  })

  it('a failed refresh keeps the page and shows a small notice', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    placeResponses.push(() => jsonResponse(lab()))
    renderAt('/spaces/1')
    expect(await screen.findByRole('heading', { name: 'M206' })).toBeInTheDocument()
    await act(() => vi.advanceTimersByTimeAsync(REFRESH_INTERVAL_MS)) // the next answer fails
    expect(await screen.findByRole('alert')).toHaveTextContent('אין חיבור לשרת')
    expect(screen.getByRole('heading', { name: 'M206' })).toBeInTheDocument()
  })
})
