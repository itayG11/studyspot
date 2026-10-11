import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { describe, expect, it } from 'vitest'
import { AccessibilityPage } from './AccessibilityPage'
import { LicensesPage } from './LicensesPage'

describe('AccessibilityPage', () => {
  it('says the level aimed for, what was checked, what is known to be missing, and how to report', () => {
    render(<MemoryRouter><AccessibilityPage /></MemoryRouter>)
    expect(screen.getByRole('heading', { level: 1, name: 'הצהרת נגישות' })).toBeInTheDocument()
    for (const heading of ['מה נבדק', 'מגבלות ידועות', 'פנייה בנושא נגישות']) {
      expect(screen.getByRole('heading', { name: heading })).toBeInTheDocument()
    }
    expect(screen.getByText(/WCAG 2.1/)).toBeInTheDocument()
  })
})

describe('LicensesPage', () => {
  it('lists the fonts, icons and libraries, each with its license', () => {
    render(<MemoryRouter><LicensesPage /></MemoryRouter>)
    expect(screen.getByRole('heading', { level: 1, name: 'רישיונות' })).toBeInTheDocument()
    for (const name of ['React', 'Leaflet', 'Lucide', 'IBM Plex Sans Hebrew', 'FastAPI', 'OpenStreetMap']) {
      expect(screen.getAllByText(new RegExp(name)).length).toBeGreaterThan(0)
    }
    expect(screen.getAllByText('OFL-1.1').length).toBeGreaterThan(0)
  })
})
