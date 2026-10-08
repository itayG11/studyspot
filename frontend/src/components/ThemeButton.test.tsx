import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import { THEME_KEY } from '../logic/theme'
import { ThemeButton } from './ThemeButton'

afterEach(() => {
  localStorage.clear()
  delete document.documentElement.dataset.theme
})

describe('ThemeButton', () => {
  it('says what is on now, and steps to the next choice', async () => {
    render(<ThemeButton />)
    const button = screen.getByRole('button', { name: 'ערכת צבעים: כמו המכשיר. לחיצה: בהיר' })
    await userEvent.click(button)
    expect(document.documentElement.dataset.theme).toBe('light')
    expect(localStorage.getItem(THEME_KEY)).toBe('light')
    expect(screen.getByRole('button', { name: 'ערכת צבעים: בהיר. לחיצה: כהה' })).toBeInTheDocument()
    await userEvent.click(button)
    expect(document.documentElement.dataset.theme).toBe('dark')
    await userEvent.click(button)
    expect(document.documentElement.dataset.theme).toBeUndefined()
    expect(localStorage.getItem(THEME_KEY)).toBeNull()
  })

  it('starts from the choice remembered on this device', () => {
    localStorage.setItem(THEME_KEY, 'dark')
    render(<ThemeButton />)
    expect(screen.getByRole('button', { name: /ערכת צבעים: כהה/ })).toBeInTheDocument()
  })
})
