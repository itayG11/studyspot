// The weekly timetable grid: where each class and each break sits in a
// day's column. Pure, for the tests; the page only draws it.

import type { ClassSlot } from '../api/types'

export interface HourRange {
  from: number // first hour shown
  to: number // the hour the day ends at
}

export interface Block {
  slot: ClassSlot
  top: number // percent of the day shown
  height: number
}

export interface Gap {
  starts: string // "HH:MM"
  ends: string
  minutes: number
  top: number
  height: number
}

// The same rule as the server's gaps (app/between_classes.py MIN_GAP).
export const MIN_GAP = 30
const TONES = 8

const minutes = (value: string) => Number(value.slice(0, 2)) * 60 + Number(value.slice(3, 5))
const clock = (value: string) => value.slice(0, 5)

export function hourRange(classes: ClassSlot[]): HourRange {
  if (classes.length === 0) return { from: 8, to: 20 }
  const first = Math.min(...classes.map((c) => minutes(c.starts)))
  const last = Math.max(...classes.map((c) => minutes(c.ends)))
  return { from: Math.min(8, Math.floor(first / 60)), to: Math.max(20, Math.ceil(last / 60)) }
}

export function dayLayout(day: ClassSlot[], range: HourRange): { blocks: Block[]; gaps: Gap[] } {
  const span = (range.to - range.from) * 60
  const at = (m: number) => ((m - range.from * 60) / span) * 100
  const sorted = [...day].sort((a, b) => a.starts.localeCompare(b.starts))
  const blocks = sorted.map((slot) => ({
    slot,
    top: at(minutes(slot.starts)),
    height: at(minutes(slot.ends)) - at(minutes(slot.starts)),
  }))
  const gaps: Gap[] = []
  for (let i = 1; i < sorted.length; i++) {
    const from = minutes(sorted[i - 1].ends)
    const to = minutes(sorted[i].starts)
    if (to - from >= MIN_GAP) {
      gaps.push({ starts: clock(sorted[i - 1].ends), ends: clock(sorted[i].starts), minutes: to - from, top: at(from), height: at(to) - at(from) })
    }
  }
  return { blocks, gaps }
}

// A tone per course, by its name (or building when it has none), so a
// course keeps its colour across the week.
// Where a class is: its building, or a place the campus does not list.
export const classPlace = (slot: ClassSlot): string => slot.building_code ?? slot.place_text ?? ''

export function courseTone(slot: ClassSlot): number {
  const key = slot.title ?? classPlace(slot)
  let hash = 0
  for (const ch of key) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0
  return hash % TONES
}

// A click at `share` (0–1) down the day: the half hour it falls in, "HH:MM".
export function pickedTime(share: number, range: HourRange): string {
  const total = range.from * 60 + share * (range.to - range.from) * 60
  const half = Math.floor(total / 30) * 30
  return `${String(Math.floor(half / 60)).padStart(2, '0')}:${String(half % 60).padStart(2, '0')}`
}
