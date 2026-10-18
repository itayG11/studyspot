import { afterEach, describe, expect, it, vi } from 'vitest'
import { applyTheme, flipTheme, shownDark, readTheme, saveTheme, THEME_KEY } from './theme'

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

  it("the browser bar's colour follows the choice, and the device again after", () => {
    document.head.innerHTML =
      '<meta name="theme-color" content="#f5f2eb" media="(prefers-color-scheme: light)">' +
      '<meta name="theme-color" content="#131823" media="(prefers-color-scheme: dark)">'
    const colours = () => [...document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')].map((m) => m.content)
    applyTheme('dark')
    expect(colours()).toEqual(['#131823', '#131823'])
    applyTheme('light')
    expect(colours()).toEqual(['#f5f2eb', '#f5f2eb'])
    applyTheme('system')
    expect(colours()).toEqual(['#f5f2eb', '#131823'])
  })

  it('a press shows the other theme, and saves "like the device" when that is it', () => {
    expect(flipTheme('system', false)).toBe('dark')
    expect(flipTheme('system', true)).toBe('light')
    expect(flipTheme('dark', false)).toBe('system')
    expect(flipTheme('dark', true)).toBe('light')
    expect(flipTheme('light', true)).toBe('system')
    expect(flipTheme('light', false)).toBe('dark')
  })

  it('what is shown: the choice, or else the device', () => {
    expect(shownDark('dark', false)).toBe(true)
    expect(shownDark('light', true)).toBe(false)
    expect(shownDark('system', true)).toBe(true)
    expect(shownDark('system', false)).toBe(false)
  })
})
