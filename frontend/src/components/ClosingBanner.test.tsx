import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { describe, expect, it, vi } from 'vitest'
import { ClosingBanner } from './ClosingBanner'

vi.mock('../institution', () => ({
  useInstitution: () => ({ slug: 'braude', name: 'מכללת בראודה', timezone: 'Asia/Jerusalem' }),
}))

describe('ClosingBanner', () => {
  it('says when it all goes, in the institution time, and how to delete now', () => {
    render(
      <MemoryRouter>
        <ClosingBanner closesAt="2026-10-31T23:30:00Z" />
      </MemoryRouter>,
    )
    const banner = screen.getByRole('note', { name: 'המוסד נסגר' })
    expect(banner).toHaveTextContent('מכללת בראודה נסגר ב-StudySpot.')
    expect(banner).toHaveTextContent('01/11') // 01:30 on 1 November in Israel
    expect(screen.getByRole('link', { name: 'אפשר למחוק את החשבון כבר עכשיו' })).toHaveAttribute('href', '/braude/me')
  })
})
