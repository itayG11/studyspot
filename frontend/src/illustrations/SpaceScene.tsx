// Four cutaway rooms, one per kind of place, each in its own light:
// sun in the open area, screen glow in the computer lab, a warm lamp in the
// group room and soft paper light in the library.
//
// Every scene has the same layers (data-layer), so the home page story can
// move them at different speeds for depth: the room, the furniture, the light.

import { useId, type ReactNode } from 'react'
import type { PlaceKind } from '../api/types'
import { KIND_LABELS } from '../i18n/labels'
import { boxFaces, polygon, project, screenBounds, shade, type Box, type Point3 } from './iso'
import styles from './illustrations.module.css'

const W = 64 // room width (x)
const D = 64 // room depth (y)
const H = 34 // wall height
const WALL = 2
const SLAB = 3

const BOUNDS = screenBounds(
  [
    [-WALL, -WALL, H],
    [W, -WALL, H],
    [-WALL, D, H],
    [W, D, -SLAB],
    [-WALL, D, -SLAB],
    [W, -WALL, -SLAB],
  ],
  { top: 6, side: 6, bottom: 6 },
)

interface Palette {
  floor: string
  wall: string
  light: string // a CSS colour, from the tokens
}

const PALETTES: Record<PlaceKind, Palette> = {
  open_area: { floor: '#dcc7a2', wall: '#f3eee4', light: 'var(--light-sun)' },
  computer_lab: { floor: '#c3c9d4', wall: '#dde2ec', light: 'var(--light-screen)' },
  group_room: { floor: '#c9b39a', wall: '#efe5d6', light: 'var(--light-lamp)' },
  library: { floor: '#d6c4a4', wall: '#f2e8d4', light: 'var(--light-paper)' },
}

export function SpaceScene({ kind, className }: { kind: PlaceKind; className?: string }) {
  const id = useId()
  const palette = PALETTES[kind]
  const scene = SCENES[kind]({ id, palette })
  const furniture = [...scene.pieces].sort((a, b) => a.depth - b.depth)
  return (
    <svg
      viewBox={`${BOUNDS.x} ${BOUNDS.y} ${BOUNDS.width} ${BOUNDS.height}`}
      className={[styles.svg, className].filter(Boolean).join(' ')}
      role="img"
      aria-label={`איור: ${KIND_LABELS[kind]}`}
      data-scene={kind}
    >
      <g data-layer="room">
        <Room palette={palette} />
        {scene.walls}
      </g>
      <g data-layer="furniture">
        {furniture.map((piece, i) => (
          <g key={i}>{piece.node}</g>
        ))}
      </g>
      <g data-layer="light" className={styles.light}>
        {scene.light}
      </g>
    </svg>
  )
}

// --- Drawing helpers ------------------------------------------------------

function Cuboid({ box, color }: { box: Box; color: string }) {
  const faces = boxFaces(box)
  return (
    <>
      <polygon points={faces.left} fill={shade(color, -0.1)} />
      <polygon points={faces.right} fill={shade(color, -0.24)} />
      <polygon points={faces.top} fill={color} />
    </>
  )
}

// A rectangle on the left wall (the plane x = 0) or the right wall (y = 0).
const onLeftWall = (y0: number, y1: number, z0: number, z1: number) =>
  polygon([[0, y0, z0], [0, y1, z0], [0, y1, z1], [0, y0, z1]])
const onRightWall = (x0: number, x1: number, z0: number, z1: number) =>
  polygon([[x0, 0, z0], [x1, 0, z0], [x1, 0, z1], [x0, 0, z1]])
const onFloor = (x0: number, y0: number, x1: number, y1: number) =>
  polygon([[x0, y0, 0.05], [x1, y0, 0.05], [x1, y1, 0.05], [x0, y1, 0.05]])

