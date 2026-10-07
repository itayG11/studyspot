// The illustrative photos (AI-generated, see docs/IMAGES.md) and what the
// page needs to know about each: its alt text and where the free seat is,
// so the "your spot" pin can land on it.
//
// Points are percentages of the picture's own width and height, read off
// each image with a 10% grid. Wide pictures are 16:9, tall ones 9:16.

import type { PlaceKind } from '../api/types'

export type PhotoName = 'hero' | 'open-area' | 'computer-lab' | 'group-room' | 'library'

export interface Spot {
  x: number
  y: number
}

export interface PhotoInfo {
  alt: string
  // Where the pin lands: the free seat, or the main building in the hero.
  pin: { wide: Spot; tall: Spot }
}

export const PHOTOS: Record<PhotoName, PhotoInfo> = {
  hero: {
    alt: 'הדמיה: קמפוס מאבן בהירה על גבעה ירוקה בגליל, באור בוקר',
    pin: { wide: { x: 37, y: 43 }, tall: { x: 41, y: 27 } },
  },
  'open-area': {
    alt: 'הדמיה: מתחם לימוד פתוח ומואר, עם שולחנות עץ וכיסאות אדומים',
    pin: { wide: { x: 32, y: 76 }, tall: { x: 35, y: 54 } },
  },
  'computer-lab': {
    alt: 'הדמיה: חוות מחשבים שקטה, עם שורות של עמדות ואור מהחלונות',
    pin: { wide: { x: 40.5, y: 68 }, tall: { x: 58, y: 46 } },
  },
  'group-room': {
    alt: 'הדמיה: חדר לימוד קבוצתי עם שולחן גדול, לוח מחיק ומנורה חמה',
    pin: { wide: { x: 46.5, y: 67 }, tall: { x: 74, y: 46 } },
  },
  library: {
    alt: 'הדמיה: אולם קריאה בספרייה, עם מדפי עץ, שולחן ומנורה קטנה',
    pin: { wide: { x: 38, y: 70.5 }, tall: { x: 48, y: 48 } },
  },
}

export const KIND_PHOTO: Record<PlaceKind, PhotoName> = {
  open_area: 'open-area',
  computer_lab: 'computer-lab',
  group_room: 'group-room',
  library: 'library',
}

const base = `${import.meta.env.BASE_URL}images/`

// srcset strings for one picture. The files are made by docs/IMAGES.md.
export function photoSources(name: PhotoName) {
  const set = (suffixes: [string, number][], ext: string) =>
    suffixes.map(([suffix, width]) => `${base}${name}${suffix}.${ext} ${width}w`).join(', ')
  const wide: [string, number][] = [['-800', 800], ['-1600', 1600]]
  const tall: [string, number][] = [['-mobile-600', 600], ['-mobile-940', 940]]
  return {
    wide: { avif: set(wide, 'avif'), webp: set(wide, 'webp') },
    tall: { avif: set(tall, 'avif'), webp: set(tall, 'webp') },
    card: { avif: `${base}${name}-card-640.avif`, webp: `${base}${name}-card-640.webp` },
    fallback: `${base}${name}-1600.webp`,
  }
}
