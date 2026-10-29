import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { leadingZeroBits, sha256Short, solve } from './pow'

const SALT = '0123456789abcdef0123456789abcdef'

function nodeHash(text: string): Uint8Array {
  return new Uint8Array(createHash('sha256').update(text).digest())
}

describe('sha256Short', () => {
  it('matches the platform hash on the strings the puzzle uses', () => {
    for (const text of ['', 'abc', `${SALT}:0`, `${SALT}:123456`, `${SALT}:9007199254740991`]) {
      expect(sha256Short(new TextEncoder().encode(text))).toEqual(nodeHash(text))
    }
  })

  it('refuses a message that does not fit in one block', () => {
    expect(() => sha256Short(new Uint8Array(56))).toThrow()
  })
})

describe('leadingZeroBits', () => {
  it('counts the zero bits at the front', () => {
    expect(leadingZeroBits(new Uint8Array([0x80]))).toBe(0)
    expect(leadingZeroBits(new Uint8Array([0x01, 0xff]))).toBe(7)
    expect(leadingZeroBits(new Uint8Array([0x00, 0x10]))).toBe(11)
    expect(leadingZeroBits(new Uint8Array([0x00, 0x00]))).toBe(16)
  })
})

describe('solve', () => {
  it('finds a number whose hash starts with enough zero bits', async () => {
    const nonce = await solve(SALT, 10)
    expect(leadingZeroBits(nodeHash(`${SALT}:${nonce}`))).toBeGreaterThanOrEqual(10)
  })

  it('finds the smallest such number, like the server reference does', async () => {
    // Count up by hand with the platform hash: the first nonce that works
    let expected = 0
    while (leadingZeroBits(nodeHash(`${SALT}:${expected}`)) < 8) expected++
    expect(await solve(SALT, 8)).toBe(expected)
  })

  it('needs no work for zero bits', async () => {
    expect(await solve(SALT, 0)).toBe(0)
  })
})
