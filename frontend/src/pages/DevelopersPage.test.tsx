import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { DevelopersPage } from './DevelopersPage'

describe('DevelopersPage', () => {
  it('shows how to send the key, the endpoints, and where the full description is', () => {
    render(<DevelopersPage />)
    expect(screen.getByRole('heading', { level: 1, name: /למפתחים/ })).toBeInTheDocument()
    expect(screen.getAllByText(/Authorization: Bearer/).length).toBeGreaterThan(0)
    expect(screen.getByText('GET /v1/places')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '/api/v1/openapi.json' }).getAttribute('href')).toMatch(/\/v1\/openapi\.json$/)
  })
})