// A soft round light, centred on a 3D point.
function Glow({ id, at, r, color, opacity = 0.7 }: { id: string; at: Point3; r: number; color: string; opacity?: number }) {
  const [cx, cy] = project(at)
  return (
    <>
      <radialGradient id={id}>
        <stop offset="0" stopColor={color} stopOpacity={opacity} />
        <stop offset="1" stopColor={color} stopOpacity="0" />
      </radialGradient>
      <ellipse cx={cx} cy={cy} rx={r} ry={r * 0.62} fill={`url(#${id})`} />
    </>
  )
}

function Room({ palette }: { palette: Palette }) {
  return (
    <>
      <Cuboid box={{ x: 0, y: 0, z: -SLAB, w: W, d: D, h: SLAB }} color={palette.floor} />
      <Cuboid box={{ x: -WALL, y: -WALL, z: -SLAB, w: WALL, d: D + WALL, h: H + SLAB }} color={shade(palette.wall, -0.04)} />
      <Cuboid box={{ x: 0, y: -WALL, z: -SLAB, w: W, d: WALL, h: H + SLAB }} color={shade(palette.wall, -0.04)} />
      {/* The inner faces of the walls, lit a little differently from each other */}
      <polygon points={onLeftWall(0, D, 0, H)} fill={palette.wall} />
      <polygon points={onRightWall(0, W, 0, H)} fill={shade(palette.wall, -0.07)} />
      <polygon points={onLeftWall(0, D, 0, 1.6)} fill={shade(palette.wall, -0.18)} />
      <polygon points={onRightWall(0, W, 0, 1.6)} fill={shade(palette.wall, -0.24)} />
    </>
  )
}

interface Piece {
  depth: number // nearer pieces (larger x + y) are drawn later
  node: ReactNode
}

const piece = (x: number, y: number, node: ReactNode): Piece => ({ depth: x + y, node })

// A chair: a seat block with a back on the given side.
function chair(x: number, y: number, color: string, backAt: 'x-' | 'x+' | 'y-' | 'y+'): Piece {
  const seat = { x, y, z: 0, w: 4.5, d: 4.5, h: 4.5 }
  const back: Box = {
    'x-': { x, y, z: 4.5, w: 0.9, d: 4.5, h: 5 },
    'x+': { x: x + 3.6, y, z: 4.5, w: 0.9, d: 4.5, h: 5 },
    'y-': { x, y, z: 4.5, w: 4.5, d: 0.9, h: 5 },
    'y+': { x, y: y + 3.6, z: 4.5, w: 4.5, d: 0.9, h: 5 },
  }[backAt]
  const nodes = backAt === 'x-' || backAt === 'y-' ? [back, seat] : [seat, back]
  return piece(
    x + 2,
    y + 2,
    nodes.map((box, i) => <Cuboid key={i} box={box} color={color} />),
  )
}

function plant(x: number, y: number): Piece {
  const [cx, cy] = project([x + 2.5, y + 2.5, 9])
  return piece(x + 2.5, y + 2.5, (
    <>
      <Cuboid box={{ x, y, z: 0, w: 5, d: 5, h: 5 }} color="#c8b79a" />
      <circle cx={cx} cy={cy} r="5.5" fill="#6f9f55" />
      <circle cx={cx + 2} cy={cy - 2.5} r="3.2" fill={shade('#6f9f55', 0.2)} />
    </>
  ))
}

interface SceneParts {
  walls: ReactNode
  pieces: Piece[]
  light: ReactNode
}

type SceneBuilder = (args: { id: string; palette: Palette }) => SceneParts

// --- The four rooms ------------------------------------------------------------

const RED = '#d2402e' // the atrium chairs

