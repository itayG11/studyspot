import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { describe, expect, it } from 'vitest'
import { SiteFooter } from './SiteFooter'

describe('SiteFooter', () => {
  it('links to privacy, accessibility and licenses', () => {
    render(<MemoryRouter><SiteFooter /></MemoryRouter>)
    const footer = screen.getByRole('contentinfo')
    expect(footer).toBeInTheDocument()
    for (const [name, href] of [['פרטיות', '/privacy'], ['הצהרת נגישות', '/accessibility'], ['רישיונות', '/licenses']]) {
      expect(screen.getByRole('link', { name })).toHaveAttribute('href', href)
    }
  })
})
