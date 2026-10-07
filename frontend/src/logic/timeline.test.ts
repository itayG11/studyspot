import { describe, expect, it } from 'vitest'
import type { Slot } from './slots'
import { nearestFree, segments } from './timeline'

const slot = (start: string, state: Slot['state'], maxEnd = start): Slot => ({ start, maxEnd, label: start.slice(11, 16), state })

const DAY: Slot[] = [
  slot('2026-10-11T05:00:00.000Z', 'past'),
  slot('2026-10-11T05:15:00.000Z', 'past'),
  slot('2026-10-11T05:30:00.000Z', 'free', '2026-10-11T06:00:00.000Z'),
  slot('2026-10-11T05:45:00.000Z', 'free', '2026-10-11T06:00:00.000Z'),
  slot('2026-10-11T06:00:00.000Z', 'busy'),
  slot('2026-10-11T06:15:00.000Z', 'free', '2026-10-11T08:00:00.000Z'),
  slot('2026-10-11T06:30:00.000Z', 'free', '2026-10-11T08:00:00.000Z'),
]

describe('segments', () => {
  it('joins neighbouring slots in the same state, and ends each at the next one', () => {
    const result = segments(DAY, 15)
    expect(result.map((s) => [s.state, s.start, s.end])).toEqual([
      ['past', '2026-10-11T05:00:00.000Z', '2026-10-11T05:30:00.000Z'],
      ['free', '2026-10-11T05:30:00.000Z', '2026-10-11T06:00:00.000Z'],
      ['busy', '2026-10-11T06:00:00.000Z', '2026-10-11T06:15:00.000Z'],
      ['free', '2026-10-11T06:15:00.000Z', '2026-10-11T06:45:00.000Z'],
    ])
  })

  it('gives each segment its share of the day', () => {
    const shares = segments(DAY, 15).map((s) => s.share)
    expect(shares.reduce((a, b) => a + b)).toBeCloseTo(1)
    expect(shares[0]).toBeCloseTo(2 / 7)
  })

  it('keeps a gap between two opening windows apart (a closed lunch break)', () => {
    const split = [slot('2026-10-11T05:00:00.000Z', 'free'), slot('2026-10-11T07:00:00.000Z', 'free')]
    expect(segments(split, 15)).toHaveLength(2)
  })

  it('is empty on a closed day', () => {
    expect(segments([], 15)).toEqual([])
  })
})

describe('nearestFree', () => {
  it('suggests the first start at or after a taken one that still fits the same length', () => {
    // 30 minutes from 05:30 fits; from 06:15 there is room for two hours.
    expect(nearestFree(DAY, '2026-10-11T05:30:00.000Z', 30)?.start).toBe('2026-10-11T05:30:00.000Z')
    expect(nearestFree(DAY, '2026-10-11T05:30:00.000Z', 60)?.start).toBe('2026-10-11T06:15:00.000Z')
  })

  it('has nothing to suggest when no later start fits', () => {
    expect(nearestFree(DAY, '2026-10-11T06:30:00.000Z', 120)).toBeNull()
  })
})
