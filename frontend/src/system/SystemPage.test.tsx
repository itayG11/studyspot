import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { resetSessionForTests } from '../api/client'
import type { Invite, PendingRule, SystemInstitution } from '../api/types'
import { AuthProvider } from '../auth/AuthContext'
import { InstitutionProvider } from '../institution'
import { INSTITUTION, jsonResponse } from '../test/fixtures'
import { ToastProvider } from '../ui'
import { SystemPage } from './SystemPage'

const OWNER = { id: 1, email: 'owner@gmail.com', display_name: 'בעלים', role: 'system_admin', institution_slug: 'demo', is_demo: false }
const BRAUDE: SystemInstitution = { slug: 'braude', name: 'מכללת בראודה', timezone: 'Asia/Jerusalem', is_active: false, buildings: 7, admins: 0 }
let institutions: SystemInstitution[]
let pending: PendingRule[]
let deletes: string[]
let posts: { path: string; body: unknown }[]
let invites: Invite[]

beforeEach(() => {
  resetSessionForTests()
  institutions = [BRAUDE]
  pending = [
    { id: 9, provider: 'email', value: 'telhai.ac.il', approved: false, institution_slug: 'tel-hai', institution_name: 'מכללת תל חי' },
    { id: 10, provider: 'microsoft', value: '11111111-2222-3333-4444-555555555555', approved: false, institution_slug: 'tel-hai', institution_name: 'מכללת תל חי' },
  ]
  deletes = []
  posts = []
  invites = [
    { id: 4, status: 'open', created_at: '2026-10-10T10:00:00Z', expires_at: '2026-10-17T10:00:00Z', used_at: null },
    { id: 3, status: 'used', created_at: '2026-10-01T10:00:00Z', expires_at: '2026-10-08T10:00:00Z', used_at: '2026-10-02T09:00:00Z' },
  ]
  vi.stubGlobal('fetch', vi.fn((url: string, init: RequestInit) => {
    const path = new URL(url).pathname
    const body = init.body ? JSON.parse(String(init.body)) : null
    if (init.method === 'POST' && !path.startsWith('/auth/')) posts.push({ path, body })
    if (path === '/auth/refresh') return Promise.resolve(jsonResponse({ access_token: 't', token_type: 'bearer', expires_in: 900, user: OWNER }))
    if (path === '/institutions/braude') return Promise.resolve(jsonResponse(INSTITUTION))
    if (path === '/system/institutions' && init.method === 'POST') {
      if (body.slug === 'scan') return Promise.resolve(jsonResponse({ detail: 'institution_slug_reserved' }, 422))
      const created = { ...body, is_active: false, buildings: 0, admins: 0 }
      institutions = [...institutions, created]
      return Promise.resolve(jsonResponse(created, 201))
    }
    if (path === '/system/institutions/kept' && init.method === 'DELETE')
      return Promise.resolve(jsonResponse({ detail: 'institution_has_rules' }, 409))
    if (path === '/system/institutions/braude' && init.method === 'DELETE') {
      deletes.push(path)
      institutions = institutions.filter((i) => i.slug !== 'braude')
      return Promise.resolve(new Response(null, { status: 204 }))
    }
    if (path === '/system/institutions/braude/close') {
      institutions = institutions.map((i) => ({ ...i, is_active: false, closes_at: '2026-11-01T08:00:00Z' }))
      return Promise.resolve(jsonResponse(institutions[0]))
    }
    if (path === '/system/institutions/braude/reopen') {
      institutions = institutions.map((i) => ({ ...i, closes_at: null }))
      return Promise.resolve(jsonResponse(institutions[0]))
    }
    if (path === '/system/login-rules') return Promise.resolve(jsonResponse(pending))
    if (path === '/system/login-rules/9/approve') {
      pending = pending.filter((r) => r.id !== 9)
      return Promise.resolve(jsonResponse({ id: 9, provider: 'email', value: 'telhai.ac.il', approved: true }))
    }
    if (path === '/admin/login-rules/10' && init.method === 'DELETE') {
      deletes.push(path)
      pending = pending.filter((r) => r.id !== 10)
      return Promise.resolve(new Response(null, { status: 204 }))
    }
    if (path === '/system/institutions') return Promise.resolve(jsonResponse(institutions))
    if (path === '/system/institutions/braude/invites' && (init.method ?? 'GET') === 'GET')
      return Promise.resolve(jsonResponse(invites))
    if (path === '/system/invites/4/revoke') {
      invites = invites.map((i) => (i.id === 4 ? { ...i, status: 'revoked' as const } : i))
      return Promise.resolve(jsonResponse(invites[0]))
    }
    if (path === '/system/institutions/braude/invites' && init.method === 'POST')
      return Promise.resolve(jsonResponse({ id: 4, token: 'tok-123', expires_at: '2026-10-17T10:00:00Z' }, 201))
    return Promise.resolve(jsonResponse({ detail: 'unknown' }, 404))
  }))
})

