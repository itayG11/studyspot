import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError, resetSessionForTests } from '../../api/client'
import { AuthProvider } from '../../auth/AuthContext'
import type { Building, CampusToday, Place } from '../../api/types'
import { InstitutionProvider } from '../../institution'
import { building, INSTITUTION, jsonResponse, place } from '../../test/fixtures'
import { Finder } from './Finder'

const LAB = place({ id: 1, name: 'M206', building_code: 'M', kind: 'computer_lab', amenities: ['computers', 'outlets'], atmosphere: 'quiet' })
const ROOM = place({ id: 3, name: 'EM107', building_code: 'EM', kind: 'group_room', amenities: ['whiteboard'], atmosphere: 'conversation', suited_for: 'group', free_now: false, free_from: '2026-10-11T10:30:00Z', capacity: 8 })
const PLACES = [LAB, ROOM]
const BUILDINGS = [building({ code: 'M' }), building({ id: 2, code: 'EM', latitude: '32.914079', longitude: '35.281250' })]

beforeEach(() => {
  resetSessionForTests()
  vi.stubGlobal('fetch', vi.fn((url: string) =>
    Promise.resolve(new URL(url).pathname === '/auth/refresh'
      ? jsonResponse({ detail: 'not_authenticated' }, 401)
      : jsonResponse(INSTITUTION)),
  ))
})

afterEach(() => {
  vi.unstubAllGlobals()
  localStorage.clear()
})

function renderFinder({ path = '/', places = PLACES as Place[] | null, buildings = BUILDINGS as Building[] | null, error = null as ApiError | null, today = null as CampusToday | null } = {}) {
  const onRetry = vi.fn()
  const router = createMemoryRouter(
    [{ path: '/', element: <Finder places={places} buildings={buildings} today={today} error={error} onRetry={onRetry} /> }, { path: '/braude/spaces/:id', element: <p>דף המקום</p> }],
    { initialEntries: [path] },
  )
  render(
    <AuthProvider>
      <InstitutionProvider slug="braude">
        <RouterProvider router={router} />
      </InstitutionProvider>
    </AuthProvider>,
  )
  return { router, onRetry }
}

const cards = () => screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent)

