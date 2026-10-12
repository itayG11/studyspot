import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { describe, expect, it } from 'vitest'
import { PrivacyPage } from './PrivacyPage'

describe('PrivacyPage', () => {
  it('says what is kept, what is not, and how to delete it', () => {
    render(<MemoryRouter><PrivacyPage /></MemoryRouter>)
    expect(screen.getByRole('heading', { level: 1, name: 'מדיניות הפרטיות' })).toBeInTheDocument()
    for (const heading of ['מה נשמר', 'מה לא נשמר', 'מחיקת החשבון']) {
      expect(screen.getByRole('heading', { name: heading })).toBeInTheDocument()
    }
    expect(screen.getByRole('link', { name: 'האזור שלי' })).toHaveAttribute('href', '/me')
  })

  it('says a timetable photo goes abroad, and to crop the name and ID number out first', () => {
    // A screenshot of the timetable often shows both.
    render(<MemoryRouter><PrivacyPage /></MemoryRouter>)
    expect(screen.getByText(/Anthropic.*בארצות הברית/)).toBeInTheDocument()
    expect(screen.getByText(/לחתוך.*תעודת הזהות/)).toBeInTheDocument()
  })

  it('says how long things are kept, and that the server log has no addresses or queries', () => {
    render(<MemoryRouter><PrivacyPage /></MemoryRouter>)
    expect(screen.getByRole('heading', { name: 'כמה זמן נשמר' })).toBeInTheDocument()
    expect(screen.getByText(/השרת שלנו רושם.*בלי כתובת ה-IP/)).toBeInTheDocument()
  })

  it('says how to reach us: an issue on the project page, not an e-mail address', () => {
    render(<MemoryRouter><PrivacyPage /></MemoryRouter>)
    expect(screen.getByRole('heading', { name: 'איך פונים' })).toBeInTheDocument()
    const link = screen.getByRole('link', { name: /פנייה בדף הפרויקט/ })
    expect(link).toHaveAttribute('href', 'https://github.com/itayG11/studyspot/issues')
    expect(link).toHaveAttribute('rel', expect.stringContaining('noopener'))
  })
})