afterEach(() => {
  vi.unstubAllGlobals()
})

function renderPage() {
  const router = createMemoryRouter([{ path: '/system', Component: SystemPage }], { initialEntries: ['/system'] })
  render(
    <AuthProvider>
      <InstitutionProvider slug="braude">
        <ToastProvider><RouterProvider router={router} /></ToastProvider>
      </InstitutionProvider>
    </AuthProvider>,
  )
}

describe('SystemPage', () => {
  it('lists every institution, hidden ones too, with a link to manage each', async () => {
    renderPage()
    const row = (await screen.findByText('מכללת בראודה')).closest('li')!
    expect(within(row).getByText('מוסתר')).toBeInTheDocument()
    expect(within(row).getByRole('link', { name: 'לניהול המוסד' })).toHaveAttribute('href', '/braude/admin')
  })

  it('creates an institution, which then appears in the list', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.type(await screen.findByLabelText('שם המוסד'), 'מכללת תל חי')
    await user.type(screen.getByLabelText(/כתובת באתר/), 'tel-hai')
    await user.click(screen.getByRole('button', { name: 'יצירת מוסד' }))
    expect(posts[0]).toEqual({ path: '/system/institutions', body: { name: 'מכללת תל חי', slug: 'tel-hai', timezone: 'Asia/Jerusalem' } })
    expect(await screen.findByText('מכללת תל חי')).toBeInTheDocument()
  })

  it('says why a name is refused', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.type(await screen.findByLabelText('שם המוסד'), 'בדיקה')
    await user.type(screen.getByLabelText(/כתובת באתר/), 'scan')
    await user.click(screen.getByRole('button', { name: 'יצירת מוסד' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('שמורה לאתר עצמו')
  })

  it('shows a new invite link once, with the token after "#"', async () => {
    const user = userEvent.setup()
    renderPage()
    const row = (await screen.findByText('מכללת בראודה')).closest('li')!
    await user.click(within(row).getByRole('button', { name: 'קישור הזמנה למנהל' }))
    const link = await within(row).findByRole('textbox', { name: 'קישור ההזמנה' })
    expect((link as HTMLInputElement).value).toMatch(/\/invite#t=tok-123$/)
    expect(within(row).getByText(/תקף עד/)).toBeInTheDocument()
  })

  it('lists the invites sent, with their state, and revokes an open one after asking', async () => {
    const user = userEvent.setup()
    renderPage()
    const row = (await screen.findByText('מכללת בראודה')).closest('li')!
    const toggle = within(row).getByRole('button', { name: 'ההזמנות שנשלחו' })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    await user.click(toggle)
    const list = await within(row).findByRole('list', { name: 'ההזמנות של מכללת בראודה' })
    const open = within(list).getAllByRole('listitem')[0]
    expect(open).toHaveTextContent('פתוחה')
    expect(open).toHaveTextContent('תקפה עד')
    expect(within(list).getAllByRole('listitem')[1]).toHaveTextContent('נוצלה')
    expect(within(within(list).getAllByRole('listitem')[1]).queryByRole('button', { name: 'לבטל' })).not.toBeInTheDocument()
    await user.click(within(open).getByRole('button', { name: 'לבטל' }))
    await user.click(within(open).getByRole('button', { name: 'כן, לבטל' }))
    expect(posts.map((p) => p.path)).toContain('/system/invites/4/revoke')
    await waitFor(() => expect(within(list).getAllByRole('listitem')[0]).toHaveTextContent('בוטלה'))
  })

  it('lists the login rules waiting for approval, with their institution', async () => {
    renderPage()
    const list = await screen.findByRole('list', { name: 'כללי כניסה שממתינים לאישור' })
    const items = within(list).getAllByRole('listitem')
    expect(items).toHaveLength(2)
    expect(items[0]).toHaveTextContent('מכללת תל חי')
    expect(items[0]).toHaveTextContent('סיומת מייל')
    expect(items[0]).toHaveTextContent('telhai.ac.il')
    expect(items[1]).toHaveTextContent('ארגון מיקרוסופט')
  })

  it('approving a rule takes it off the list', async () => {
    const user = userEvent.setup()
    renderPage()
    const list = await screen.findByRole('list', { name: 'כללי כניסה שממתינים לאישור' })
    const first = within(list).getAllByRole('listitem')[0]
    await user.click(within(first).getByRole('button', { name: 'אישור' }))
    expect(posts.some((p) => p.path === '/system/login-rules/9/approve')).toBe(true)
    await screen.findByText('11111111-2222-3333-4444-555555555555')
    expect(screen.queryByText('telhai.ac.il')).not.toBeInTheDocument()
  })

  it('refusing a rule removes it', async () => {
    const user = userEvent.setup()
    renderPage()
    const list = await screen.findByRole('list', { name: 'כללי כניסה שממתינים לאישור' })
    const second = within(list).getAllByRole('listitem')[1]
    await user.click(within(second).getByRole('button', { name: 'דחייה' }))
    expect(deletes).toEqual([]) // one press only asks: a misclick deletes nothing
    await user.click(within(second).getByRole('button', { name: 'כן, לדחות' }))
    expect(deletes).toEqual(['/admin/login-rules/10'])
    await screen.findByText('telhai.ac.il')
    expect(screen.queryByText('11111111-2222-3333-4444-555555555555')).not.toBeInTheDocument()
  })

  it('says when nothing waits for approval', async () => {
    pending = []
    renderPage()
    expect(await screen.findByText(/^אין מה לאשר כרגע/)).toBeInTheDocument()
  })

  it('explains in plain words what a sign-in rule is, and why it waits for the system admin', async () => {
    pending = []
    renderPage()
    expect(await screen.findByText(/כלל כניסה אומר מי שייך למוסד/)).toHaveTextContent('@e.braude.ac.il')
    expect(screen.getByText(/למה צריך את האישור שלך/)).toHaveTextContent('ולקחת אליו את הסטודנטים שלה')
  })

  it('deletes a hidden institution only after its address is typed', async () => {
    const user = userEvent.setup()
    renderPage()
    const row = (await screen.findByText('מכללת בראודה')).closest('li')!
    await user.click(within(row).getByRole('button', { name: 'מחיקת המוסד' }))
    const sure = within(row).getByRole('button', { name: 'למחוק לצמיתות' })
    expect(sure).toBeDisabled()
    await user.type(within(row).getByLabelText(/כדי למחוק/), 'braud')
    expect(sure).toBeDisabled()
    await user.type(within(row).getByLabelText(/כדי למחוק/), 'e')
    await user.click(sure)
    expect(deletes).toEqual(['/system/institutions/braude'])
    await waitFor(() => expect(screen.queryByText('מכללת בראודה')).not.toBeInTheDocument())
  })

  it('an open institution offers no delete', async () => {
    institutions = [{ ...BRAUDE, is_active: true }]
    renderPage()
    const row = (await screen.findByText('מכללת בראודה')).closest('li')!
    expect(within(row).queryByRole('button', { name: 'מחיקת המוסד' })).not.toBeInTheDocument()
  })

  it('says why the server keeps an institution', async () => {
    const user = userEvent.setup()
    institutions = [{ ...BRAUDE, slug: 'kept', name: 'מוסד עם סטודנטים' }]
    renderPage()
    const row = (await screen.findByText('מוסד עם סטודנטים')).closest('li')!
    await user.click(within(row).getByRole('button', { name: 'מחיקת המוסד' }))
    await user.type(within(row).getByLabelText(/כדי למחוק/), 'kept')
    await user.click(within(row).getByRole('button', { name: 'למחוק לצמיתות' }))
    expect(await within(row).findByRole('alert')).toHaveTextContent('כלל כניסה מאושר')
  })

  it('closes an institution only after its address is typed, and says when it goes', async () => {
    const user = userEvent.setup()
    institutions = [{ ...BRAUDE, is_active: true }]
    renderPage()
    const row = (await screen.findByText('מכללת בראודה')).closest('li')!
    await user.click(within(row).getByRole('button', { name: 'לסגור את המוסד' }))
    expect(within(row).getByText(/אחרי 14 יום יימחקו/)).toBeInTheDocument()
    const sure = within(row).getByRole('button', { name: 'לסגור, ולמחוק בעוד 14 יום' })
    expect(sure).toBeDisabled()
    await user.type(within(row).getByLabelText(/כדי לסגור/), 'braude')
    await user.click(sure)
    expect(posts.map((p) => p.path)).toContain('/system/institutions/braude/close')
    expect(await within(row).findByText(/נסגר, יימחק ב-/)).toHaveTextContent('01/11')
    expect(within(row).queryByRole('button', { name: 'מחיקת המוסד' })).not.toBeInTheDocument()
  })

  it('takes a closing back, after asking once more', async () => {
    const user = userEvent.setup()
    institutions = [{ ...BRAUDE, closes_at: '2026-11-01T08:00:00Z' }]
    renderPage()
    const row = (await screen.findByText('מכללת בראודה')).closest('li')!
    await user.click(within(row).getByRole('button', { name: 'לבטל את הסגירה' }))
    await user.click(within(row).getByRole('button', { name: 'כן, לבטל את הסגירה' }))
    expect(posts.map((p) => p.path)).toContain('/system/institutions/braude/reopen')
    expect(await within(row).findByText('מוסתר')).toBeInTheDocument()
  })
})