describe('Finder', () => {
  it('shows the campus today, and how busy each place usually is in an hour', async () => {
    const first = PLACES[0] as Place
    renderFinder({
      today: {
        weekday: 6, capacity: 50, occupied: 10, weeks: 8, simulated: false,
        slots: [{ start: '09:00:00', usual: 12, today: 10 }],
        places: [{ place_id: first.id, next_hour: 0.9 }],
      },
    })
    expect(await screen.findByRole('heading', { name: 'העומס היום בקמפוס' })).toBeInTheDocument()
    const card = screen.getByRole('link', { name: first.name }).closest('li') as HTMLElement
    expect(within(card).getByText(/בעוד שעה: בדרך כלל/)).toBeInTheDocument()
  })

  it('shows every place as a card, with its live line', async () => {
    renderFinder()
    expect(await screen.findByRole('link', { name: 'M206' })).toBeInTheDocument()
    expect(cards()).toEqual(['M206', 'EM107'])
    expect(screen.getByText('פנוי מ-13:30')).toBeInTheDocument()
    expect(screen.getByText('2 מקומות')).toBeInTheDocument()
  })

  it('a full card says when it usually frees up', async () => {
    const full = place({ id: 6, name: 'ספרייה', building_code: 'L', kind: 'library', bookable: false, occupied: 40, available: 0, usually_frees_at: '14:30:00' })
    renderFinder({ places: [LAB, full] })
    const card = (await screen.findByRole('link', { name: 'ספרייה' })).closest('li')!
    expect(within(card).getByText('בדרך כלל מתפנה ב-14:30')).toBeInTheDocument()
    const lab = screen.getByRole('link', { name: 'M206' }).closest('li')!
    expect(within(lab).queryByText(/מתפנה/)).not.toBeInTheDocument()
  })

  it('a card tells a walk-in place from one booked ahead', async () => {
    const area = place({ id: 5, name: 'מתחם לימוד', building_code: 'L', kind: 'open_area', bookable: false })
    renderFinder({ places: [LAB, area] })
    const walkIn = (await screen.findByRole('link', { name: 'מתחם לימוד' })).closest('li')!
    expect(within(walkIn).getByText('בלי הזמנה: נכנסים בסריקה')).toBeInTheDocument()
    const bookable = screen.getByRole('link', { name: 'M206' }).closest('li')!
    expect(within(bookable).queryByText('בלי הזמנה: נכנסים בסריקה')).not.toBeInTheDocument()
  })

  it('a group room card has "book", which opens the booking on its page', async () => {
    const { router } = renderFinder()
    const book = await screen.findByRole('link', { name: 'להזמין את EM107' })
    const lab = screen.getByRole('link', { name: 'M206' }).closest('li')!
    expect(within(lab).queryByRole('link', { name: /להזמין/ })).not.toBeInTheDocument()
    await userEvent.click(book)
    expect(router.state.location.pathname).toBe('/braude/spaces/3')
    expect(router.state.location.state).toMatchObject({ book: true })
  })

  it('filters as you type, and keeps the search in the address', async () => {
    const { router } = renderFinder()
    await userEvent.type(await screen.findByRole('searchbox', { name: 'חיפוש מקום' }), 'לוח')
    expect(cards()).toEqual(['EM107']) // the results follow at once
    // The address follows after a short pause in typing.
    expect(router.state.location.search).toBe('')
    await waitFor(() => expect(router.state.location.search).toBe(`?q=${encodeURIComponent('לוח')}`))
  })

  it('un-starring the last favourite turns "my favourites" off, not into an empty list', async () => {
    localStorage.setItem('studyspot:favorites', JSON.stringify([3]))
    renderFinder()
    await userEvent.click(await screen.findByRole('button', { name: 'המועדפים שלי' }))
    expect(cards()).toEqual(['EM107'])
    await userEvent.click(screen.getByRole('button', { name: 'מועדף: EM107' }))
    expect(screen.queryByRole('button', { name: 'המועדפים שלי' })).not.toBeInTheDocument()
    expect(cards()).toEqual(['M206', 'EM107'])
  })

  it('opens the expanded filters, and narrows by building, group size and equipment', async () => {
    const { router } = renderFinder()
    const toggle = await screen.findByRole('button', { name: 'סינון מורחב' })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    await userEvent.click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    const panel = screen.getByRole('group', { name: 'סינון מורחב' })
    await userEvent.selectOptions(within(panel).getByLabelText('בניין'), 'EM')
    expect(cards()).toEqual(['EM107'])
    await userEvent.click(within(panel).getByRole('button', { name: 'לוח מחיק' }))
    await userEvent.selectOptions(within(panel).getByLabelText('כמה אנשים'), '4')
    expect(cards()).toEqual(['EM107'])
    expect(router.state.location.search).toContain('building=EM')
    expect(router.state.location.search).toContain('amenity=whiteboard')
    expect(router.state.location.search).toContain('people=4')
    expect(toggle).toHaveTextContent('3') // three expanded filters on
  })

  it('a shared link with expanded filters opens their panel', async () => {
    renderFinder({ path: '/?building=M' })
    expect(await screen.findByRole('button', { name: 'סינון מורחב' })).toHaveAttribute('aria-expanded', 'true')
    expect(cards()).toEqual(['M206'])
  })

  it('"quick": two questions, and the places that fit now, with why', async () => {
    const { router } = renderFinder()
    await userEvent.click(await screen.findByRole('button', { name: 'מהיר: איפה ללמוד עכשיו?' }))
    const sheet = screen.getByRole('dialog', { name: 'איפה ללמוד עכשיו?' })
    await userEvent.click(within(sheet).getByRole('button', { name: 'קבוצה' }))
    await userEvent.click(within(sheet).getByRole('button', { name: 'לדבר' }))
    // EM107 is a group room, but taken now: nothing fits.
    expect(within(sheet).getByText('אין עכשיו מקום פנוי שמתאים לשתי התשובות.')).toBeInTheDocument()
    await userEvent.click(within(sheet).getByRole('button', { name: 'לבד' }))
    await userEvent.click(within(sheet).getByRole('button', { name: 'מחשב' }))
    const pick = within(sheet).getByRole('link', { name: 'M206' })
    expect(within(sheet).getByRole('list', { name: 'הצעות' })).toHaveTextContent('38 מקומות פנויים עכשיו · יש מחשבים · מתאים ללימוד לבד')
    await userEvent.click(pick)
    expect(router.state.location.pathname).toBe('/braude/spaces/1')
  })

  it('opens with the filters of a shared link', async () => {
    renderFinder({ path: '/?quiet=1' })
    expect(await screen.findByRole('button', { name: /שקט/ })).toHaveAttribute('aria-pressed', 'true')
    expect(cards()).toEqual(['M206'])
  })

  it('shows on each chip how many places it would leave', async () => {
    renderFinder()
    expect(await screen.findByRole('button', { name: /עם מחשבים/ })).toHaveTextContent('1')
    expect(screen.getByRole('button', { name: /לקבוצה/ })).toHaveTextContent('1')
  })

  it('says when nothing matches, and clears everything with one button', async () => {
    const { router } = renderFinder({ path: '/?q=בריכה' })
    expect(await screen.findByRole('heading', { name: 'אין מקום שמתאים לכל הסינונים' })).toBeInTheDocument()
    await userEvent.click(within(screen.getByRole('heading', { name: 'אין מקום שמתאים לכל הסינונים' }).closest('section')!).getByRole('button', { name: 'ניקוי הסינון' }))
    expect(router.state.location.search).toBe('')
    expect(cards()).toEqual(['M206', 'EM107'])
  })

  it('remembers a favourite and can show only favourites', async () => {
    renderFinder()
    const star = await screen.findByRole('button', { name: 'מועדף: EM107' })
    expect(star).toHaveAttribute('aria-pressed', 'false')
    expect(screen.queryByRole('button', { name: /המועדפים שלי/ })).toBeNull()
    await userEvent.click(star)
    expect(star).toHaveAttribute('aria-pressed', 'true')
    await userEvent.click(screen.getByRole('button', { name: /המועדפים שלי/ }))
    expect(cards()).toEqual(['EM107'])
  })

  it('marks demo details on the card', async () => {
    renderFinder()
    expect(await screen.findAllByText('נתוני דמו')).toHaveLength(2)
  })

  it('on the map, a chosen building has a panel: what is free in it, and "only this building"', async () => {
    const { router } = renderFinder({ path: '/?view=map' })
    await userEvent.click(await screen.findByRole('button', { name: 'EM107 במפה' }))
    const panel = screen.getByRole('region', { name: 'בניין EM' })
    expect(panel).toHaveTextContent('60 מקומות פנויים עכשיו, מתוך 65')
    expect(panel).toHaveTextContent('מקום אחד ברשימה')
    expect(cards()).toEqual(['EM107'])
    await userEvent.click(within(panel).getByRole('button', { name: 'רק הבניין הזה' }))
    expect(router.state.location.search).toContain('building=EM')
    await userEvent.click(within(panel).getByRole('button', { name: 'הסרת הבחירה' }))
    expect(screen.queryByRole('region', { name: 'בניין EM' })).not.toBeInTheDocument()
  })

  it('moves between list and map through the address', async () => {
    const { router } = renderFinder()
    await userEvent.click(await screen.findByRole('button', { name: 'מפה' }))
    expect(router.state.location.search).toBe('?view=map')
    expect(screen.getByRole('button', { name: 'מפה' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('shows skeletons while loading, and the error with a retry', async () => {
    const { onRetry } = renderFinder({ places: null, buildings: null, error: new ApiError(0, 'network_error') })
    await userEvent.click(await screen.findByRole('button', { name: 'נסה שוב' }))
    expect(onRetry).toHaveBeenCalledOnce()
  })

  it('leads from the card to the place page', async () => {
    const { router } = renderFinder()
    await userEvent.click(await screen.findByRole('link', { name: 'M206' }))
    expect(router.state.location.pathname).toBe('/braude/spaces/1')
  })
})
