import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { resetSessionForTests } from '../api/client'
import { AuthProvider } from '../auth/AuthContext'
import { RequireAdmin } from '../auth/guards'
import { InstitutionProvider } from '../institution'
import { building, jsonResponse } from '../test/fixtures'
import { AdminPage } from './AdminPage'

// The real map needs a browser; here it is a button that "clicks" a point.
vi.mock('./PickMap', () => ({
  PickMap: ({ onPick, flyTo }: { onPick: (lat: number, lng: number) => void; flyTo?: [number, number] | null }) => (
    <button type="button" data-fly={flyTo ? flyTo.join(',') : ''} onClick={() => onPick(32.914579123, 35.280014987)}>
      לחיצה על המפה
    </button>
  ),
}))

const SIG = 'A'.repeat(43)
const INSTITUTION = {
  slug: 'braude', name: 'מכללת בראודה', timezone: 'Asia/Jerusalem',
  booking_rules: { slot_minutes: 15, max_minutes: 120, days_ahead: 4, horizon_minutes: 5760, max_upcoming: 2, arrive_early_minutes: 10, no_show_after_minutes: 15 },
}

const SETUP = {
  slug: 'braude', name: 'מכללת בראודה', timezone: 'Asia/Jerusalem', is_active: false, locked: false,
  rules: [] as { id: number; provider: string; value: string; approved: boolean }[], buildings: 2, located_buildings: 1, places: 0,
  microsoft_client_id: 'client-123',
}
let setup = SETUP
let codes: unknown[] | null = null
let role = 'institution_admin'
let posts: { path: string; body: unknown }[]

beforeEach(() => {
  resetSessionForTests()
  role = 'institution_admin'
  setup = SETUP
  codes = null
  posts = []
  vi.stubGlobal('fetch', vi.fn((url: string, init: RequestInit) => {
    const path = new URL(url).pathname
    if (init.method && init.method !== 'GET' && path !== '/auth/refresh')
      posts.push({ path, body: init.body ? JSON.parse(String(init.body)) : null })
    if (path === '/auth/refresh') {
      const user = { id: 2, email: 'demo.admin@studyspot.invalid', display_name: 'מנהל לדוגמה', role, institution_slug: 'braude' }
      return Promise.resolve(jsonResponse({ access_token: 't', token_type: 'bearer', expires_in: 900, user }))
    }
    if (path === '/institutions/braude') return Promise.resolve(jsonResponse(INSTITUTION))
    if (path === '/institutions/braude/buildings')
      return Promise.resolve(jsonResponse([building(), building({ id: 6, code: 'NX', latitude: null, longitude: null, places_count: 0, capacity: 0, available: 0, occupied: 0 })]))
    if (path === '/admin/institutions/braude/codes' && codes) return Promise.resolve(jsonResponse(codes))
    if (path === '/admin/institutions/braude/codes')
      return Promise.resolve(jsonResponse([{ place_id: 5, building_code: 'L', place_name: 'מתחם לימוד', code: `p5.v1.${SIG}` }]))
    if (path === '/admin/places/5/revoke-code')
      return Promise.resolve(jsonResponse({ place_id: 5, building_code: 'L', place_name: 'מתחם לימוד', code: `p5.v2.${SIG}` }))
    if (path === '/admin/institutions/braude/buildings') {
      const body = JSON.parse(String(init.body))
      if (body.code === 'M') return Promise.resolve(jsonResponse({ detail: 'building_code_taken' }, 409))
      return Promise.resolve(jsonResponse({ id: 9, code: body.code, name: null, floors_count: body.floors_count, latitude: null, longitude: null }, 201))
    }
    if (path === '/admin/buildings/6/places')
      return Promise.resolve(jsonResponse({ id: 30, building_id: 6, name: 'NX101', kind: 'group_room', capacity: 8 }, 201))
    if (path === '/admin/buildings/6/location')
      return Promise.resolve(jsonResponse({ id: 6, code: 'NX', latitude: '32.914579', longitude: '35.280015' }))
    if (path === '/admin/institutions/braude/setup') return Promise.resolve(jsonResponse(setup))
    if (path === '/admin/institutions/braude' && init.method === 'PATCH') {
      setup = { ...setup, ...JSON.parse(String(init.body)) }
      return Promise.resolve(jsonResponse(setup))
    }
    if (path === '/admin/institutions/braude/login-rules') {
      const body = JSON.parse(String(init.body))
      if (body.value === 'gmail.com') return Promise.resolve(jsonResponse({ detail: 'login_rule_public_domain' }, 409))
      const created = { id: 77, approved: false, ...body }
      setup = { ...setup, rules: [...setup.rules, created] }
      return Promise.resolve(jsonResponse(created, 201))
    }
    if (path.startsWith('/admin/login-rules/') && init.method === 'DELETE') {
      const id = Number(path.split('/').pop())
      setup = { ...setup, rules: setup.rules.filter((r) => r.id !== id) }
      return Promise.resolve(new Response(null, { status: 204 }))
    }
    if (path === '/admin/geocode')
      return Promise.resolve(jsonResponse([{ name: 'כרמיאל, ישראל', latitude: 32.9171, longitude: 35.305 }]))
    return Promise.resolve(jsonResponse({ detail: 'unknown' }, 404))
  }))
})