const openArea: SceneBuilder = ({ id, palette }) => {
  const panes = [6, 22, 38]
  return {
    walls: (
      <>
        {panes.map((y) => (
          <g key={y}>
            <polygon points={onLeftWall(y, y + 13, 5, 30)} fill="#dcebf4" />
            <polygon points={onLeftWall(y + 6.2, y + 6.8, 5, 30)} fill={palette.wall} />
          </g>
        ))}
      </>
    ),
    pieces: [
      piece(30, 28, <Cuboid box={{ x: 22, y: 20, z: 0, w: 18, d: 14, h: 7 }} color="#b88a5c" />),
      chair(17, 22, RED, 'x-'),
      chair(17, 29, RED, 'x-'),
      chair(41, 22, RED, 'x+'),
      chair(41, 29, RED, 'x+'),
      chair(26, 35, RED, 'y+'),
      piece(50, 52, <Cuboid box={{ x: 40, y: 48, z: 0, w: 18, d: 8, h: 6 }} color="#8fa3b5" />),
      piece(48, 48, <Cuboid box={{ x: 40, y: 54, z: 6, w: 18, d: 2, h: 5 }} color="#8fa3b5" />),
      plant(56, 6),
      plant(6, 54),
    ],
    light: (
      <>
        {/* Sun through the windows, lying on the floor */}
        {panes.map((y) => (
          <polygon key={y} points={onFloor(4, y + 8, 26, y + 21)} fill="var(--light-sun)" opacity="0.45" />
        ))}
        <Glow id={`${id}-sun`} at={[10, 30, 18]} r={46} color={palette.light} opacity={0.55} />
      </>
    ),
  }
}

const computerLab: SceneBuilder = ({ id, palette }) => {
  const desks = [10, 34]
  const seats = [8, 22, 36, 50]
  return {
    walls: <polygon points={onRightWall(8, 56, 14, 26)} fill="#cfd6e2" />,
    pieces: desks.flatMap((x) => [
      piece(x + 4, 32, <Cuboid box={{ x, y: 6, z: 0, w: 8, d: 54, h: 7 }} color="#e9ecf2" />),
      ...seats.map((y) =>
        piece(x + 1.5, y + 3, (
          <>
            <Cuboid box={{ x: x + 1, y: y + 1, z: 7, w: 1, d: 8, h: 6 }} color="#2b3448" />
            {/* The screen itself, facing the viewer */}
            <polygon points={boxFaces({ x: x + 1, y: y + 1.6, z: 7.6, w: 1.05, d: 6.8, h: 4.8 }).right} fill={palette.light} />
          </>
        )),
      ),
      ...seats.map((y) => chair(x + 11, y + 2, '#3d465c', 'x+')),
    ]),
    light: (
      <>
        {desks.flatMap((x) =>
          seats.map((y) => <Glow key={`${x}-${y}`} id={`${id}-${x}-${y}`} at={[x + 5, y + 5, 10]} r={13} color={palette.light} opacity={0.75} />),
        )}
      </>
    ),
  }
}

const groupRoom: SceneBuilder = ({ id, palette }) => ({
  walls: (
    <>
      {/* A whiteboard with a few lines of notes */}
      <polygon points={onRightWall(10, 46, 10, 28)} fill="#9aa3b2" />
      <polygon points={onRightWall(11, 45, 11, 27)} fill="#fbfbfa" />
      {[24, 21, 18].map((z, i) => (
        <polygon key={z} points={onRightWall(14, 30 + i * 4, z, z + 0.6)} fill={i === 1 ? RED : '#3e5c76'} />
      ))}
      {/* A screen for presenting */}
      <polygon points={onLeftWall(18, 44, 12, 26)} fill="#2b3448" />
    </>
  ),
  pieces: [
    piece(32, 32, <Cuboid box={{ x: 20, y: 22, z: 0, w: 24, d: 18, h: 7 }} color="#a77d55" />),
    chair(15, 24, '#46506a', 'x-'),
    chair(15, 33, '#46506a', 'x-'),
    chair(45, 24, '#46506a', 'x+'),
    chair(45, 33, '#46506a', 'x+'),
    chair(24, 17, '#46506a', 'y-'),
    chair(35, 17, '#46506a', 'y-'),
    chair(24, 41, '#46506a', 'y+'),
    chair(35, 41, '#46506a', 'y+'),
    // The pendant lamp hangs above everything else in the room.
    {
      depth: Infinity,
      node: (
        <>
          <polyline points={polygon([[32, 31, H], [32, 31, 25]])} stroke="#2b3448" strokeWidth="0.6" />
          <polygon points={boxFaces({ x: 29, y: 28, z: 22, w: 6, d: 6, h: 3 }).left} fill="#2b3448" />
          <polygon points={boxFaces({ x: 29, y: 28, z: 22, w: 6, d: 6, h: 3 }).right} fill="#1d2433" />
        </>
      ),
    },
  ],
  light: (
    <>
      <Glow id={`${id}-lamp`} at={[32, 31, 10]} r={34} color={palette.light} opacity={0.8} />
    </>
  ),
})

