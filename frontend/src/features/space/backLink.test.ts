import { describe, expect, it } from 'vitest'
import { backToFinder } from './backLink'

describe('backToFinder', () => {
  it('goes back to the same search and chips', () => {
    expect(backToFinder({ finder: '?q=%D7%9E%D7%97%D7%A9%D7%91&quiet=1' }, 'M')).toBe('/?q=%D7%9E%D7%97%D7%A9%D7%91&quiet=1#finder')
    expect(backToFinder({ finder: '' }, 'M')).toBe('/#finder')
  })

  it('without a search to return to, opens the finder near this building', () => {
    expect(backToFinder(null, 'EM')).toBe('/?near=EM#finder')
    expect(backToFinder({ finder: 42 }, 'EM')).toBe('/?near=EM#finder')
  })

  it('never follows a state that is not a search', () => {
    expect(backToFinder({ finder: '//evil.example' }, 'M')).toBe('/?near=M#finder')
    expect(backToFinder({ finder: 'https://evil.example' }, 'M')).toBe('/?near=M#finder')
  })
})
