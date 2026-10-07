import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { jsonResponse, place } from '../test/fixtures'
import { PlacesPage } from './PlacesPage'

const LIBRARY = place({ id: 2, kind: 'library', name: 'ספרייה', building_code: 'EF', capacity: 80, available: 80, occupied: 0, bookable: false, counted: true })

let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  fetchMock = vi.fn((url: string) =>
    Promise.resolve(jsonResponse(String(url).includes('kind=library') ? [LIBRARY] : [place(), LIBRARY])),
  )
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => vi.unstubAllGlobals())

function renderAt(path: string) {
  const router = createMemoryRouter([{ path: '/places', Component: PlacesPage }], { initialEntries: [path] })
  render(<RouterProvider router={router} />)
  return router
}

describe('PlacesPage', () => {
  it('lists every place, then filters by kind through the address', async () => {
    const router = renderAt('/places')
    expect(await screen.findByText('M206')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'ספרייה' }))
    expect(router.state.location.search).toBe('?kind=library')
    expect(await screen.findByText('80 מקומות פנויים מתוך 80')).toBeInTheDocument()
    expect(screen.queryByText('M206')).not.toBeInTheDocument()
    expect(String(fetchMock.mock.calls.at(-1)?.[0])).toContain('kind=library')
  })

  it('ignores an unknown kind in the address', async () => {
    renderAt('/places?kind=pool')
    expect(await screen.findByText('M206')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'הכול' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('shows the server error in Hebrew', async () => {
    fetchMock.mockImplementation(() => Promise.resolve(jsonResponse({ detail: 'institution_not_found' }, 404)))
    renderAt('/places')
    expect(await screen.findByRole('alert')).toHaveTextContent('המוסד לא נמצא')
  })
})
