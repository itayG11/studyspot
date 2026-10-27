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

  it('lists the three cookies, all for signing in, and says there are no others', () => {
    render(<MemoryRouter><PrivacyPage /></MemoryRouter>)
    expect(screen.getByRole('heading', { name: 'עוגיות' })).toBeInTheDocument()
    expect(screen.getByText('studyspot_refresh')).toBeInTheDocument()
    expect(screen.getByText('studyspot_login')).toBeInTheDocument()
    expect(screen.getByText('studyspot_email_code')).toBeInTheDocument()
    expect(screen.getByText(/אין עוגיות של פרסום/)).toBeInTheDocument()
  })

  it('says what the email service records, and why the code email is plain text', () => {
    // Brevo adds a hidden image to the email and logs when it is opened:
    // tracking, which the page must not hide behind "no tracking tools".
    render(<MemoryRouter><PrivacyPage /></MemoryRouter>)
    expect(screen.getByText(/Brevo.*שומר יומן/)).toBeInTheDocument()
    expect(screen.getByText(/מתי המייל נפתח.*כטקסט בלבד/)).toBeInTheDocument()
    expect(screen.getByText(/אין כלי מעקב באתר/)).toBeInTheDocument()
  })

  it('says how long things are kept, and that the server log has no addresses or queries', () => {
    render(<MemoryRouter><PrivacyPage /></MemoryRouter>)
    expect(screen.getByRole('heading', { name: 'כמה זמן נשמר' })).toBeInTheDocument()
    expect(screen.getByText(/השרת שלנו רושם.*בלי כתובת ה-IP/)).toBeInTheDocument()
  })

  it('says crashes are reported to Sentry, what is sent, and what is not', () => {
    // Error reports are not tracking, but they leave the server: the page says so.
    render(<MemoryRouter><PrivacyPage /></MemoryRouter>)
    const item = screen.getByText(/דיווח על תקלות:/).closest('li') as HTMLElement
    expect(item).toHaveTextContent('Sentry')
    expect(item).toHaveTextContent('סוג התקלה והמקום בקוד')
    expect(item).toHaveTextContent('לא נשלחים כתובת מייל, שם, עוגיות')
    expect(item).toHaveTextContent('לא נשלחת כתובת ה-IP')
  })

  it('says who joins the demo campus, that anyone can manage it, and that it resets daily', () => {
    render(<MemoryRouter><PrivacyPage /></MemoryRouter>)
    const section = screen.getByRole('heading', { name: 'קמפוס ההדגמה' }).nextElementSibling as HTMLElement
    expect(section).toHaveTextContent('חשבון גוגל שלא שייך לאף מוסד')
    expect(section).toHaveTextContent('לא רואה שמות, כתובות מייל או הזמנות')
    expect(section).toHaveTextContent('מתאפס כל יום')
  })

  it('says how to reach us: an issue on the project page, not an e-mail address', () => {
    render(<MemoryRouter><PrivacyPage /></MemoryRouter>)
    expect(screen.getByRole('heading', { name: 'איך פונים' })).toBeInTheDocument()
    const link = screen.getByRole('link', { name: /פנייה בדף הפרויקט/ })
    expect(link).toHaveAttribute('href', 'https://github.com/itayG11/studyspot/issues')
    expect(link).toHaveAttribute('rel', expect.stringContaining('noopener'))
  })
})
