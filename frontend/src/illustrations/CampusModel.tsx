// The campus as a small isometric model on a base, with the Galilee hills
// behind it. Positions and floors are real; the shapes are not, and the
// model says so in its corner.

import { useId } from 'react'
import { campusGeometry, FLOOR_HEIGHT, type CampusBuilding, type PlacedBuilding, type Tree } from './campus'
import { boxFaces, pathOf, polygon, project, shade, type Point3 } from './iso'
import { PinMark } from './Pin'
import styles from './illustrations.module.css'

const STONE = '#f2ede2'
const GLASS = '#55657f'
const LAWN = '#9cc07a'
const SOIL = '#b9a98a'
const LEAF = '#6f9f55'

interface CampusModelProps {
  buildings: CampusBuilding[]
  pinAt?: string // a building code: the pin stands on its roof
  label?: string
  className?: string
}

export function CampusModel({ buildings, pinAt, label = 'המחשה של הקמפוס', className }: CampusModelProps) {
  const geometry = campusGeometry(buildings)
  const id = useId()
  if (!geometry) return null
  const { ground, walk, items, bounds } = geometry
  const base = boxFaces(ground)
  const pinned = geometry.buildings.find((b) => b.code === pinAt)
  const viewBox = `${bounds.x} ${bounds.y} ${bounds.width} ${bounds.height}`

  return (
    <svg viewBox={viewBox} className={[styles.svg, className].filter(Boolean).join(' ')} role="img" aria-label={`${label}. המיקומים והקומות אמיתיים, הצורות לא.`}>
      <g data-layer="hills">
        <Hills bounds={bounds} id={id} />
      </g>

      <g data-layer="model">
        <polygon points={base.top} fill={LAWN} />
        <polygon points={base.left} fill={SOIL} />
        <polygon points={base.right} fill={shade(SOIL, -0.18)} />
        <polyline points={polygon(walk)} className={styles.walk} />
        {items.map((item) =>
          item.kind === 'building' ? (
            <BuildingShape key={item.building.code} building={item.building} />
          ) : (
            <TreeShape key={`${item.tree.x},${item.tree.y}`} tree={item.tree} />
          ),
        )}
      </g>

      <g data-layer="labels" className={styles.labels}>
        {geometry.buildings.map(({ code, roof }) => (
          <g key={code} transform={`translate(${roof[0]} ${roof[1] - 12})`}>
            <rect x={-6 - code.length * 4} y="-9" width={12 + code.length * 8} height="16" rx="8" className={styles.labelPlate} />
            <text y="3" textAnchor="middle" className={styles.labelText}>
              {code}
            </text>
          </g>
        ))}
      </g>

      {pinned && (
        <g data-layer="pin" transform={`translate(${pinned.roof[0]} ${pinned.roof[1] - 24})`}>
          <PinMark scale={1.3} />
        </g>
      )}

      <text x={bounds.x + bounds.width - 12} y={bounds.y + bounds.height - 10} textAnchor="start" className={styles.caption}>
        המחשה · המיקומים והקומות אמיתיים, הצורות לא
      </text>
    </svg>
  )
}

function BuildingShape({ building }: { building: PlacedBuilding }) {
  const { box, floors, status } = building
  const faces = boxFaces(box)
  const building_ = status === 'under_construction'
  const stone = building_ ? '#ddd6c8' : STONE
  return (
    <g data-building={building.code}>
      {/* Late-morning sun from the upper left: the left face is lit, the
          right face is in shade, and a soft shadow falls to the right. */}
      <polygon
        points={boxFaces({ ...box, x: box.x + 6, y: box.y - 4, h: 0.01 }).top}
        fill="rgb(20 32 58 / 14%)"
      />
      <polygon points={faces.left} fill={shade(stone, -0.08)} />
      <polygon points={faces.right} fill={shade(stone, -0.2)} />
      <polygon points={faces.top} fill={shade(stone, 0.4)} />
      {!building_ && (
        <>
          <path d={windows(box, floors, 'left')} fill={GLASS} opacity="0.85" />
          <path d={windows(box, floors, 'right')} fill={shade(GLASS, -0.25)} opacity="0.85" />
        </>
      )}
      {building_ && <Scaffold building={building} />}
    </g>
  )
}