const BOOK_COLOURS = ['#b0563f', '#3e5c76', '#c49a45', '#5d7a4f', '#7d4e6d', '#d8cfc0', '#46506a']

// A tall shelf along a wall, its front covered in book spines.
function shelf(along: 'left' | 'right', from: number, length: number): Piece {
  const box: Box =
    along === 'left' ? { x: 0, y: from, z: 0, w: 6, d: length, h: 28 } : { x: from, y: 0, z: 0, w: length, d: 6, h: 28 }
  const spines: ReactNode[] = []
  for (let row = 0; row < 5; row++) {
    const z0 = 2 + row * 5.2
    for (let i = 0, t = 0.6; t < length - 1.5; i++) {
      const width = 1 + ((i * 7 + row * 3) % 5) * 0.3
      const height = 3.6 + ((i * 5 + row) % 3) * 0.4
      const colour = BOOK_COLOURS[(i * 3 + row * 2) % BOOK_COLOURS.length]
      const points =
        along === 'left'
          ? polygon([[6.02, from + t, z0], [6.02, from + t + width, z0], [6.02, from + t + width, z0 + height], [6.02, from + t, z0 + height]])
          : polygon([[from + t, 6.02, z0], [from + t + width, 6.02, z0], [from + t + width, 6.02, z0 + height], [from + t, 6.02, z0 + height]])
      spines.push(<polygon key={`${row}-${i}`} points={points} fill={colour} />)
      t += width + 0.25
    }
  }
  return {
    depth: along === 'left' ? 3 + from : 3 + from - 40, // shelves stand against the wall, behind everything
    node: (
      <>
        <Cuboid box={box} color="#8a6a4a" />
        {spines}
      </>
    ),
  }
}

const library: SceneBuilder = ({ id, palette }) => ({
  walls: (
    <>
      <polygon points={onRightWall(40, 58, 10, 28)} fill="#e6eef2" />
      <polygon points={onRightWall(48.7, 49.3, 10, 28)} fill={palette.wall} />
    </>
  ),
  pieces: [
    shelf('left', 4, 50),
    shelf('right', 8, 26),
    piece(36, 38, <Cuboid box={{ x: 26, y: 30, z: 0, w: 22, d: 12, h: 7 }} color="#9c7650" />),
    piece(31, 34, (
      <>
        <Cuboid box={{ x: 30, y: 33, z: 7, w: 2, d: 2, h: 4 }} color="#3c6b4b" />
        <Cuboid box={{ x: 28.5, y: 32, z: 11, w: 5, d: 4, h: 1.6 }} color="#3c6b4b" />
      </>
    )),
    chair(29, 25, '#6b5038', 'y-'),
    chair(39, 25, '#6b5038', 'y-'),
    chair(29, 43, '#6b5038', 'y+'),
    chair(39, 43, '#6b5038', 'y+'),
    plant(54, 54),
  ],
  light: (
    <>
      <polygon points={onFloor(40, 4, 58, 20)} fill="var(--light-paper)" opacity="0.55" />
      <Glow id={`${id}-window`} at={[48, 8, 20]} r={34} color={palette.light} opacity={0.7} />
      <Glow id={`${id}-reading`} at={[31, 35, 9]} r={16} color="#ffe2a8" opacity={0.75} />
    </>
  ),
})

const SCENES: Record<PlaceKind, SceneBuilder> = {
  open_area: openArea,
  computer_lab: computerLab,
  group_room: groupRoom,
  library,
}
