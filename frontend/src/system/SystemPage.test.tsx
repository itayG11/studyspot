import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { resetSessionForTests } from '../api/client'
import type { SystemInstitution } from '../api/types'
import { AuthProvider } from '../auth/AuthContext'
import { InstitutionProvider } from '../institution'
import { INSTITUTION, jsonResponse } from '../test/fixtures'
import { ToastProvider } from '../ui'
import { SystemPage } from './SystemPage'

const OWNER = { id: 1, email: 'owner@gmail.com', display_name: 'בעלים', role: 'system_admin', institution_slug: 'demo', is_demo: false }
const BRAUDE: SystemInstitution = { slug: 'braude', name: 'מכללת בראודה', timezone: 'Asia/Jerusalem', is_active: false, buildings: 7, admins: 0 }
let institutions: SystemInstitution[]
let posts: { path: string; body: unknown }[]

beforeEach(() => {
  resetSessionForTests()
  institutions = [BRAUDE]
  posts = []
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
    if (path === '/system/institutions') return Promise.resolve(jsonResponse(institutions))
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
})