// Rows of windows, one row per floor, on the face towards +y ("left") or +x ("right").
function windows({ x, y, w, d }: PlacedBuilding['box'], floors: number, face: 'left' | 'right'): string {
  const length = face === 'left' ? w : d
  const count = Math.floor(length / 5)
  const gap = length / count
  const shapes: string[] = []
  for (let f = 0; f < Math.max(floors, 1); f++) {
    const z0 = f * FLOOR_HEIGHT + 1.3
    const z1 = z0 + 2.1
    for (let i = 0; i < count; i++) {
      const a = i * gap + gap * 0.22
      const b = a + gap * 0.56
      const at = (t: number, z: number): Point3 => (face === 'left' ? [x + t, y + d, z] : [x + w, y + t, z])
      shapes.push(pathOf([at(a, z0), at(b, z0), at(b, z1), at(a, z1)]))
    }
  }
  return shapes.join('')
}

// Under construction: scaffolding lines and a crane, instead of windows.
function Scaffold({ building }: { building: PlacedBuilding }) {
  const { x, y, w, d, h } = building.box
  const lines: string[] = []
  for (let z = 0; z <= h; z += FLOOR_HEIGHT) {
    lines.push(pathOf([[x, y + d, z], [x + w, y + d, z], [x + w, y, z]]).replace('Z', ''))
  }
  for (let t = 0; t <= w; t += w / 6) lines.push(pathOf([[x + t, y + d, 0], [x + t, y + d, h]]).replace('Z', ''))
  for (let t = 0; t <= d; t += d / 4) lines.push(pathOf([[x + w, y + t, 0], [x + w, y + t, h]]).replace('Z', ''))
  const mast: Point3 = [x + w * 0.25, y + d * 0.3, 0]
  const top: Point3 = [mast[0], mast[1], h + 22]
  const jibEnd: Point3 = [mast[0] + 30, mast[1], h + 22]
  const back: Point3 = [mast[0] - 9, mast[1], h + 22]
  const [tx, ty] = project(top)
  return (
    <g className={styles.scaffold}>
      <path d={lines.join('')} />
      <path d={`${pathOf([mast, top]).replace('Z', '')}${pathOf([back, jibEnd]).replace('Z', '')}`} className={styles.crane} />
      <circle cx={tx} cy={ty} r="1.6" className={styles.craneTop} />
    </g>
  )
}

function TreeShape({ tree }: { tree: Tree }) {
  const [x, y] = project([tree.x, tree.y, 0])
  const r = 5.5 * tree.size
  return (
    <g transform={`translate(${x} ${y})`}>
      <ellipse cx="3" cy="1" rx={r} ry={r * 0.4} fill="rgb(20 32 58 / 14%)" />
      <rect x="-0.8" y={-r * 1.1} width="1.6" height={r * 1.1} fill="#7a6247" />
      <circle cx="0" cy={-r * 1.5} r={r} fill={LEAF} />
      <circle cx={r * 0.3} cy={-r * 1.75} r={r * 0.55} fill={shade(LEAF, 0.18)} />
    </g>
  )
}

// Three soft ridges, the farthest the palest: the Galilee hills behind the
// campus. Each one fades out downwards, into the haze behind the model.
function Hills({ bounds, id }: { bounds: { x: number; y: number; width: number }; id: string }) {
  const { x, y, width } = bounds
  const ridge = (base: number, amp: number, phase: number) => {
    const points: string[] = []
    const steps = 12
    for (let i = 0; i <= steps; i++) {
      const px = x + (width * i) / steps
      const py = y + base - amp * (0.6 + 0.4 * Math.sin(i * 0.9 + phase)) * Math.sin((Math.PI * i) / steps + 0.3)
      points.push(`${px.toFixed(1)},${py.toFixed(1)}`)
    }
    return `M${x},${y + base + 60}L${points.join('L')}L${x + width},${y + base + 60}Z`
  }
  const ridges = [
    { base: 120, amp: 90, phase: 0.4, opacity: 0.5 },
    { base: 145, amp: 70, phase: 2.1, opacity: 0.75 },
    { base: 170, amp: 55, phase: 4.0, opacity: 0.95 },
  ]
  return (
    <>
      <defs>
        {ridges.map((r, i) => (
          <linearGradient key={i} id={`${id}-ridge${i}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0.35" stopColor="var(--hills)" stopOpacity={r.opacity} />
            <stop offset="1" stopColor="var(--hills)" stopOpacity="0" />
          </linearGradient>
        ))}
      </defs>
      {ridges.map((r, i) => (
        <path key={i} d={ridge(r.base, r.amp, r.phase)} fill={`url(#${id}-ridge${i})`} />
      ))}
    </>
  )
}
