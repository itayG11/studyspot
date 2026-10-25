import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { jsonResponse } from '../test/fixtures'
import { InstitutionsPage } from './InstitutionsPage'

const auth: { user: { institution_slug: string } | null } = { user: null }
vi.mock('../auth/AuthContext', () => ({ useAuth: () => auth }))

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(jsonResponse([
    { slug: 'demo', name: 'קמפוס הדגמה', buildings_count: 7, places_count: 10, is_demo: true },
    { slug: 'braude', name: 'מכללת בראודה', buildings_count: 1, places_count: 1, is_demo: false },
  ]))))
})
afterEach(() => {
  vi.unstubAllGlobals()
  auth.user = null
})

const showList = () =>
  render(
    <MemoryRouter initialEntries={['/institutions']}>
      <Routes>
        <Route path="/institutions" element={<InstitutionsPage />} />
        <Route path="/demo" element={<p>קמפוס ההדגמה עצמו</p>} />
        <Route path="/braude" element={<p>בראודה עצמה</p>} />
      </Routes>
    </MemoryRouter>,
  )

describe('InstitutionsPage', () => {
  it('shows a card per institution, with its buildings and places, that leads to it', async () => {
    render(<MemoryRouter><InstitutionsPage /></MemoryRouter>)
    const demo = (await screen.findByRole('link', { name: /קמפוס הדגמה/ })).closest('li')!
    expect(within(demo).getByText('7 בניינים · 10 מקומות לימוד')).toBeInTheDocument()
    expect(within(demo).getByText('קמפוס לדוגמה')).toBeInTheDocument()
    expect(within(demo).getByRole('link')).toHaveAttribute('href', '/demo')
    const braude = screen.getByRole('link', { name: /מכללת בראודה/ }).closest('li')!
    expect(within(braude).getByText('בניין אחד · מקום לימוד אחד')).toBeInTheDocument()
    expect(within(braude).queryByText('קמפוס לדוגמה')).not.toBeInTheDocument()
  })

  it('a guest opens any institution straight away', async () => {
    showList()
    await userEvent.click(await screen.findByRole('link', { name: /מכללת בראודה/ }))
    expect(await screen.findByText('בראודה עצמה')).toBeInTheDocument()
  })

  it('signed in: marks their own, opens it straight, and asks before another one', async () => {
    auth.user = { institution_slug: 'demo' }
    showList()
    const demo = (await screen.findByRole('link', { name: /קמפוס הדגמה/ })).closest('li')!
    expect(within(demo).getByText('המוסד שלך')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('link', { name: /מכללת בראודה/ }))
    const ask = await screen.findByRole('dialog', { name: 'לעבור לקמפוס של מכללת בראודה?' })
    expect(within(ask).getByText(/החשבון שלך שייך לקמפוס הדגמה/)).toHaveTextContent('לא להזמין ולא להיכנס למקום')
    await userEvent.click(within(ask).getByRole('button', { name: 'להישאר' }))
    expect(screen.getByRole('heading', { name: 'מוסדות' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('link', { name: /מכללת בראודה/ }))
    await userEvent.click(within(await screen.findByRole('dialog')).getByRole('link', { name: 'לעבור ולצפות' }))
    expect(await screen.findByText('בראודה עצמה')).toBeInTheDocument()
  })

  it('their own institution opens with no question', async () => {
    auth.user = { institution_slug: 'demo' }
    showList()
    await userEvent.click(await screen.findByRole('link', { name: /קמפוס הדגמה/ }))
    expect(await screen.findByText('קמפוס ההדגמה עצמו')).toBeInTheDocument()
  })
})
