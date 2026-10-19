import { describe, expect, it } from 'vitest'
import { codeFromHash, placeIdFromCode, scanUrl } from './codes'

const SIG = 'A'.repeat(43)

describe('placeIdFromCode', () => {
  it('reads the place number from a printed code', () => {
    expect(placeIdFromCode(`p12.v3.${SIG}`)).toBe(12)
    expect(placeIdFromCode(`  p12.v3.${SIG}\n`)).toBe(12) // pasted with spaces
  })

  it('and from a screen code, which carries its minute', () => {
    expect(placeIdFromCode(`p12.v3.w29345678.${SIG}`)).toBe(12)
    expect(placeIdFromCode(`p12.v3.w0.${SIG}`)).toBeNull()
  })

  it('anything else is not a code', () => {
    expect(placeIdFromCode('hello')).toBeNull()
    expect(placeIdFromCode(`p0.v1.${SIG}`)).toBeNull()
    expect(placeIdFromCode(`p12.v1.short`)).toBeNull()
  })
})

describe('scanUrl', () => {
  it('is the address a phone camera opens from the printed sign', () => {
    expect(scanUrl('https://studyspot.example', `p1.v1.${SIG}`)).toBe(`https://studyspot.example/scan#c=p1.v1.${SIG}`)
  })

  it('the code is read back from the fragment', () => {
    expect(codeFromHash(`#c=p1.v1.${SIG}`)).toBe(`p1.v1.${SIG}`)
    expect(codeFromHash('')).toBeNull()
    expect(codeFromHash('#other=1')).toBeNull()
  })
})
