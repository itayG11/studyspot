import { describe, expect, it } from 'vitest'
import { buildingHeight, campusGeometry, FLOOR_HEIGHT, type CampusBuilding } from './campus'

const BRAUDE: CampusBuilding[] = [
  { code: 'M', floors_count: 3, status: 'active', latitude: '32.912751', longitude: '35.282293' },
  { code: 'L', floors_count: 1, status: 'active', latitude: '32.912396', longitude: '35.282790' },
  { code: 'EM', floors_count: 4, status: 'active', latitude: '32.914079', longitude: '35.281250' },
  { code: 'NG', floors_count: 4, status: 'under_construction', latitude: '32.914383', longitude: '35.280751' },
  { code: 'Q', floors_count: 2, status: 'active', latitude: null, longitude: null },
]

describe('campusGeometry', () => {
  it('has nothing to draw without placed buildings', () => {
    expect(campusGeometry([])).toBeNull()
    expect(campusGeometry([BRAUDE[4]])).toBeNull()
  })

  it('draws every placed building, as tall as its floors', () => {
    const geometry = campusGeometry(BRAUDE)!
    expect(geometry.buildings.map((b) => b.code).sort()).toEqual(['EM', 'L', 'M', 'NG'])
    const em = geometry.buildings.find((b) => b.code === 'EM')!
    expect(em.box.h).toBe(buildingHeight(4))
    expect(buildingHeight(4) - buildingHeight(3)).toBeCloseTo(FLOOR_HEIGHT)
  })

  it('keeps every roof inside the frame', () => {
    const { buildings, bounds } = campusGeometry(BRAUDE)!
    for (const { roof } of buildings) {
      expect(roof[0]).toBeGreaterThan(bounds.x)
      expect(roof[0]).toBeLessThan(bounds.x + bounds.width)
      expect(roof[1]).toBeGreaterThan(bounds.y)
      expect(roof[1]).toBeLessThan(bounds.y + bounds.height)
    }
  })

  it('plants trees on the lawn, never inside a building, the same each time', () => {
    const first = campusGeometry(BRAUDE)!
    const trees = first.items.flatMap((item) => (item.kind === 'tree' ? [item.tree] : []))
    expect(trees.length).toBeGreaterThan(5)
    for (const tree of trees) {
      for (const { box } of first.buildings) {
        const inside = tree.x > box.x && tree.x < box.x + box.w && tree.y > box.y && tree.y < box.y + box.d
        expect(inside).toBe(false)
      }
    }
    expect(campusGeometry(BRAUDE)!.items).toEqual(first.items)
  })
})
