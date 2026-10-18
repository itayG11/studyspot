import { describe, expect, it } from 'vitest'
import { backToFinder } from './backLink'

describe('backToFinder', () => {
  it('goes back to the same search and chips, at the same institution', () => {
    expect(backToFinder({ finder: '?q=%D7%9E%D7%97%D7%A9%D7%91&quiet=1' }, 'braude', 'M')).toBe('/braude?q=%D7%9E%D7%97%D7%A9%D7%91&quiet=1#finder')
    expect(backToFinder({ finder: '' }, 'braude', 'M')).toBe('/braude#finder')
  })

  it('without a search to return to, opens the finder near this building', () => {
    expect(backToFinder(null, 'demo', 'EM')).toBe('/demo?near=EM#finder')
    expect(backToFinder({ finder: 42 }, 'demo', 'EM')).toBe('/demo?near=EM#finder')
  })

  it('never follows a state that is not a search', () => {
    expect(backToFinder({ finder: '//evil.example' }, 'demo', 'M')).toBe('/demo?near=M#finder')
    expect(backToFinder({ finder: 'https://evil.example' }, 'demo', 'M')).toBe('/demo?near=M#finder')
  })
})
