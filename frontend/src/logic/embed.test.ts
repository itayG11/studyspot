import { describe, expect, it } from 'vitest'
import { embedAddress } from './embed'

describe('embedAddress', () => {
  it('has only what was chosen', () => {
    expect(embedAddress('https://getstudyspot.me', 'braude', '', 'auto')).toBe('https://getstudyspot.me/embed/braude')
    expect(embedAddress('https://getstudyspot.me', 'braude', 'L', 'dark')).toBe(
      'https://getstudyspot.me/embed/braude?building=L&theme=dark',
    )
  })
})
