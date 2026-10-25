import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { jsonResponse } from '../test/fixtures'
import { VisitingBanner } from './VisitingBanner'

const auth: { user: { institution_slug: string; role: string } | null } = { user: null }
vi.mock('../auth/AuthContext', () => ({ useAuth: () => auth }))
vi.mock('../institution', () => ({ useInstitution: () => ({ slug: 'braude', name: 'מכללת בראודה' }) }))

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(jsonResponse({ slug: 'demo', name: 'קמפוס הדגמה' }))))
})
afterEach(() => {
  vi.unstubAllGlobals()
  auth.user = null
})

const show = () => render(<MemoryRouter><VisitingBanner /></MemoryRouter>)

describe('VisitingBanner', () => {
  it('on another institution: only looking here, and a way back home', async () => {
    auth.user = { institution_slug: 'demo', role: 'student' }
    show()
    const note = screen.getByRole('note', { name: 'קמפוס של מוסד אחר' })
    expect(note).toHaveTextContent('אתה צופה בקמפוס של מכללת בראודה.')
    expect(await screen.findByRole('link', { name: 'חזרה לקמפוס הדגמה' })).toHaveAttribute('href', '/demo')
    expect(note).toHaveTextContent('לא להזמין, ולא להיכנס למקום')
  })

  it('at home, or signed out: nothing', () => {
    auth.user = { institution_slug: 'braude', role: 'student' }
    const { unmount } = show()
    expect(screen.queryByRole('note')).not.toBeInTheDocument()
    unmount()
    auth.user = null
    show()
    expect(screen.queryByRole('note')).not.toBeInTheDocument()
  })
})
