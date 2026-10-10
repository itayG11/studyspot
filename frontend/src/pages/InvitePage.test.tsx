import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { resetSessionForTests } from '../api/client'
import { AuthProvider } from '../auth/AuthContext'
import { clearPendingInvite, peekPendingInvite } from '../auth/pendingInvite'
import { jsonResponse } from '../test/fixtures'
import { InvitePage } from './InvitePage'

const ME = { id: 1, email: 'new@gmail.com', display_name: 'חדש', role: 'student', institution_slug: 'demo', is_demo: false }
let signedIn: boolean
let acceptAnswer: () => Response
let calls: { path: string; body: unknown }[]

beforeEach(() => {
  resetSessionForTests()
  clearPendingInvite()
  signedIn = true
  calls = []
  acceptAnswer = () => jsonResponse({ slug: 'tel-hai', name: 'מכללת תל חי' })
  vi.stubGlobal('fetch', vi.fn((url: string, init: RequestInit) => {
    const path = new URL(url).pathname
    calls.push({ path, body: init.body ? JSON.parse(String(init.body)) : null })
    if (path === '/auth/refresh') {
      const user = calls.some((c) => c.path === '/invites/accept') ? { ...ME, role: 'institution_admin', institution_slug: 'tel-hai' } : ME
      return Promise.resolve(signedIn
        ? jsonResponse({ access_token: 't', token_type: 'bearer', expires_in: 900, user })
        : jsonResponse({ detail: 'not_authenticated' }, 401))
    }
    if (path === '/invites/inspect') return Promise.resolve(jsonResponse({ slug: 'tel-hai', name: 'מכללת תל חי' }))
    if (path === '/invites/accept') return Promise.resolve(acceptAnswer())
    return Promise.resolve(jsonResponse({ detail: 'unknown' }, 404))
  }))
})

afterEach(() => {
  vi.unstubAllGlobals()
})

function renderAt(path: string) {
  const router = createMemoryRouter(
    [{ path: '/invite', Component: InvitePage }, { path: '/:slug/admin', element: <p>דף הניהול</p> }],
    { initialEntries: [path] },
  )
  render(<AuthProvider><RouterProvider router={router} /></AuthProvider>)
  return router
}

describe('InvitePage', () => {
  it('names the institution, and after "accept" opens its admin page', async () => {
    const user = userEvent.setup()
    const router = renderAt('/invite#t=secret-token')
    expect(await screen.findByText(/הוזמנת לנהל את מכללת תל חי/)).toBeInTheDocument()
    expect(router.state.location.hash).toBe('') // the token left the address
    await user.click(screen.getByRole('button', { name: 'לקבל את ההזמנה' }))
    expect(await screen.findByText('דף הניהול')).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/tel-hai/admin')
    expect(calls.find((c) => c.path === '/invites/accept')?.body).toEqual({ token: 'secret-token' })
  })

  it('signed out, it explains and keeps the link for after signing in', async () => {
    signedIn = false
    renderAt('/invite#t=secret-token')
    const link = await screen.findByRole('link', { name: 'התחברות' })
    expect(link).toHaveAttribute('href', '/login?next=%2Finvite')
    expect(peekPendingInvite()).toBe('secret-token')
    expect(calls.some((c) => c.path === '/invites/inspect')).toBe(false)
  })

  it('a refusal is explained in plain words', async () => {
    const user = userEvent.setup()
    acceptAnswer = () => jsonResponse({ detail: 'invite_demo_account' }, 403)
    renderAt('/invite#t=secret-token')
    await user.click(await screen.findByRole('button', { name: 'לקבל את ההזמנה' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('חשבון לדוגמה')
  })

  it('without a link, says what is missing', async () => {
    renderAt('/invite')
    expect(await screen.findByText('הקישור לא שלם')).toBeInTheDocument()
  })

  it('warns that bookings at the demo campus go away', async () => {
    renderAt('/invite#t=secret-token')
    expect(await screen.findByText(/ההזמנות והכניסות שלך בקמפוס ההדגמה יימחקו/)).toBeInTheDocument()
  })

  it('the stored link is cleared once accepted', async () => {
    const user = userEvent.setup()
    renderAt('/invite#t=secret-token')
    await user.click(await screen.findByRole('button', { name: 'לקבל את ההזמנה' }))
    await waitFor(() => expect(peekPendingInvite()).toBeNull())
  })

  it('accepted, but the new role did not load: says so instead of a page that refuses', async () => {
    const user = userEvent.setup()
    renderAt('/invite#t=secret-token')
    const button = await screen.findByRole('button', { name: 'לקבל את ההזמנה' })
    signedIn = false // the refresh after accepting fails
    await user.click(button)
    expect(await screen.findByText('ההזמנה התקבלה')).toBeInTheDocument()
  })
})