afterEach(() => vi.unstubAllGlobals())

function renderAdmin() {
  const router = createMemoryRouter(
    [{ path: '/admin', element: <RequireAdmin><AdminPage /></RequireAdmin> }],
    { initialEntries: ['/admin'] },
  )
  render(
    <AuthProvider>
      <InstitutionProvider slug="braude">
        <RouterProvider router={router} />
      </InstitutionProvider>
    </AuthProvider>,
  )
}

describe('AdminPage', () => {
  it('a student is not let in', async () => {
    role = 'student'
    renderAdmin()
    expect(await screen.findByText('אין גישה')).toBeInTheDocument()
  })

  it('shows a printable sign with a QR code for each place', async () => {
    renderAdmin()
    await userEvent.click(await screen.findByRole('button', { name: 'שלטים להדפסה' }))
    const sign = await screen.findByRole('listitem', { name: /מתחם לימוד/ })
    const qr = await within(sign).findByRole('img', { name: /קוד QR/ })
    expect(qr.getAttribute('src')).toMatch(/^data:image\/svg\+xml/)
  })

  it('revokes a code after asking, and shows the new one', async () => {
    renderAdmin()
    await userEvent.click(await screen.findByRole('button', { name: 'שלטים להדפסה' }))
    const sign = await screen.findByRole('listitem', { name: /מתחם לימוד/ })
    await userEvent.click(within(sign).getByRole('button', { name: 'לבטל את הקוד' }))
    await userEvent.click(within(sign).getByRole('button', { name: 'כן, קוד חדש' }))
    expect(posts.map((p) => p.path)).toContain('/admin/places/5/revoke-code')
    expect(await within(sign).findByText(/השלט הישן כבר לא עובד/)).toBeInTheDocument()
  })

  it('places a building where the map is clicked, rounded to 6 decimals', async () => {
    renderAdmin()
    await userEvent.click(await screen.findByRole('button', { name: 'מיקום בניינים' }))
    await userEvent.click(await screen.findByRole('button', { name: /בניין NX/ }))
    await userEvent.click(screen.getByRole('button', { name: 'לחיצה על המפה' }))
    await waitFor(() => expect(posts.map((p) => p.path)).toContain('/admin/buildings/6/location'))
    expect(posts.find((p) => p.path === '/admin/buildings/6/location')!.body).toEqual({ latitude: 32.914579, longitude: 35.280015 })
    expect(await screen.findByRole('status')).toHaveTextContent('בניין NX מוקם על המפה')
  })

  it('adds a building by its name and short name, where the map was clicked', async () => {
    renderAdmin()
    await userEvent.click(await screen.findByRole('button', { name: 'הוספה' }))
    await userEvent.type(screen.getByLabelText('שם הבניין'), 'בניין ההנדסה')
    await userEvent.type(screen.getByLabelText(/שם קצר/), 'zz')
    await userEvent.clear(screen.getByLabelText('מספר קומות'))
    await userEvent.type(screen.getByLabelText('מספר קומות'), '3')
    await userEvent.click(screen.getByRole('button', { name: 'לחיצה על המפה' }))
    expect(screen.getByText('נבחר מיקום על המפה.')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'הוספת בניין' }))
    await waitFor(() => expect(posts.map((p) => p.path)).toContain('/admin/institutions/braude/buildings'))
    expect(posts.find((p) => p.path === '/admin/institutions/braude/buildings')!.body).toEqual({
      name: 'בניין ההנדסה', code: 'ZZ', floors_count: 3, latitude: 32.914579, longitude: 35.280015,
    })
    expect(await screen.findByText(/בניין ההנדסה נוסף/)).toBeInTheDocument()
  })

  it('a building added without a point on the map can be placed later', async () => {
    renderAdmin()
    await userEvent.click(await screen.findByRole('button', { name: 'הוספה' }))
    await userEvent.type(screen.getByLabelText('שם הבניין'), 'ספרייה')
    await userEvent.type(screen.getByLabelText(/שם קצר/), 'L2')
    await userEvent.click(screen.getByRole('button', { name: 'הוספת בניין' }))
    await userEvent.click(await screen.findByRole('button', { name: 'למיקום על המפה' }))
    expect(await screen.findByRole('button', { name: 'מיקום בניינים' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('searches for a place, and the map flies to it', async () => {
    renderAdmin()
    await userEvent.click(await screen.findByRole('button', { name: 'הוספה' }))
    await userEvent.type(screen.getByLabelText('חיפוש מקום על המפה'), 'כרמיאל')
    await userEvent.click(screen.getByRole('button', { name: 'חיפוש' }))
    await userEvent.click(await screen.findByRole('button', { name: 'כרמיאל, ישראל' }))
    expect(screen.getByRole('button', { name: 'לחיצה על המפה' })).toHaveAttribute('data-fly', '32.9171,35.305')
    expect(screen.getByText(/OpenStreetMap/)).toBeInTheDocument() // the search's attribution
  })

  it('"my location" asks the browser, and the map flies there', async () => {
    vi.stubGlobal('navigator', {
      ...navigator,
      geolocation: { getCurrentPosition: (ok: PositionCallback) => ok({ coords: { latitude: 32.91, longitude: 35.29 } } as GeolocationPosition) },
    })
    renderAdmin()
    await userEvent.click(await screen.findByRole('button', { name: 'הוספה' }))
    await userEvent.click(screen.getByRole('button', { name: 'המיקום שלי' }))
    expect(screen.getByRole('button', { name: 'לחיצה על המפה' })).toHaveAttribute('data-fly', '32.91,35.29')
  })

  it('says so in Hebrew when the short name is taken', async () => {
    renderAdmin()
    await userEvent.click(await screen.findByRole('button', { name: 'הוספה' }))
    await userEvent.type(screen.getByLabelText('שם הבניין'), 'משהו')
    await userEvent.type(screen.getByLabelText(/שם קצר/), 'M')
    await userEvent.click(screen.getByRole('button', { name: 'הוספת בניין' }))
    expect(await screen.findByText(/כבר יש בניין עם הקוד הזה/)).toBeInTheDocument()
  })

  it('adds a place in a chosen building, with only that building\'s floors', async () => {
    renderAdmin()
    await userEvent.click(await screen.findByRole('button', { name: 'הוספה' }))
    await userEvent.selectOptions(await screen.findByLabelText('בניין'), '6')
    await userEvent.selectOptions(screen.getByLabelText('סוג המקום'), 'group_room')
    await userEvent.type(screen.getByLabelText('שם המקום'), 'NX101')
    expect(within(screen.getByLabelText('קומה')).getAllByRole('option')).toHaveLength(3)
    await userEvent.type(screen.getByLabelText('כמה אנשים'), '8')
    await userEvent.click(screen.getByRole('button', { name: 'הוספת מקום' }))
    await waitFor(() => expect(posts.map((p) => p.path)).toContain('/admin/buildings/6/places'))
    expect(posts.find((p) => p.path === '/admin/buildings/6/places')!.body).toEqual({
      kind: 'group_room', name: 'NX101', floor: 0, capacity: 8,
    })
    expect(await screen.findByText(/NX101 נוסף/)).toBeInTheDocument()
  })

  it('asks a computer lab for rows and columns instead of a capacity', async () => {
    renderAdmin()
    await userEvent.click(await screen.findByRole('button', { name: 'הוספה' }))
    await userEvent.selectOptions(await screen.findByLabelText('סוג המקום'), 'computer_lab')
    expect(screen.queryByLabelText('כמה אנשים')).not.toBeInTheDocument()
    expect(screen.getByLabelText('שורות של עמדות')).toBeInTheDocument()
    expect(screen.getByLabelText('עמדות בכל שורה')).toBeInTheDocument()
  })

  it('signs: an institution with no places is told how signs come about', async () => {
    codes = []
    renderAdmin()
    await userEvent.click(await screen.findByRole('button', { name: 'שלטים להדפסה' }))
    expect(await screen.findByText(/השלטים נוצרים לבד/)).toBeInTheDocument()
  })

  it('the setup tab comes first while the institution is not open, and marks what is done', async () => {
    renderAdmin()
    expect(await screen.findByRole('button', { name: 'הקמה' })).toHaveAttribute('aria-pressed', 'true')
    const steps = await screen.findByRole('list', { name: 'צעדי ההקמה' })
    const items = within(steps).getAllByRole('listitem')
    expect(items).toHaveLength(4)
    expect(items[0]).toHaveTextContent('גמור')
    expect(items[1]).not.toHaveTextContent('גמור') // no sign-in rule yet
  })

  it('adds an e-mail domain, and refuses a public one in Hebrew', async () => {
    renderAdmin()
    await userEvent.type(await screen.findByLabelText('סיומת המייל של הסטודנטים'), 'gmail.com')
    await userEvent.click(screen.getByRole('button', { name: 'הוספת סיומת' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('כתובת ציבורית')
    await userEvent.clear(screen.getByLabelText('סיומת המייל של הסטודנטים'))
    await userEvent.type(screen.getByLabelText('סיומת המייל של הסטודנטים'), 'telhai.ac.il')
    await userEvent.click(screen.getByRole('button', { name: 'הוספת סיומת' }))
    expect(await screen.findByText('telhai.ac.il')).toBeInTheDocument()
    expect(screen.getByText('ממתין לאישור מנהל המערכת')).toBeInTheDocument()
    expect(posts.at(-1)).toEqual({ path: '/admin/institutions/braude/login-rules', body: { provider: 'email', value: 'telhai.ac.il' } })
  })

  it('a Microsoft tenant id shows the consent link for the institution\'s IT manager', async () => {
    setup = { ...SETUP, rules: [{ id: 3, provider: 'microsoft', value: '11111111-2222-3333-4444-555555555555', approved: true }] }
    renderAdmin()
    const link = await screen.findByRole('link', { name: /קישור האישור/ })
    expect(link).toHaveAttribute('href', 'https://login.microsoftonline.com/11111111-2222-3333-4444-555555555555/adminconsent?client_id=client-123')
  })

  it('opens the institution to the public list', async () => {
    renderAdmin()
    await userEvent.click(await screen.findByRole('button', { name: 'להפעיל את המוסד' }))
    await waitFor(() => expect(posts.at(-1)).toEqual({ path: '/admin/institutions/braude', body: { is_active: true } }))
    expect(await screen.findByText(/המוסד פעיל/)).toBeInTheDocument()
  })

  it('on the shared demo campus the setup is shown, not changed', async () => {
    setup = { ...SETUP, locked: true }
    renderAdmin()
    expect(await screen.findByText(/בקמפוס ההדגמה אי אפשר לשנות/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'להפעיל את המוסד' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'הוספת סיומת' })).toBeDisabled()
  })

  it('removing a rule takes it off the screen', async () => {
    setup = { ...SETUP, rules: [{ id: 5, provider: 'email', value: 'old.ac.il', approved: true }] }
    renderAdmin()
    expect(await screen.findByText('old.ac.il')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'הסרה' }))
    await waitFor(() => expect(screen.queryByText('old.ac.il')).not.toBeInTheDocument())
  })

  it('Enter in the search does not send a search shorter than two letters', async () => {
    renderAdmin()
    await userEvent.click(await screen.findByRole('button', { name: 'הוספה' }))
    await userEvent.type(screen.getByLabelText('חיפוש מקום על המפה'), 'כ{Enter}')
    expect(screen.queryByRole('list', { name: 'תוצאות החיפוש' })).not.toBeInTheDocument()
    for (const alert of screen.queryAllByRole('alert')) expect(alert).toBeEmptyDOMElement()
    const geocodeCalls = (fetch as unknown as { mock: { calls: [string][] } }).mock.calls.filter(([u]) => u.includes('/geocode'))
    expect(geocodeCalls).toHaveLength(0)
  })

  it('placing a building on the map updates the setup steps', async () => {
    renderAdmin()
    await screen.findByRole('list', { name: 'צעדי ההקמה' })
    const setupCalls = () => (fetch as unknown as { mock: { calls: [string][] } }).mock.calls.filter(([u]) => u.endsWith('/setup')).length
    const before = setupCalls()
    await userEvent.click(screen.getByRole('button', { name: 'מיקום בניינים' }))
    await userEvent.click(await screen.findByRole('button', { name: /בניין NX/ }))
    await userEvent.click(screen.getByRole('button', { name: 'לחיצה על המפה' }))
    await waitFor(() => expect(setupCalls()).toBeGreaterThan(before))
  })
})
