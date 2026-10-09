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
  PickMap: ({ onPick }: { onPick: (lat: number, lng: number) => void }) => (
    <button type="button" onClick={() => onPick(32.914579123, 35.280014987)}>
      לחיצה על המפה
    </button>
  ),
}))

const SIG = 'A'.repeat(43)
const INSTITUTION = {
  slug: 'braude', name: 'מכללת בראודה', timezone: 'Asia/Jerusalem',
  booking_rules: { slot_minutes: 15, max_minutes: 120, days_ahead: 4, horizon_minutes: 5760, max_upcoming: 2, arrive_early_minutes: 10, no_show_after_minutes: 15 },
}

let role = 'institution_admin'
let posts: { path: string; body: unknown }[]

beforeEach(() => {
  resetSessionForTests()
  role = 'institution_admin'
  posts = []
  vi.stubGlobal('fetch', vi.fn((url: string, init: RequestInit) => {
    const path = new URL(url).pathname
    if (init.method === 'POST' && path !== '/auth/refresh') posts.push({ path, body: init.body ? JSON.parse(String(init.body)) : null })
    if (path === '/auth/refresh') {
      const user = { id: 2, email: 'demo.admin@studyspot.invalid', display_name: 'מנהל לדוגמה', role, institution_slug: 'braude' }
      return Promise.resolve(jsonResponse({ access_token: 't', token_type: 'bearer', expires_in: 900, user }))
    }
    if (path === '/institutions/braude') return Promise.resolve(jsonResponse(INSTITUTION))
    if (path === '/institutions/braude/buildings')
      return Promise.resolve(jsonResponse([building(), building({ id: 6, code: 'NX', latitude: null, longitude: null, places_count: 0, capacity: 0, available: 0, occupied: 0 })]))
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
    const sign = await screen.findByRole('listitem', { name: /מתחם לימוד/ })
    const qr = await within(sign).findByRole('img', { name: /קוד QR/ })
    expect(qr.getAttribute('src')).toMatch(/^data:image\/svg\+xml/)
  })

  it('revokes a code after asking, and shows the new one', async () => {
    renderAdmin()
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

  it('adds a building, then offers to place it on the map', async () => {
    renderAdmin()
    await userEvent.click(await screen.findByRole('button', { name: 'הוספה' }))
    await userEvent.type(screen.getByLabelText('קוד הבניין'), 'zz')
    await userEvent.clear(screen.getByLabelText('מספר קומות'))
    await userEvent.type(screen.getByLabelText('מספר קומות'), '3')
    await userEvent.click(screen.getByRole('button', { name: 'הוספת בניין' }))
    await waitFor(() => expect(posts.map((p) => p.path)).toContain('/admin/institutions/braude/buildings'))
    expect(posts.find((p) => p.path === '/admin/institutions/braude/buildings')!.body).toEqual({ code: 'ZZ', floors_count: 3 })
    expect(await screen.findByText(/בניין ZZ נוסף/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'למיקום על המפה' }))
    expect(await screen.findByRole('button', { name: 'מיקום בניינים' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('says so in Hebrew when the building code is taken', async () => {
    renderAdmin()
    await userEvent.click(await screen.findByRole('button', { name: 'הוספה' }))
    await userEvent.type(screen.getByLabelText('קוד הבניין'), 'M')
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
})
