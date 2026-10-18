// An error that says "sign in again" or "scan the code" comes with the way there.

import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { describe, expect, it } from 'vitest'
import { errorLink } from '../i18n/errors'
import { ErrorAction } from './ErrorAction'

describe('errorLink', () => {
  it('a session that ended leads to signing in, and back to this page', () => {
    expect(errorLink('token_expired', '/demo/spaces/3')).toEqual({ to: '/login?next=%2Fdemo%2Fspaces%2F3', label: 'להתחברות' })
  })

  it('a place not booked ahead leads to scanning; too many bookings to my bookings', () => {
    expect(errorLink('not_bookable', '/x')?.to).toBe('/scan')
    expect(errorLink('too_many_bookings', '/x')?.to).toBe('/me#my-bookings')
  })

  it('most errors need no link', () => {
    expect(errorLink('slot_taken', '/x')).toBeNull()
  })
})

describe('ErrorAction', () => {
  it('is a link with its label', () => {
    render(
      <MemoryRouter initialEntries={['/demo/spaces/3']}>
        <ErrorAction code="not_authenticated" />
      </MemoryRouter>,
    )
    expect(screen.getByRole('link', { name: 'להתחברות' })).toHaveAttribute('href', '/login?next=%2Fdemo%2Fspaces%2F3')
  })

  it('nothing for an error without one', () => {
    const { container } = render(
      <MemoryRouter>
        <ErrorAction code="slot_taken" />
      </MemoryRouter>,
    )
    expect(container).toBeEmptyDOMElement()
  })
})
