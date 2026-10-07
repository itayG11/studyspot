import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../../api/client'
import type { Building, Place } from '../../api/types'
import { InstitutionProvider } from '../../institution'
import { building, INSTITUTION, jsonResponse, place } from '../../test/fixtures'
import { Finder } from './Finder'

const LAB = place({ id: 1, name: 'M206', building_code: 'M', kind: 'computer_lab', amenities: ['computers', 'outlets'], atmosphere: 'quiet' })
const ROOM = place({ id: 3, name: 'EM107', building_code: 'EM', kind: 'group_room', amenities: ['whiteboard'], atmosphere: 'conversation', suited_for: 'group', free_now: false, free_from: '2026-10-11T10:30:00Z', capacity: 8 })
const PLACES = [LAB, ROOM]
const BUILDINGS = [building({ code: 'M' }), building({ id: 2, code: 'EM', latitude: '32.914079', longitude: '35.281250' })]

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(jsonResponse(INSTITUTION))))
})

afterEach(() => {
  vi.unstubAllGlobals()
  localStorage.clear()
})

function renderFinder({ path = '/', places = PLACES as Place[] | null, buildings = BUILDINGS as Building[] | null, error = null as ApiError | null } = {}) {
  const onRetry = vi.fn()
  const router = createMemoryRouter(
    [{ path: '/', element: <Finder places={places} buildings={buildings} error={error} onRetry={onRetry} /> }, { path: '/spaces/:id', element: <p>דף המקום</p> }],
    { initialEntries: [path] },
  )
  render(
    <InstitutionProvider>
      <RouterProvider router={router} />
    </InstitutionProvider>,
  )
  return { router, onRetry }
}

const cards = () => screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent)

describe('Finder', () => {
  it('shows every place as a card, with its live line', async () => {
    renderFinder()
    expect(await screen.findByRole('link', { name: 'M206' })).toBeInTheDocument()
    expect(cards()).toEqual(['M206', 'EM107'])
    expect(screen.getByText('פנוי מ-13:30')).toBeInTheDocument()
    expect(screen.getByText('2 מקומות')).toBeInTheDocument()
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
    expect(router.state.location.pathname).toBe('/spaces/1')
  })
})
