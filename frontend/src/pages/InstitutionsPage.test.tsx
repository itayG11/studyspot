import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { jsonResponse } from '../test/fixtures'
import { InstitutionsPage } from './InstitutionsPage'

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(jsonResponse([
    { slug: 'demo', name: 'קמפוס הדגמה', buildings_count: 7, places_count: 10, is_demo: true },
    { slug: 'braude', name: 'מכללת בראודה', buildings_count: 1, places_count: 1, is_demo: false },
  ]))))
})
afterEach(() => vi.unstubAllGlobals())

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
})
