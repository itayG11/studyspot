// A small isometric toolkit: turn a point in 3D (metres) into a point on
// the screen, and draw a box as its three visible faces.
//
// World axes: x and y lie on the ground, z goes up. The viewer looks from
// the +x +y side, so a larger x + y is nearer and drawn later.

export type Point3 = readonly [x: number, y: number, z: number]

const COS30 = Math.cos(Math.PI / 6)

// Isometric projection: the two ground axes tilt by 30 degrees each way.
export function project([x, y, z]: Point3): [number, number] {
  return [(x - y) * COS30, (x + y) * 0.5 - z]
}

const round = (n: number) => Math.round(n * 100) / 100 + 0 // + 0 turns -0 into 0

// SVG "points" for a polygon through the given 3D points.
export function polygon(points: Point3[]): string {
  return points
    .map((p) => project(p))
    .map(([x, y]) => `${round(x)},${round(y)}`)
    .join(' ')
}

export interface Box {
  x: number
  y: number
  z: number
  w: number // along x
  d: number // along y
  h: number // up
}

// The faces a viewer sees: the top, the face towards +y (lower left on
// screen) and the face towards +x (lower right).
export function boxFaces({ x, y, z, w, d, h }: Box): { top: string; left: string; right: string } {
  const top = z + h
  return {
    top: polygon([[x, y, top], [x + w, y, top], [x + w, y + d, top], [x, y + d, top]]),
    left: polygon([[x, y + d, z], [x + w, y + d, z], [x + w, y + d, top], [x, y + d, top]]),
    right: polygon([[x + w, y, z], [x + w, y + d, z], [x + w, y + d, top], [x + w, y, top]]),
  }
}

// Mix a colour towards white (amount > 0) or black (amount < 0), so one
// base colour gives the lit top and the two shaded sides of a box.
export function shade(hex: string, amount: number): string {
  const target = amount < 0 ? 0 : 255
  const t = Math.abs(amount)
  const channels = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16))
  return `#${channels
    .map((c) => Math.round(c + (target - c) * t))
    .map((c) => c.toString(16).padStart(2, '0'))
    .join('')}`
}

interface Located {
  code: string
  latitude: string | null
  longitude: string | null
}

export interface CampusSpot<T> {
  code: string
  x: number // metres
  y: number
  building: T
}

const METRES_PER_DEGREE = 111_320

// Real coordinates to ground metres around the campus centre, ordered back
// to front.
//
// The campus is long and narrow, so the model is turned until its long
// side runs along the base, with the northern end at the back. Turning
// keeps every distance between buildings as it is; only the viewing angle
// changes. x and y are then the ground axes of the model.
export function campusLayout<T extends Located>(buildings: T[]): CampusSpot<T>[] {
  const placed = buildings.filter((b) => b.latitude !== null && b.longitude !== null)
  if (placed.length === 0) return []
  const lats = placed.map((b) => Number(b.latitude))
  const lons = placed.map((b) => Number(b.longitude))
  const lat0 = lats.reduce((a, b) => a + b) / lats.length
  const lon0 = lons.reduce((a, b) => a + b) / lons.length
  const lonScale = Math.cos((lat0 * Math.PI) / 180)
  const east = lons.map((lon) => (lon - lon0) * METRES_PER_DEGREE * lonScale)
  const north = lats.map((lat) => (lat - lat0) * METRES_PER_DEGREE)

  // The direction the buildings spread the most (the main axis of the
  // point cloud), then the turn that points it away from the viewer.
  let xx = 0
  let yy = 0
  let xy = 0
  for (let i = 0; i < placed.length; i++) {
    xx += east[i] ** 2
    yy += north[i] ** 2
    xy += east[i] * north[i]
  }
  const axis = 0.5 * Math.atan2(2 * xy, xx - yy) // angle from east
  let turn = Math.PI / 2 - axis
  // Keep the north at the back: if the turn sends it forward, turn half round.
  const along = (i: number, t: number) => east[i] * Math.sin(t) + north[i] * Math.cos(t)
  if (placed.reduce((sum, _, i) => sum + north[i] * along(i, turn), 0) < 0) turn += Math.PI

  return placed
    .map((b, i) => {
      const across = east[i] * Math.cos(turn) - north[i] * Math.sin(turn)
      return { code: b.code, x: across, y: -along(i, turn), building: b }
    })
    .sort((a, b) => a.x + a.y - (b.x + b.y))
}

// SVG path data through the given 3D points, closed. Several shapes can be
// joined into one path, which keeps the page light (one element, not 40).
export function pathOf(points: Point3[]): string {
  return `M${polygon(points).replaceAll(' ', 'L')}Z`
}

export interface Bounds {
  x: number
  y: number
  width: number
  height: number
}

// The smallest screen rectangle around the given 3D points, with padding.
export function screenBounds(points: Point3[], pad: { top: number; side: number; bottom: number }): Bounds {
  const projected = points.map(project)
  const xs = projected.map(([x]) => x)
  const ys = projected.map(([, y]) => y)
  const minX = Math.min(...xs) - pad.side
  const minY = Math.min(...ys) - pad.top
  return {
    x: round(minX),
    y: round(minY),
    width: round(Math.max(...xs) + pad.side - minX),
    height: round(Math.max(...ys) + pad.bottom - minY),
  }
}
