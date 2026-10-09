import { afterEach, describe, expect, it } from 'vitest'
import { detectPlatform, dismissInstallTip, INSTALL_DISMISSED_KEY, installTipDismissed } from './install'

const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1'
const IPAD_AS_MAC = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15'
const ANDROID = 'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Mobile Safari/537.36'
const DESKTOP = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36'

const env = (userAgent: string, extra: Partial<Parameters<typeof detectPlatform>[0]> = {}) => ({
  userAgent,
  maxTouchPoints: 0,
  standalone: false,
  ...extra,
})

describe('detectPlatform', () => {
  it('knows an iPhone', () => {
    expect(detectPlatform(env(IPHONE, { maxTouchPoints: 5 }))).toBe('ios')
  })

  it('knows an iPad that says it is a Mac', () => {
    expect(detectPlatform(env(IPAD_AS_MAC, { maxTouchPoints: 5 }))).toBe('ios')
    expect(detectPlatform(env(IPAD_AS_MAC))).toBe('other') // a real Mac has no touch screen
  })

  it('knows Android', () => {
    expect(detectPlatform(env(ANDROID, { maxTouchPoints: 5 }))).toBe('android')
  })

  it('a computer is "other"', () => {
    expect(detectPlatform(env(DESKTOP))).toBe('other')
  })

  it('says when the site is already open from the home screen', () => {
    expect(detectPlatform(env(IPHONE, { standalone: true }))).toBe('installed')
    expect(detectPlatform(env(ANDROID, { standalone: true }))).toBe('installed')
  })
})

describe('the "not now" choice', () => {
  afterEach(() => localStorage.clear())

  it('is remembered on this device', () => {
    expect(installTipDismissed()).toBe(false)
    dismissInstallTip()
    expect(installTipDismissed()).toBe(true)
    expect(localStorage.getItem(INSTALL_DISMISSED_KEY)).toBe('1')
  })
})
