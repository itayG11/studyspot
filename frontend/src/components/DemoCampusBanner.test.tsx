import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DemoCampusBanner } from './DemoCampusBanner'

type User = { institution_slug: string; is_demo: boolean }
const auth: { user: User | null } = { user: null }
const here = { slug: 'demo', name: 'קמפוס הדגמה', live_simulated: true }
vi.mock('../auth/AuthContext', () => ({ useAuth: () => auth }))
vi.mock('../institution', () => ({ useInstitution: () => here }))

afterEach(() => {
  auth.user = null
  Object.assign(here, { slug: 'demo', live_simulated: true })
})

const show = () => render(<MemoryRouter><DemoCampusBanner /></MemoryRouter>)

describe('DemoCampusBanner', () => {
  it('tells a real person in the demo campus where they are, with a link to the privacy page', () => {
    auth.user = { institution_slug: 'demo', is_demo: false }
    show()
    const note = screen.getByRole('note', { name: 'קמפוס ההדגמה' })
    expect(note).toHaveTextContent('זה קמפוס ההדגמה.')
    expect(note).toHaveTextContent('כל יום הוא חוזר להתחלה')
    expect(screen.getByRole('link', { name: 'מה זה אומר' })).toHaveAttribute('href', '/privacy')
  })

  it('says nothing to the shared demo users, to a guest, or in a real campus', () => {
    auth.user = { institution_slug: 'demo', is_demo: true }
    const first = show()
    expect(screen.queryByRole('note')).not.toBeInTheDocument()
    first.unmount()
    auth.user = null
    const second = show()
    expect(screen.queryByRole('note')).not.toBeInTheDocument()
    second.unmount()
    auth.user = { institution_slug: 'braude', is_demo: false }
    Object.assign(here, { slug: 'braude', live_simulated: false })
    show()
    expect(screen.queryByRole('note')).not.toBeInTheDocument()
  })
})
