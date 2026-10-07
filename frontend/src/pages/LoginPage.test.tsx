import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { resetSessionForTests } from '../api/client'
import { AuthProvider } from '../auth/AuthContext'
import { jsonResponse } from '../test/fixtures'
import { LoginPage } from './LoginPage'

const ME = { id: 7, email: 'demo.student@studyspot.invalid', display_name: 'סטודנט לדוגמה', role: 'student', institution_slug: 'braude' }

let providers = { providers: ['microsoft'], demo: true }
let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  resetSessionForTests()
  providers = { providers: ['microsoft'], demo: true }
  fetchMock = vi.fn((url: string) => {
    const path = new URL(url).pathname
    if (path === '/auth/refresh') return Promise.resolve(jsonResponse({ detail: 'invalid_session' }, 401))
    if (path === '/auth/providers') return Promise.resolve(jsonResponse(providers))
    if (path === '/auth/demo/login')
      return Promise.resolve(jsonResponse({ access_token: 't', token_type: 'bearer', expires_in: 900, user: ME }))
    return Promise.resolve(jsonResponse({ detail: 'unknown' }, 404))
  })
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => vi.unstubAllGlobals())

function renderLogin() {
  const router = createMemoryRouter(
    [
      { path: '/login', Component: LoginPage },
      { path: '/', element: <p>מפה</p> },
    ],
    { initialEntries: ['/login'] },
  )
  render(
    <AuthProvider>
      <RouterProvider router={router} />
    </AuthProvider>,
  )
  return router
}

describe('LoginPage', () => {
  it('links to each enabled provider', async () => {
    renderLogin()
    const link = await screen.findByRole('link', { name: 'התחברות עם מיקרוסופט' })
    expect(link).toHaveAttribute('href', 'http://localhost:8000/auth/microsoft/login')
  })

  it('signs in as the demo student and goes to the map', async () => {
    const router = renderLogin()
    await userEvent.click(await screen.findByRole('button', { name: 'כניסה כסטודנט לדוגמה' }))
    expect(await screen.findByText('מפה')).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/')
    const demoCall = fetchMock.mock.calls.find(([url]) => String(url).endsWith('/auth/demo/login'))
    expect(JSON.parse(demoCall![1].body)).toEqual({ persona: 'student' })
  })

  it('hides the demo buttons when the server has them off', async () => {
    providers = { providers: [], demo: false }
    renderLogin()
    expect(await screen.findByText('אין כרגע שיטת התחברות פעילה בשרת הזה.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /לדוגמה/ })).not.toBeInTheDocument()
  })
})
