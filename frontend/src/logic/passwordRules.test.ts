import { describe, expect, it } from 'vitest'
import { passwordReady, passwordRules } from './passwordRules'

const unmet = (password: string) => passwordRules(password).filter((r) => !r.met).map((r) => r.key)

describe('passwordRules', () => {
  it('lists every rule that is still missing', () => {
    expect(unmet('')).toEqual(['length', 'upper', 'lower', 'digit', 'symbol'])
    expect(unmet('Short1!x')).toEqual(['length'])
    expect(unmet('no-upper-case-7')).toEqual(['upper'])
    expect(unmet('NO-LOWER-CASE-7')).toEqual(['lower'])
    expect(unmet('No-Digits-Here')).toEqual(['digit'])
    expect(unmet('NoSymbolsHere7')).toEqual(['symbol'])
  })

  it('takes a strong one, Hebrew letters too', () => {
    expect(passwordReady('Kfar-Tavor 7 rain')).toBe(true)
    expect(passwordReady('מים-קרים Tz9')).toBe(true)
  })

  it('counts characters, not code units, and has a top', () => {
    expect(unmet('Ab1!😀😀😀')).toContain('length') // 7 characters, 10 code units
    expect(unmet('A1!' + 'x'.repeat(126))).toEqual(['length'])
  })
})
