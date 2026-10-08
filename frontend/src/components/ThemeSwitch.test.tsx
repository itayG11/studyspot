import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { THEME_KEY } from '../logic/theme'
import { ThemeSwitch } from './ThemeSwitch'

// The device's own setting, as matchMedia reports it (jsdom has none).
function deviceIsDark(dark: boolean) {
  const listeners = new Set<() => void>()
  const query = {
    get matches() {
      return dark
    },
    addEventListener: (_: string, listener: () => void) => listeners.add(listener),
    removeEventListener: (_: string, listener: () => void) => listeners.delete(listener),
  }
  vi.stubGlobal('matchMedia', () => query)
  return (next: boolean) => {
    dark = next
    listeners.forEach((listener) => listener())
  }
}

afterEach(() => {
  vi.unstubAllGlobals()
  localStorage.clear()
  delete document.documentElement.dataset.theme
})

describe('ThemeSwitch', () => {
  it('starts as the device shows it', () => {
    deviceIsDark(true)
    render(<ThemeSwitch />)
    expect(screen.getByRole('switch', { name: 'מצב כהה' })).toBeChecked()
  })

  it('a press flips what is shown, and the choice is remembered', async () => {
    deviceIsDark(false)
    render(<ThemeSwitch />)
    const toggle = screen.getByRole('switch', { name: 'מצב כהה' })
    expect(toggle).not.toBeChecked()
    await userEvent.click(toggle)
    expect(toggle).toBeChecked()
    expect(document.documentElement.dataset.theme).toBe('dark')
    expect(localStorage.getItem(THEME_KEY)).toBe('dark')
  })

  it('flipping back to what the device shows follows the device again', async () => {
    deviceIsDark(false)
    localStorage.setItem(THEME_KEY, 'dark')
    render(<ThemeSwitch />)
    const toggle = screen.getByRole('switch', { name: 'מצב כהה' })
    expect(toggle).toBeChecked()
    await userEvent.click(toggle)
    expect(toggle).not.toBeChecked()
    expect(document.documentElement.dataset.theme).toBeUndefined()
    expect(localStorage.getItem(THEME_KEY)).toBeNull()
  })

  it('follows the device when it changes, while there is no choice', () => {
    const setDevice = deviceIsDark(false)
    render(<ThemeSwitch />)
    act(() => setDevice(true))
    expect(screen.getByRole('switch', { name: 'מצב כהה' })).toBeChecked()
  })

  it('works where the browser cannot report the device setting', () => {
    vi.stubGlobal('matchMedia', undefined)
    render(<ThemeSwitch />)
    expect(screen.getByRole('switch', { name: 'מצב כהה' })).not.toBeChecked()
  })
})
