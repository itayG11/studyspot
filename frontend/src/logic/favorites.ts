// Favourite places, kept on this device only (localStorage).
//
// Trade-off: no table on the server and nothing to sign in for, but the
// favourites do not move to another device. Storage can be refused (private
// mode, full disk), so every access is guarded; the worst case is a list
// that is not remembered.

export const FAVORITES_KEY = 'studyspot:favorites'
const MAX = 50

type Listener = () => void
const listeners = new Set<Listener>()

export function readFavorites(): number[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(FAVORITES_KEY) ?? '[]')
    if (!Array.isArray(parsed)) return []
    return parsed.filter((id): id is number => Number.isInteger(id) && id > 0).slice(0, MAX)
  } catch {
    return []
  }
}

export function toggleFavorite(placeId: number): void {
  const current = readFavorites()
  const next = current.includes(placeId) ? current.filter((id) => id !== placeId) : [...current, placeId].slice(-MAX)
  try {
    localStorage.setItem(FAVORITES_KEY, JSON.stringify(next))
  } catch {
    return // not remembered; nothing else breaks
  }
  for (const listener of listeners) listener()
}

// For useSyncExternalStore: changes from this tab, and from other tabs
// (the browser fires "storage" there when one tab writes).
export function subscribeFavorites(listener: Listener): () => void {
  listeners.add(listener)
  const onStorage = (event: StorageEvent) => {
    if (event.key === FAVORITES_KEY) listener()
  }
  window.addEventListener('storage', onStorage)
  return () => {
    listeners.delete(listener)
    window.removeEventListener('storage', onStorage)
  }
}
