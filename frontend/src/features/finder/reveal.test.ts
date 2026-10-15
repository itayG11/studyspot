import { describe, expect, it } from 'vitest'
import { MAX_TILT_DEG, revealTransform, revealPerspective } from './reveal'

describe('revealPerspective', () => {
  it('is the design value for a finder of a screen or two', () => {
    expect(revealPerspective(800)).toBe(1400)
    expect(revealPerspective(2800)).toBe(1400) // a computer's finder
  })

  it('grows with a tall finder, so its far end never reaches the eye', () => {
    // Tilted about its top edge, a point h below it comes h·sin(tilt) closer;
    // at the perspective distance it would be drawn infinitely large. On a
    // phone the finder is one long column, past 5,000 px (CI run 97).
    for (const height of [500, 2000, 5079, 5642, 12000, 40000]) {
      const closest = height * Math.sin((MAX_TILT_DEG * Math.PI) / 180)
      expect(revealPerspective(height)).toBeGreaterThanOrEqual(1.5 * closest) // drawn 3 times at most, and clipped
    }
  })
})

describe('revealTransform', () => {
  it('tilts at the start, and is gone once the finder is in place', () => {
    expect(revealTransform(0, 800)).toBe('perspective(1400px) rotateX(16.00deg) scale(0.940)')
    expect(revealTransform(1, 800)).toBe('none')
  })

  it('uses the perspective of the finder\'s own height', () => {
    expect(revealTransform(0.5, 5642)).toContain(`perspective(${revealPerspective(5642)}px)`)
  })
})
