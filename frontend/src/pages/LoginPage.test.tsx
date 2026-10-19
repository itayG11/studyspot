import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { resetSessionForTests } from '../api/client'
import { AuthProvider } from '../auth/AuthContext'
import { jsonResponse } from '../test/fixtures'
import { LoginPage } from './LoginPage'

const ME = { id: 7, email: 'demo.student@studyspot.invalid', display_name: 'סטודנט לדוגמה', role: 'student', institution_slug: 'braude' }

let providers: { providers: string[]; demo: boolean; email?: boolean } = { providers: ['microsoft'], demo: true }
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
  it('says that signing in means agreeing to the terms and the privacy policy', async () => {
    renderLogin()
    const line = await screen.findByText(/בהתחברות אתה מסכים/)
    expect(within(line).getByRole('link', { name: 'תנאי השימוש' })).toHaveAttribute('href', '/terms')
    expect(within(line).getByRole('link', { name: 'מדיניות הפרטיות' })).toHaveAttribute('href', '/privacy')
  })

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

describe('LoginPage return path', () => {
  function renderAt(path: string) {
    const router = createMemoryRouter(
      [
        { path: '/login', Component: LoginPage },
        { path: '/', element: <p>מפה</p> },
        { path: '/me', element: <p>האזור שלי</p> },
      ],
      { initialEntries: [path] },
    )
    render(
      <AuthProvider>
        <RouterProvider router={router} />
      </AuthProvider>,
    )
    return router
  }

  it('goes back to the page that asked for sign-in', async () => {
    const router = renderAt('/login?next=%2Fme')
    await userEvent.click(await screen.findByRole('button', { name: 'כניסה כסטודנט לדוגמה' }))
    expect(await screen.findByText('האזור שלי')).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/me')
  })

  it('never follows a return address to another site', async () => {
    const router = renderAt('/login?next=%2F%2Fevil.example')
    await userEvent.click(await screen.findByRole('button', { name: 'כניסה כסטודנט לדוגמה' }))
    expect(await screen.findByText('מפה')).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/')
  })
})

