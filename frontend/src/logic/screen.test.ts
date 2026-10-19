import { describe, expect, it } from 'vitest'
import { codeStillGood, nextAskMs, tokenFromHash } from './screen'

describe('the screen by the door', () => {
  it('reads its link from after "#"', () => {
    expect(tokenFromHash('#t=abc_DEF-123')).toBe('abc_DEF-123')
    expect(tokenFromHash('#c=p1.v1.x')).toBeNull()
    expect(tokenFromHash('')).toBeNull()
  })

  it('asks again right after the code changes, and at least every 20 seconds', () => {
    expect(nextAskMs(5)).toBe(5_300)
    expect(nextAskMs(60)).toBe(20_000)
  })

  it('keeps showing a code it has until a little after its minute, never longer', () => {
    const fetchedAt = 1_000_000
    // Fetched with 10 seconds left: its minute ends at +10 s; the server still takes it for one more.
    expect(codeStillGood(fetchedAt, 10, fetchedAt + 40_000)).toBe(true)
    expect(codeStillGood(fetchedAt, 10, fetchedAt + 46_000)).toBe(false)
  })
})
