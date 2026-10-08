import { afterEach, describe, expect, it, vi } from 'vitest'
import { applyTheme, nextTheme, readTheme, saveTheme, THEME_KEY } from './theme'

afterEach(() => {
  localStorage.clear()
  delete document.documentElement.dataset.theme
  vi.restoreAllMocks()
})

describe('theme choice', () => {
  it('is "like the device" until the visitor chooses', () => {
    expect(readTheme()).toBe('system')
  })

  it('remembers a choice, and ignores a broken stored value', () => {
    saveTheme('dark')
    expect(readTheme()).toBe('dark')
    localStorage.setItem(THEME_KEY, 'purple')
    expect(readTheme()).toBe('system')
  })

  it('still works when storage is blocked (private mode)', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    expect(readTheme()).toBe('system')
    expect(() => saveTheme('dark')).not.toThrow()
  })

  it('a choice marks the page; "like the device" leaves it to the device', () => {
    applyTheme('dark')
    expect(document.documentElement.dataset.theme).toBe('dark')
    applyTheme('light')
    expect(document.documentElement.dataset.theme).toBe('light')
    applyTheme('system')
    expect(document.documentElement.dataset.theme).toBeUndefined()
  })

  it('the button goes round: like the device, light, dark', () => {
    expect(nextTheme('system')).toBe('light')
    expect(nextTheme('light')).toBe('dark')
    expect(nextTheme('dark')).toBe('system')
  })
})
