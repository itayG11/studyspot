// Every institution has its own address (/demo, /braude). Old addresses,
// printed on signs or shared before, still lead to the right page.

import { act, render, screen, waitFor, within } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { resetSessionForTests } from './api/client'
import { AuthProvider } from './auth/AuthContext'
import { forgetVisitForTests } from './institution'
import { routes } from './router'
import { INSTITUTION, jsonResponse, place } from './test/fixtures'

const DEMO = { ...INSTITUTION, slug: 'demo', name: 'קמפוס הדגמה' }
const BRAUDE = INSTITUTION
const ME = { id: 1, email: 'noa@gmail.com', display_name: 'נועה', role: 'student', institution_slug: 'braude', is_demo: false }

let signedIn: boolean
let slowServer: boolean // the institution's details never arrive

beforeEach(() => {
  resetSessionForTests()
  forgetVisitForTests()
  signedIn = false
  slowServer = false
  // The front page's story asks about the screen; jsdom has no answer.
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: false, media: query, addEventListener() {}, removeEventListener() {} }))
  vi.stubGlobal('fetch', vi.fn((url: string) => {
    const path = new URL(url).pathname
    if (path === '/auth/refresh') {
      return Promise.resolve(signedIn
        ? jsonResponse({ access_token: 't', token_type: 'bearer', expires_in: 900, user: ME })
        : jsonResponse({ detail: 'not_authenticated' }, 401))
    }
    if (path === '/institutions/demo') return Promise.resolve(jsonResponse(DEMO))
    if (path === '/institutions/braude') return slowServer ? new Promise(() => {}) : Promise.resolve(jsonResponse(BRAUDE))
    if (path.endsWith('/buildings') || path.endsWith('/places')) return Promise.resolve(jsonResponse([]))
    if (path === '/places/7') {
      return Promise.resolve(jsonResponse({
        ...place({ id: 7, name: 'EM107', kind: 'group_room' }),
        institution_slug: 'braude',
        opening_hours: [], open_all_day_today: false, lab_rows: null, lab_cols: null, seats: null,
      }))
    }
    return Promise.resolve(jsonResponse({ detail: 'institution_not_found' }, 404))
  }))
})

afterEach(() => {
  vi.unstubAllGlobals()
})

function renderAt(path: string) {
  const router = createMemoryRouter(routes, { initialEntries: [path] })
  render(
    <AuthProvider>
      <RouterProvider router={router} />
    </AuthProvider>,
  )
  return router
}

const header = async () => within(await screen.findByRole('banner'))

describe('an address per institution', () => {
  it('the front page of a visitor is the demo campus', async () => {
    const router = renderAt('/')
    await waitFor(() => expect(router.state.location.pathname).toBe('/demo'))
    expect(await (await header()).findByText('קמפוס הדגמה')).toBeInTheDocument()
  })

  it('a signed-in student starts at their own institution', async () => {
    signedIn = true
    const router = renderAt('/')
    await waitFor(() => expect(router.state.location.pathname).toBe('/braude'))
  })

  it('each institution opens at its own address, and its links stay there', async () => {
    renderAt('/braude')
    const top = await header()
    expect(await top.findByText('מכללת בראודה')).toBeInTheDocument()
    expect(top.getByRole('link', { name: 'חיפוש מקום' })).toHaveAttribute('href', '/braude')
  })

  it('an unknown institution says so', async () => {
    renderAt('/nowhere')
    expect(await screen.findByText('המוסד לא נמצא')).toBeInTheDocument()
  })

  it('an old place link goes to the place, at its own institution', async () => {
    const router = renderAt('/spaces/7')
    await waitFor(() => expect(router.state.location.pathname).toBe('/braude/spaces/7'))
    expect(await screen.findByRole('heading', { name: 'EM107' })).toBeInTheDocument()
  })

  it('a place opened under the wrong institution moves to the right one', async () => {
    const router = renderAt('/demo/spaces/7')
    await waitFor(() => expect(router.state.location.pathname).toBe('/braude/spaces/7'))
  })

  it('the oldest place links (/places/7) still work', async () => {
    const router = renderAt('/places/7')
    await waitFor(() => expect(router.state.location.pathname).toBe('/braude/spaces/7'))
  })

  it('the old list of places opens the finder with the same filter', async () => {
    const router = renderAt('/places?kind=library')
    await waitFor(() => expect(router.state.location.pathname).toBe('/demo'))
    expect(router.state.location.search).toBe('?kind=library')
    expect(router.state.location.hash).toBe('#finder')
  })

  it('the scan page keeps one address for every institution, so the signs need no change', async () => {
    const router = renderAt('/scan')
    await waitFor(() => expect(router.state.location.pathname).toBe('/login'))
  })

  it('the sign-in page opened from an institution still shows that institution', async () => {
    const router = renderAt('/braude')
    expect(await (await header()).findByText('מכללת בראודה')).toBeInTheDocument()
    slowServer = true
    await act(() => router.navigate('/login'))
    // At once, with no loading screen in between: the institution is known.
    const top = within(screen.getByRole('banner'))
    expect(top.getByText('מכללת בראודה')).toBeInTheDocument()
    expect(top.getByRole('link', { name: 'חיפוש מקום' })).toHaveAttribute('href', '/braude')
  })

  it('an unknown page of an institution leads back to that institution', async () => {
    renderAt('/braude/nope')
    expect(await screen.findByText('הדף לא נמצא')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'לחיפוש מקום' })).toHaveAttribute('href', '/braude')
  })
})
