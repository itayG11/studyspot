import { useSyncExternalStore } from 'react'
import { readFavorites, subscribeFavorites, toggleFavorite } from '../logic/favorites'

// The list is read again only when it changes. useSyncExternalStore needs
// the same array back while nothing changed, so the last read is cached by
// its text.
let cachedText = ''
let cached: number[] = []
function snapshot(): number[] {
  const list = readFavorites()
  const text = list.join(',')
  if (text !== cachedText) {
    cachedText = text
    cached = list
  }
  return cached
}

export function useFavorites(): { favorites: number[]; isFavorite: (id: number) => boolean; toggle: (id: number) => void } {
  const favorites = useSyncExternalStore(subscribeFavorites, snapshot, () => cached)
  return { favorites, isFavorite: (id) => favorites.includes(id), toggle: toggleFavorite }
}
