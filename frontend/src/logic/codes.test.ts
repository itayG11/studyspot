import { describe, expect, it } from 'vitest'
import { placeIdFromCode, scanUrl } from './codes'

const SIG = 'A'.repeat(43)

describe('placeIdFromCode', () => {
  it('reads the place number from a printed code', () => {
    expect(placeIdFromCode(`p12.v3.${SIG}`)).toBe(12)
    expect(placeIdFromCode(`  p12.v3.${SIG}\n`)).toBe(12) // pasted with spaces
  })

  it('anything else is not a code', () => {
    expect(placeIdFromCode('hello')).toBeNull()
    expect(placeIdFromCode(`p0.v1.${SIG}`)).toBeNull()
    expect(placeIdFromCode(`p12.v1.short`)).toBeNull()
  })
})

describe('scanUrl', () => {
  it('is the address a phone camera opens from the printed sign', () => {
    expect(scanUrl('https://studyspot.example', `p1.v1.${SIG}`)).toBe(`https://studyspot.example/scan?c=p1.v1.${SIG}`)
  })
})
