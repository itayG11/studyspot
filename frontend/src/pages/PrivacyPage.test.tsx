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
})
