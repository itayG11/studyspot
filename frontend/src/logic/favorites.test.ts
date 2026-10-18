import { afterEach, describe, expect, it, vi } from 'vitest'
import { FAVORITES_KEY, readFavorites, toggleFavorite } from './favorites'

afterEach(() => {
  localStorage.clear()
  vi.restoreAllMocks()
})

describe('favorites', () => {
  it('starts empty, then remembers and forgets a place', () => {
    expect(readFavorites()).toEqual([])
    toggleFavorite(4)
    toggleFavorite(9)
    expect(readFavorites()).toEqual([4, 9])
    toggleFavorite(4)
    expect(readFavorites()).toEqual([9])
  })

  it('treats a damaged value as no favorites', () => {
    localStorage.setItem(FAVORITES_KEY, '{not json')
    expect(readFavorites()).toEqual([])
    localStorage.setItem(FAVORITES_KEY, JSON.stringify(['x', 3, -1, 2.5, 7]))
    expect(readFavorites()).toEqual([3, 7])
  })

  it('keeps working when the browser refuses storage (private mode)', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('denied', 'SecurityError')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('full', 'QuotaExceededError')
    })
    expect(readFavorites()).toEqual([])
    expect(() => toggleFavorite(1)).not.toThrow()
  })
})
