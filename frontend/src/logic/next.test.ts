import { describe, expect, it } from 'vitest'
import { safeNext } from './next'

describe('safeNext', () => {
  it('keeps a page of this site', () => {
    expect(safeNext('/scan?c=p1.v1.abc')).toBe('/scan?c=p1.v1.abc')
    expect(safeNext('/places/5')).toBe('/places/5')
  })

  it.each([
    ['//evil.example/login'],
    ['/\\evil.example'],
    ['https://evil.example'],
    ['javascript:alert(1)'],
    ['places/5'],
    ['/\nevil'],
    [''],
    [null],
  ])('sends %j back to the home page', (value) => {
    expect(safeNext(value)).toBe('/')
  })
})
