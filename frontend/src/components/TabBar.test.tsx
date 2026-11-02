import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { TabBar } from './TabBar'

const auth: { status: 'signed-in' | 'signed-out' } = { status: 'signed-out' }
vi.mock('../auth/AuthContext', () => ({ useAuth: () => auth }))

afterEach(() => {
  auth.status = 'signed-out'
})

const show = (at = '/demo') =>
  render(
    <MemoryRouter initialEntries={[at]}>
      <TabBar home="/demo" />
    </MemoryRouter>,
  )

describe('TabBar', () => {
  it('leads a guest to the search, the map, the institutions and sign-in, all pages that exist', () => {
    show()
    const bar = screen.getByRole('navigation', { name: 'ניווט מהיר' })
    const links = Array.from(bar.querySelectorAll('a')).map((a) => [a.textContent, a.getAttribute('href')])
    expect(links).toEqual([
      ['חיפוש', '/demo'],
      ['מפה', '/demo?view=map'],
      ['מוסדות', '/institutions'],
      ['כניסה', '/login'],
    ])
    expect(screen.getByRole('link', { name: 'חיפוש' })).toHaveAttribute('aria-current', 'page')
  })

  it('leads a signed-in student to their bookings and their area', () => {
    auth.status = 'signed-in'
    show('/me')
    expect(screen.getByRole('link', { name: 'ההזמנות' })).toHaveAttribute('href', '/me#my-bookings')
    expect(screen.getByRole('link', { name: 'שלי' })).toHaveAttribute('aria-current', 'page')
  })

  it('marks the map tab while the map is shown', () => {
    show('/demo?view=map')
    expect(screen.getByRole('link', { name: 'מפה' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', { name: 'חיפוש' })).not.toHaveAttribute('aria-current')
  })
})
