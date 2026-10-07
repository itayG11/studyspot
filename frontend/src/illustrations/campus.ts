// The campus model in numbers: where each building and tree stands, how
// tall it is, and the frame around it all. Kept apart from the drawing so
// it can be tested.
//
// What is real: each building's position (its coordinates) and its number
// of floors. What is not: the shape. All buildings get the same footprint,
// and the model says so on screen ("illustration").

import type { BuildingStatus } from '../api/types'
import { campusLayout, project, screenBounds, type Bounds, type Box, type Point3 } from './iso'

export interface CampusBuilding {
  code: string
  latitude: string | null
  longitude: string | null
  floors_count: number
  status: BuildingStatus
}

export const FOOTPRINT = { w: 30, d: 42 } // metres, the same for every building
// Taller than life (about 4 m): a model exaggerates height so floors read.
export const FLOOR_HEIGHT = 6.5
const PARAPET = 1.5
const MARGIN = 40 // grass around the outermost buildings
export const BASE_DEPTH = 10 // the model's base, seen from the side
const TREE_GAP = 26 // no tree closer than this to a building's centre
const TREE_STEP = 30

export interface PlacedBuilding {
  code: string
  status: BuildingStatus
  floors: number
  box: Box
  roof: [number, number] // the middle of the roof, on screen
}

export interface Tree {
  x: number
  y: number
  size: number // 0.8 - 1.2
}

export type Item = { kind: 'building'; building: PlacedBuilding } | { kind: 'tree'; tree: Tree }

export interface CampusGeometry {
  ground: Box
  walk: Point3[] // a footpath from building to building, south to north
  items: Item[] // back to front
  buildings: PlacedBuilding[]
  bounds: Bounds
}

export function buildingHeight(floors: number): number {
  return Math.max(floors, 1) * FLOOR_HEIGHT + PARAPET
}

// A fixed pseudo-random number in [0, 1) for a grid cell, so the trees stand
// in the same places on every visit.
function noise(i: number, j: number): number {
  const s = Math.sin(i * 127.1 + j * 311.7) * 43758.5453
  return s - Math.floor(s)
}

export function campusGeometry(input: CampusBuilding[]): CampusGeometry | null {
  const spots = campusLayout(input)
  if (spots.length === 0) return null

  const buildings: PlacedBuilding[] = spots.map(({ code, x, y, building }) => {
    const h = buildingHeight(building.floors_count)
    const box = { x: x - FOOTPRINT.w / 2, y: y - FOOTPRINT.d / 2, z: 0, w: FOOTPRINT.w, d: FOOTPRINT.d, h }
    return { code, status: building.status, floors: building.floors_count, box, roof: project([x, y, h]) }
  })

  const xs = spots.map((s) => s.x)
  const ys = spots.map((s) => s.y)
  const ground: Box = {
    x: Math.min(...xs) - MARGIN,
    y: Math.min(...ys) - MARGIN,
    z: -BASE_DEPTH,
    w: Math.max(...xs) - Math.min(...xs) + 2 * MARGIN,
    d: Math.max(...ys) - Math.min(...ys) + 2 * MARGIN,
    h: BASE_DEPTH,
  }

  const trees: Tree[] = []
  for (let i = 0; i * TREE_STEP < ground.w - 12; i++) {
    for (let j = 0; j * TREE_STEP < ground.d - 12; j++) {
      if (noise(i, j) > 0.4) continue // leave open lawn between groves
      const x = ground.x + 10 + i * TREE_STEP + noise(j, i) * 12
      const y = ground.y + 10 + j * TREE_STEP + noise(i + 7, j) * 12
      if (spots.some((s) => Math.hypot(s.x - x, s.y - y) < TREE_GAP)) continue
      trees.push({ x, y, size: 0.8 + noise(i + 3, j + 5) * 0.4 })
    }
  }

  const items: Item[] = [
    ...buildings.map((building): Item => ({ kind: 'building', building })),
    ...trees.map((tree): Item => ({ kind: 'tree', tree })),
  ].sort((a, b) => depth(a) - depth(b))

  const corners: Point3[] = [
    [ground.x, ground.y, 0],
    [ground.x + ground.w, ground.y, 0],
    [ground.x, ground.y + ground.d, -BASE_DEPTH],
    [ground.x + ground.w, ground.y + ground.d, -BASE_DEPTH],
    ...buildings.map(({ box }): Point3 => [box.x, box.y, box.h]),
  ]
  // Room above for the hills, the labels and the pin.
  const bounds = screenBounds(corners, { top: 90, side: 24, bottom: 24 })
  // The path is part of the illustration, not a survey of the real paths.
  const walk = [...spots].sort((a, b) => b.y - a.y).map(({ x, y }): Point3 => [x, y, 0])
  return { ground, walk, items, buildings, bounds }
}

function depth(item: Item): number {
  if (item.kind === 'tree') return item.tree.x + item.tree.y
  const { box } = item.building
  return box.x + box.w / 2 + box.y + box.d / 2
}
