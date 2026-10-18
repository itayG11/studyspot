// Hebrew-friendly search over places. Pure functions.
//
// What makes Hebrew search different:
// - Final letters (ך ם ן ף ץ) are the same letters at the end of a word, so
//   a word that is still being typed ("מתחמ") must match "מתחם".
// - Niqqud (vowel points) and geresh are optional in writing.
// - "ספרייה" and "ספריה" are both common spellings.

import type { Place } from '../api/types'
import { AMENITY_LABELS, ATMOSPHERE_LABELS, floorLabel, KIND_LABELS, SUITED_LABELS } from '../i18n/labels'

const FINALS: Record<string, string> = { ך: 'כ', ם: 'מ', ן: 'נ', ף: 'פ', ץ: 'צ' }

export function normalize(text: string): string {
  return (
    text
      .toLowerCase()
      // Niqqud and cantillation marks: U+0591 to U+05C7, except the letters.
      .replace(/[֑-ֽֿ-ׂׄ-ׇ]/g, '')
      // Geresh, gershayim and quotes, Hebrew and plain.
      .replace(/[׳״'"`׳״]/g, '')
      .replace(/[ךםןףץ]/g, (letter) => FINALS[letter])
      // Double yod or vav inside a word is often written single.
      .replace(/יי/g, 'י')
      .replace(/וו/g, 'ו')
      .replace(/\s+/g, ' ')
      .trim()
  )
}

// Everything a student might type to find this place, in one string.
function haystack(place: Place): string {
  return normalize(
    [
      place.name,
      place.building_code,
      `בניין ${place.building_code}`,
      KIND_LABELS[place.kind],
      floorLabel(place.floor),
      place.location_note ?? '',
      ATMOSPHERE_LABELS[place.atmosphere],
      SUITED_LABELS[place.suited_for],
      ...place.amenities.map((a) => AMENITY_LABELS[a]),
    ].join(' '),
  )
}

// Every word of the search must appear somewhere in the place's text.
export function matchesSearch(place: Place, query: string): boolean {
  const words = normalize(query).split(' ').filter(Boolean)
  if (words.length === 0) return true
  const text = haystack(place)
  return words.every((word) => text.includes(word))
}
