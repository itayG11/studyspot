import { act, render, screen } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { PlaceDetail } from '../api/types'
import { REFRESH_INTERVAL_MS } from '../config'
import { InstitutionProvider } from '../institution'
import { jsonResponse, place, seat } from '../test/fixtures'
import { PlacePage } from './PlacePage'

const INSTITUTION = { slug: 'braude', name: 'מכללת בראודה', timezone: 'Asia/Jerusalem' }

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
  const router = createMemoryRouter([{ path: '/places/:placeId', Component: PlacePage }], { initialEntries: [path] })
  render(
    <InstitutionProvider>
      <RouterProvider router={router} />
    </InstitutionProvider>,
  )
}

const placeCalls = () => fetchMock.mock.calls.filter(([url]) => new URL(url).pathname.startsWith('/places'))

describe('PlacePage', () => {
  it('an invalid address shows "not found" without asking the server', async () => {
    renderAt('/places/abc')
    expect(await screen.findByText('הדף לא נמצא')).toBeInTheDocument()
    expect(placeCalls()).toHaveLength(0)
  })

  it('an unknown place shows "not found"', async () => {
    placeResponses.push(() => jsonResponse({ detail: 'place_not_found' }, 404))
    renderAt('/places/99')
    expect(await screen.findByText('הדף לא נמצא')).toBeInTheDocument()
  })

  it('shows the lab, its free and taken stations and the opening hours', async () => {
    placeResponses.push(() => jsonResponse(lab()))
    renderAt('/places/1')
    expect(await screen.findByRole('heading', { name: 'M206' })).toBeInTheDocument()
    expect(screen.getByLabelText('A1: פנוי')).toBeInTheDocument()
    expect(screen.getByLabelText('A2: תפוס')).toBeInTheDocument()
    expect(screen.getByRole('row', { name: /יום ראשון/ })).toHaveTextContent('07:00–20:00')
    expect(screen.getByRole('row', { name: /יום שבת/ })).toHaveTextContent('סגור')
  })

  it('a closed lab shows its free stations as closed', async () => {
    placeResponses.push(() => jsonResponse(lab({ is_open: false, seats: [seat({ free_now: false })] })))
    renderAt('/places/1')
    expect(await screen.findByLabelText('A1: סגור')).toBeInTheDocument()
    expect(screen.getByText('סגור עכשיו', { selector: '.badge' })).toBeInTheDocument()
  })

  it('a failed refresh keeps the page and shows a small notice', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    placeResponses.push(() => jsonResponse(lab()))
    renderAt('/places/1')
    expect(await screen.findByRole('heading', { name: 'M206' })).toBeInTheDocument()
    await act(() => vi.advanceTimersByTimeAsync(REFRESH_INTERVAL_MS)) // the next answer fails
    expect(await screen.findByRole('alert')).toHaveTextContent('אין חיבור לשרת')
    expect(screen.getByRole('heading', { name: 'M206' })).toBeInTheDocument()
  })
})
