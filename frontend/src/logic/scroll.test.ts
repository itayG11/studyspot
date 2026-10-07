import { describe, expect, it } from 'vitest'
import { isLanded, progressFor } from './scroll'

// A hero 2000px tall in an 800px window can scroll 1200px before it ends.
const HEIGHT = 2000
const VIEWPORT = 800

describe('progressFor', () => {
  it('is 0 while the top of the hero is still in place', () => {
    expect(progressFor(0, HEIGHT, VIEWPORT)).toBe(0)
    expect(progressFor(150, HEIGHT, VIEWPORT)).toBe(0) // not reached yet
  })

  it('grows with the distance scrolled', () => {
    expect(progressFor(-300, HEIGHT, VIEWPORT)).toBe(0.25)
    expect(progressFor(-600, HEIGHT, VIEWPORT)).toBe(0.5)
  })

  it('stops at 1 once the hero is behind', () => {
    expect(progressFor(-1200, HEIGHT, VIEWPORT)).toBe(1)
    expect(progressFor(-5000, HEIGHT, VIEWPORT)).toBe(1)
  })

  it('counts as landed once the headline has faded out', () => {
    expect(isLanded(0.39)).toBe(false)
    expect(isLanded(0.4)).toBe(true)
  })

  it('a hero no taller than the window is already done', () => {
    expect(progressFor(0, VIEWPORT, VIEWPORT)).toBe(1)
  })
})