describe('LoginPage email code', () => {
  const STUDENT = { ...ME, email: 'itay.gabay@e.braude.ac.il', display_name: 'Itay Gabay' }
  // A new code is offered a minute after the last: the clock is a fake one
  // that also runs on its own, so the rest of the page works as usual.
  const aMinutePasses = () => act(() => vi.advanceTimersByTimeAsync(60_000))
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  beforeEach(() => {
    providers = { providers: [], demo: false, email: true }
    const base = fetchMock.getMockImplementation() as (url: string) => Promise<Response>
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      const path = new URL(url).pathname
      if (path === '/auth/email/start') {
        const { email } = JSON.parse(String(init!.body))
        if (email.endsWith('@gmail.com')) return Promise.resolve(jsonResponse({ detail: 'email_domain_not_supported' }, 403))
        return Promise.resolve(jsonResponse({ expires_in: 1200 }, 202))
      }
      if (path === '/auth/email/verify') {
        const { code } = JSON.parse(String(init!.body))
        if (code !== '123456') return Promise.resolve(jsonResponse({ detail: 'email_code_invalid' }, 400))
        return Promise.resolve(jsonResponse({ access_token: 't', token_type: 'bearer', expires_in: 900, user: STUDENT }))
      }
      return base(url)
    })
  })

  function bodyOf(path: string) {
    const call = fetchMock.mock.calls.findLast(([url]) => String(url).endsWith(path))
    return JSON.parse(call![1].body)
  }

  it('sends a code, then signs in with it and goes to the map', async () => {
    const router = renderLogin()
    await userEvent.type(await screen.findByLabelText('כתובת המייל של המכללה'), ' Itay.Gabay@e.braude.ac.il ')
    await userEvent.click(screen.getByRole('button', { name: 'שליחת קוד' }))
    expect(bodyOf('/auth/email/start')).toEqual({ email: 'Itay.Gabay@e.braude.ac.il' })
    expect(await screen.findByText(/שלחנו קוד בן 6 ספרות אל/)).toHaveTextContent('itay.gabay@e.braude.ac.il')

    const code = screen.getByLabelText('הקוד מהמייל')
    expect(code).toHaveAttribute('autocomplete', 'one-time-code')
    expect(code).toHaveAttribute('inputmode', 'numeric')
    await userEvent.type(code, '123 456')
    expect(code).toHaveValue('123456')
    await userEvent.click(screen.getByRole('button', { name: 'כניסה' }))
    expect(await screen.findByText('מפה')).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/')
    expect(bodyOf('/auth/email/verify')).toEqual({ email: 'Itay.Gabay@e.braude.ac.il', code: '123456' })
  })

  it('says in Hebrew when the address is not a college one', async () => {
    renderLogin()
    await userEvent.type(await screen.findByLabelText('כתובת המייל של המכללה'), 'someone@gmail.com')
    await userEvent.click(screen.getByRole('button', { name: 'שליחת קוד' }))
    expect(await screen.findByText(/אפשר לקבל קוד רק לכתובת של מוסד/)).toBeInTheDocument()
    expect(screen.queryByLabelText('הקוד מהמייל')).not.toBeInTheDocument()
  })

  it('keeps the form after a wrong code, and can go back to change the address', async () => {
    renderLogin()
    await userEvent.type(await screen.findByLabelText('כתובת המייל של המכללה'), 'a@e.braude.ac.il')
    await userEvent.click(screen.getByRole('button', { name: 'שליחת קוד' }))
    await userEvent.type(await screen.findByLabelText('הקוד מהמייל'), '000000')
    await userEvent.click(screen.getByRole('button', { name: 'כניסה' }))
    expect(await screen.findByText(/הקוד לא נכון/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'שינוי כתובת' }))
    expect(screen.getByLabelText('כתובת המייל של המכללה')).toHaveValue('a@e.braude.ac.il')
  })

  it('says the email may be slow, and that an earlier code still works', async () => {
    // A college mailbox held the codes for minutes; a new code was asked
    // for meanwhile, and the late one seemed wrong.
    renderLogin()
    await userEvent.type(await screen.findByLabelText('כתובת המייל של המכללה'), 'a@e.braude.ac.il')
    await userEvent.click(screen.getByRole('button', { name: 'שליחת קוד' }))
    expect(await screen.findByText(/תקף ל-20 דקות/)).toBeInTheDocument()
    expect(screen.getByText(/עד כמה דקות/)).toBeInTheDocument()
    expect(screen.getByText(/גם קוד קודם עובד/)).toBeInTheDocument()
  })

  it('offers a new code only after a minute', async () => {
    renderLogin()
    await userEvent.type(await screen.findByLabelText('כתובת המייל של המכללה'), 'a@e.braude.ac.il')
    await userEvent.click(screen.getByRole('button', { name: 'שליחת קוד' }))
    expect(await screen.findByRole('button', { name: /שליחת קוד חדש בעוד \d+ שניות/ })).toBeDisabled()
    await aMinutePasses()
    expect(screen.getByRole('button', { name: 'שליחת קוד חדש' })).toBeEnabled()
  })

  it('asks for a new code', async () => {
    renderLogin()
    await userEvent.type(await screen.findByLabelText('כתובת המייל של המכללה'), 'a@e.braude.ac.il')
    await userEvent.click(screen.getByRole('button', { name: 'שליחת קוד' }))
    await screen.findByLabelText('הקוד מהמייל')
    await aMinutePasses()
    await userEvent.click(await screen.findByRole('button', { name: 'שליחת קוד חדש' }))
    expect(await screen.findByRole('status')).toHaveTextContent(/שלחנו קוד חדש/)
    expect(fetchMock.mock.calls.filter(([url]) => String(url).endsWith('/auth/email/start'))).toHaveLength(2)
  })

  it('says so when a new code is refused, and keeps the code step', async () => {
    renderLogin()
    await userEvent.type(await screen.findByLabelText('כתובת המייל של המכללה'), 'a@e.braude.ac.il')
    await userEvent.click(screen.getByRole('button', { name: 'שליחת קוד' }))
    await screen.findByLabelText('הקוד מהמייל')
    await aMinutePasses()
    const base = fetchMock.getMockImplementation() as (url: string, init?: RequestInit) => Promise<Response>
    fetchMock.mockImplementation((url: string, init?: RequestInit) =>
      String(url).endsWith('/auth/email/start')
        ? Promise.resolve(jsonResponse({ detail: 'too_many_codes' }, 429))
        : base(url, init),
    )
    await userEvent.click(screen.getByRole('button', { name: 'שליחת קוד חדש' }))
    expect(await screen.findByText(/נשלחו כבר כמה קודים/)).toBeInTheDocument()
    expect(screen.getByLabelText('הקוד מהמייל')).toBeInTheDocument()
  })

  it('shows the spinner only on the button whose action is running', async () => {
    renderLogin()
    await userEvent.type(await screen.findByLabelText('כתובת המייל של המכללה'), 'a@e.braude.ac.il')
    await userEvent.click(screen.getByRole('button', { name: 'שליחת קוד' }))
    await screen.findByLabelText('הקוד מהמייל')
    await aMinutePasses()
    let release!: () => void
    const base = fetchMock.getMockImplementation() as (url: string, init?: RequestInit) => Promise<Response>
    fetchMock.mockImplementation((url: string, init?: RequestInit) =>
      String(url).endsWith('/auth/email/start')
        ? new Promise<Response>((done) => (release = () => done(jsonResponse({ expires_in: 1200 }, 202))))
        : base(url, init),
    )
    await userEvent.click(screen.getByRole('button', { name: 'שליחת קוד חדש' }))
    expect(screen.getByRole('button', { name: 'שליחת קוד חדש' })).toHaveAttribute('aria-busy', 'true')
    expect(screen.getByRole('button', { name: 'כניסה' })).not.toHaveAttribute('aria-busy')
    release()
    expect(await screen.findByRole('status')).toHaveTextContent(/שלחנו קוד חדש/)
  })

  it('is hidden when the server has it off', async () => {
    providers = { providers: ['microsoft'], demo: false }
    renderLogin()
    await screen.findByRole('link', { name: 'התחברות עם מיקרוסופט' })
    expect(screen.queryByLabelText('כתובת המייל של המכללה')).not.toBeInTheDocument()
  })
})

