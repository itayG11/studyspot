import { describe, expect, it } from 'vitest'
import { restingPoint, TALL_GEOMETRY, transitionWindows, WIDE_GEOMETRY } from './storyGeometry'

describe('the story geometry', () => {
  it('has a window for the opening and one for each room, in order and not overlapping', () => {
    for (const geometry of [WIDE_GEOMETRY, TALL_GEOMETRY]) {
      const windows = transitionWindows(geometry, 4)
      expect(windows).toHaveLength(5)
      windows.forEach(([from, to], i) => {
        expect(to).toBeGreaterThan(from)
        if (i > 0) expect(from).toBeGreaterThanOrEqual(windows[i - 1][1])
      })
    }
  })

  it('ends inside the story, with the last room still, on a phone and on a computer', () => {
    for (const { roomsFrom, roomSpan, enter } of [WIDE_GEOMETRY, TALL_GEOMETRY]) {
      expect(roomsFrom + 3 * roomSpan + roomSpan + enter).toBeLessThanOrEqual(1)
    }
  })

  it('makes a phone move longer than a computer move', () => {
    expect(TALL_GEOMETRY.enter).toBeGreaterThan(WIDE_GEOMETRY.enter)
  })
})

describe('restingPoint', () => {
  const windows = transitionWindows(TALL_GEOMETRY, 4)
  const [, , second] = windows

  it('finishes a move that stopped in its first half backwards, and in its second half forwards', () => {
    const [from, to] = second
    expect(restingPoint(from + (to - from) * 0.3, windows)).toBe(from)
    expect(restingPoint(from + (to - from) * 0.7, windows)).toBe(to)
  })

  it('leaves a stop between moves alone', () => {
    const middle = (windows[1][1] + windows[2][0]) / 2
    expect(restingPoint(middle, windows)).toBe(middle)
    expect(restingPoint(0, windows)).toBe(0)
    expect(restingPoint(1, windows)).toBe(1)
  })

  it('does not move a stop exactly on the edge of a move', () => {
    expect(restingPoint(second[0], windows)).toBe(second[0])
    expect(restingPoint(second[1], windows)).toBe(second[1])
  })

  it('covers the opening too: half open goes to the card or to the open photo', () => {
    const [from, to] = windows[0]
    expect(restingPoint(from + 0.01, windows)).toBe(from)
    expect(restingPoint(to - 0.01, windows)).toBe(to)
  })
})
