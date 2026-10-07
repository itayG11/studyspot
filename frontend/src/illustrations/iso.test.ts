import { describe, expect, it } from 'vitest'
import { boxFaces, campusLayout, polygon, project, shade } from './iso'

describe('project', () => {
  it('puts the origin at the origin', () => {
    expect(project([0, 0, 0])).toEqual([0, 0])
  })

  it('tilts the axes by 30 degrees, and lifts height straight up', () => {
    const [x1, y1] = project([10, 0, 0])
    expect(x1).toBeCloseTo(10 * Math.cos(Math.PI / 6))
    expect(y1).toBeCloseTo(5)
    const [x2, y2] = project([0, 10, 0])
    expect(x2).toBeCloseTo(-10 * Math.cos(Math.PI / 6))
    expect(y2).toBeCloseTo(5)
    expect(project([0, 0, 7])).toEqual([0, -7])
  })
})

describe('polygon', () => {
  it('writes SVG points, rounded to two decimals', () => {
    expect(polygon([[0, 0, 0], [1, 0, 0]])).toBe('0,0 0.87,0.5')
  })
})

describe('boxFaces', () => {
  it('draws the three faces a viewer sees: top, left and right', () => {
    const faces = boxFaces({ x: 0, y: 0, z: 0, w: 2, d: 3, h: 4 })
    expect(faces.top).toBe(polygon([[0, 0, 4], [2, 0, 4], [2, 3, 4], [0, 3, 4]]))
    expect(faces.left).toBe(polygon([[0, 3, 0], [2, 3, 0], [2, 3, 4], [0, 3, 4]]))
    expect(faces.right).toBe(polygon([[2, 0, 0], [2, 3, 0], [2, 3, 4], [2, 0, 4]]))
  })
})

describe('shade', () => {
  it('darkens towards black and lightens towards white', () => {
    expect(shade('#808080', 0)).toBe('#808080')
    expect(shade('#808080', -1)).toBe('#000000')
    expect(shade('#808080', 1)).toBe('#ffffff')
    expect(shade('#ff0000', -0.5)).toBe('#800000')
  })
})

describe('campusLayout', () => {
  // Real coordinates of four Braude buildings (docs/CAMPUS_DATA.md).
  const buildings = [
    { code: 'L', latitude: '32.912396', longitude: '35.282790' },
    { code: 'M', latitude: '32.912751', longitude: '35.282293' },
    { code: 'EM', latitude: '32.914079', longitude: '35.281250' },
    { code: 'P', latitude: '32.917067', longitude: '35.281550' },
    { code: 'X', latitude: null, longitude: null },
  ]

  it('leaves out buildings that are not on the map yet', () => {
    expect(campusLayout(buildings).map((b) => b.code)).not.toContain('X')
  })

  it('keeps real distances in proportion', () => {
    const spots = Object.fromEntries(campusLayout(buildings).map((b) => [b.code, b]))
    const metres = (a: string, b: string) => Math.hypot(spots[a].x - spots[b].x, spots[a].y - spots[b].y)
    // L to P is about 520 m; L to M about 60 m.
    expect(metres('L', 'P') / metres('L', 'M')).toBeGreaterThan(7)
    expect(metres('L', 'P') / metres('L', 'M')).toBeLessThan(10)
  })

  it('places the northern building further back (higher on screen)', () => {
    const spots = Object.fromEntries(campusLayout(buildings).map((b) => [b.code, b]))
    expect(project([spots.P.x, spots.P.y, 0])[1]).toBeLessThan(project([spots.L.x, spots.L.y, 0])[1])
  })

  it('orders buildings back to front, so nearer ones are drawn over farther ones', () => {
    const depths = campusLayout(buildings).map((b) => b.x + b.y)
    expect(depths).toEqual([...depths].sort((a, b) => a - b))
  })
})
