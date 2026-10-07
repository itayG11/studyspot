import { useSyncExternalStore } from 'react'
import { readFavorites, subscribeFavorites, toggleFavorite } from '../logic/favorites'

// The list is read from storage only when it may have changed, not on every
// render of every card: React asks for the snapshot often, and it must get
// the same array back while nothing changed.
let stale = true
let cached: number[] = []

function snapshot(): number[] {
  if (stale) {
    const list = readFavorites()
    if (list.join(',') !== cached.join(',')) cached = list // same contents, same array
    stale = false
  }
  return cached
}

function subscribe(listener: () => void): () => void {
  // Storage may have changed while nobody was listening: React reads the
  // snapshot again right after subscribing, and this makes that a real read.
  stale = true
  return subscribeFavorites(() => {
    stale = true
    listener()
  })
}

export function useFavorites(): { favorites: number[]; isFavorite: (id: number) => boolean; toggle: (id: number) => void } {
  const favorites = useSyncExternalStore(subscribe, snapshot, snapshot)
  return { favorites, isFavorite: (id) => favorites.includes(id), toggle: toggleFavorite }
}
