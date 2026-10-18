// "Where can I study now?": two questions, up to three places, and the
// reasons each one was picked. Pure, from the places the page already has.

import type { Place } from '../api/types'
import { isFreeNow } from './availability'

export type Who = 'solo' | 'group'
export type Need = 'quiet' | 'talk' | 'computer'

export interface QuickAnswers {
  who: Who
  need: Need
}

export interface QuickPick {
  place: Place
  reasons: string[]
}

const MAX_PICKS = 3

const SUITS: Record<Who, (p: Place) => boolean> = {
  solo: (p) => p.suited_for !== 'group',
  group: (p) => p.suited_for !== 'solo',
}

const MEETS: Record<Need, (p: Place) => boolean> = {
  quiet: (p) => p.atmosphere === 'quiet',
  talk: (p) => p.atmosphere !== 'quiet',
  computer: (p) => p.amenities.includes('computers'),
}

const NEED_REASON: Record<Need, string> = { quiet: 'שקט', talk: 'אפשר לדבר', computer: 'יש מחשבים' }
const WHO_REASON: Record<Who, string> = { solo: 'מתאים ללימוד לבד', group: 'מתאים לקבוצה' }

// Room to spare: free seats, or a free group room's own size.
const room = (p: Place) => (p.kind === 'group_room' ? p.capacity : p.available)

export function quickPicks(places: Place[], { who, need }: QuickAnswers): QuickPick[] {
  return places
    .filter((p) => isFreeNow(p) && SUITS[who](p) && MEETS[need](p))
    .toSorted((a, b) => room(b) - room(a))
    .slice(0, MAX_PICKS)
    .map((place) => ({
      place,
      reasons: [
        place.kind === 'group_room' ? 'החדר פנוי עכשיו' : `${place.available} מקומות פנויים עכשיו`,
        NEED_REASON[need],
        WHO_REASON[who],
      ],
    }))
}
