import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { afterEach, describe, expect, it } from 'vitest'
import { COOKIE_NOTE_KEY } from '../logic/cookieNote'
import { CookieNote } from './CookieNote'

const show = () =>
  render(
    <MemoryRouter>
      <CookieNote />
    </MemoryRouter>,
  )

afterEach(() => localStorage.clear())

describe('CookieNote', () => {
  it('says which cookies there are, and links to the privacy page', () => {
    show()
    expect(screen.getByRole('region', { name: /עוגיות באתר/ })).toBeInTheDocument()
    expect(screen.getByText(/שנחוצות להתחברות/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'מדיניות הפרטיות' })).toHaveAttribute('href', '/privacy')
  })

  it('goes away on "got it", and does not come back', async () => {
    const first = show()
    await userEvent.click(screen.getByRole('button', { name: 'הבנתי' }))
    expect(screen.queryByRole('region', { name: /עוגיות באתר/ })).not.toBeInTheDocument()
    expect(localStorage.getItem(COOKIE_NOTE_KEY)).toBe('1')
    first.unmount()
    show()
    expect(screen.queryByRole('region', { name: /עוגיות באתר/ })).not.toBeInTheDocument()
  })
})