describe('LoginPage password', () => {
  const STUDENT = { ...ME, email: 'noa@e.braude.ac.il', display_name: 'Noa', has_password: true, can_set_password: true }

  beforeEach(() => {
    providers = { providers: [], demo: false, email: true }
    const base = fetchMock.getMockImplementation() as (url: string) => Promise<Response>
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      const path = new URL(url).pathname
      const body = init?.body ? JSON.parse(String(init.body)) : {}
      const token = { access_token: 't', token_type: 'bearer', expires_in: 900, user: STUDENT }
      if (path === '/auth/password/login')
        return Promise.resolve(body.password === 'Kfar-Tavor 7 rain' ? jsonResponse(token) : jsonResponse({ detail: 'password_invalid' }, 401))
      if (path === '/auth/email/start') return Promise.resolve(jsonResponse({ expires_in: 1200 }, 202))
      if (path === '/auth/password/set') return Promise.resolve(jsonResponse(token))
      return base(url)
    })
  })

  function bodyOf(path: string) {
    const call = fetchMock.mock.calls.findLast(([url]) => String(url).endsWith(path))
    return JSON.parse(call![1].body)
  }

  async function passwordTab() {
    renderLogin()
    await userEvent.click(await screen.findByRole('button', { name: 'סיסמה' }))
  }

  it('starts on the code, and the password tab signs in with one', async () => {
    renderLogin()
    expect(await screen.findByRole('button', { name: 'קוד למייל' })).toHaveAttribute('aria-pressed', 'true')
    await userEvent.click(screen.getByRole('button', { name: 'סיסמה' }))
    await userEvent.type(screen.getByLabelText('כתובת המייל של המכללה'), 'noa@e.braude.ac.il')
    const field = screen.getByLabelText('סיסמה')
    expect(field).toHaveAttribute('autocomplete', 'current-password')
    await userEvent.type(field, 'Kfar-Tavor 7 rain')
    await userEvent.click(screen.getByRole('button', { name: 'כניסה' }))
    expect(await screen.findByText('מפה')).toBeInTheDocument()
    expect(bodyOf('/auth/password/login')).toEqual({ email: 'noa@e.braude.ac.il', password: 'Kfar-Tavor 7 rain' })
  })

  it('says one thing for any failure, and points to the code', async () => {
    await passwordTab()
    await userEvent.type(screen.getByLabelText('כתובת המייל של המכללה'), 'noa@e.braude.ac.il')
    await userEvent.type(screen.getByLabelText('סיסמה'), 'Wrong-Password 1')
    await userEvent.click(screen.getByRole('button', { name: 'כניסה' }))
    expect(await screen.findByText(/המייל או הסיסמה שגויים/)).toHaveTextContent('אפשר תמיד להיכנס בקוד למייל')
  })

  it('forgot it: a code first, then a new password that meets the rules', async () => {
    await passwordTab()
    await userEvent.click(screen.getByRole('button', { name: 'שכחתי סיסמה, או שעוד אין לי' }))
    expect(screen.getByRole('heading', { name: 'סיסמה חדשה' })).toHaveFocus() // the button pressed is gone
    await userEvent.type(screen.getByLabelText('כתובת המייל של המכללה'), 'noa@e.braude.ac.il')
    await userEvent.click(screen.getByRole('button', { name: 'שליחת קוד' }))
    await userEvent.type(await screen.findByLabelText('הקוד מהמייל'), '123456')
    const field = screen.getByLabelText('סיסמה חדשה')
    expect(field).toHaveAttribute('autocomplete', 'new-password')
    const save = screen.getByRole('button', { name: 'שמירת הסיסמה' })
    await userEvent.type(field, 'NoSymbolsHere7')
    expect(save).toBeDisabled()
    expect(screen.getByText(/סימן, למשל/)).toHaveTextContent('חסר')
    await userEvent.clear(field)
    await userEvent.type(field, 'Kfar-Tavor 7 rain')
    expect(save).toBeEnabled()
    await userEvent.click(save)
    expect(await screen.findByText('מפה')).toBeInTheDocument()
    expect(bodyOf('/auth/password/set')).toEqual({ email: 'noa@e.braude.ac.il', code: '123456', password: 'Kfar-Tavor 7 rain' })
  })

  it('can show what was typed', async () => {
    await passwordTab()
    await userEvent.click(screen.getByRole('button', { name: 'שכחתי סיסמה, או שעוד אין לי' }))
    await userEvent.type(screen.getByLabelText('כתובת המייל של המכללה'), 'noa@e.braude.ac.il')
    await userEvent.click(screen.getByRole('button', { name: 'שליחת קוד' }))
    const field = await screen.findByLabelText('סיסמה חדשה')
    expect(field).toHaveAttribute('type', 'password')
    await userEvent.click(screen.getByRole('button', { name: 'להציג' }))
    expect(field).toHaveAttribute('type', 'text')
  })
})
