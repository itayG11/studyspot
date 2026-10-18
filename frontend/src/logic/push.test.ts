import { describe, expect, it } from 'vitest'
import { keyBytes, pushSupport } from './push'

const full = { serviceWorker: true, pushManager: true, notification: true }

describe('push support', () => {
  it('a phone or computer with the three APIs can', () => {
    expect(pushSupport({ platform: 'android', ...full })).toBe('supported')
    expect(pushSupport({ platform: 'other', ...full })).toBe('supported')
    expect(pushSupport({ platform: 'installed', ...full })).toBe('supported')
  })

  it('an iPhone in a Safari tab must add the site to the home screen first', () => {
    expect(pushSupport({ platform: 'ios', ...full, pushManager: false })).toBe('needs-install')
  })

  it('a browser missing any of them cannot', () => {
    expect(pushSupport({ platform: 'other', ...full, pushManager: false })).toBe('unsupported')
    expect(pushSupport({ platform: 'android', ...full, serviceWorker: false })).toBe('unsupported')
  })
})

describe('the server key', () => {
  it('decodes base64url without padding', () => {
    expect(Array.from(keyBytes('BAEC_-8'))).toEqual([4, 1, 2, 255, 239])
  })
})
