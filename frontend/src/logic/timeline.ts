// The day as a few stretches of time (free, booked, past) for the timeline
// on the space page, and the nearest free start after a clash. Pure
// functions over the slots of logic/slots.ts.

import type { Slot, SlotState } from './slots'

export interface Segment {
  state: SlotState
  start: string
  end: string
  share: number // part of the day's open time, 0..1
}

const MINUTE = 60_000

export function segments(slots: Slot[], slotMinutes: number): Segment[] {
  const step = slotMinutes * MINUTE
  const runs: { state: SlotState; start: number; end: number }[] = []
  for (const s of slots) {
    const start = Date.parse(s.start)
    const last = runs.at(-1)
    // A run continues only with the same state and no gap (a closed break).
    if (last && last.state === s.state && last.end === start) last.end = start + step
    else runs.push({ state: s.state, start, end: start + step })
  }
  const total = runs.reduce((sum, r) => sum + (r.end - r.start), 0)
  return runs.map((r) => ({
    state: r.state,
    start: new Date(r.start).toISOString(),
    end: new Date(r.end).toISOString(),
    share: (r.end - r.start) / total,
  }))
}

// After "someone booked it a moment ago": the first free start at or after
// the one that was taken, with room for the same length.
export function nearestFree(slots: Slot[], from: string, minutes: number): Slot | null {
  const after = Date.parse(from)
  return (
    slots.find(
      (s) => s.state === 'free' && Date.parse(s.start) >= after && Date.parse(s.maxEnd) - Date.parse(s.start) >= minutes * MINUTE,
    ) ?? null
  )
}
