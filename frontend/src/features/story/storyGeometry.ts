// How the story's progress is divided, and where scrolling may rest (see StoryScroller.tsx).

// How the story's progress (0..1) is divided. On a phone each move is longer: a
// photo rose over a quarter of a screen of scrolling, and a hard flick (about 100px a
// frame) went past it in two frames, or stopped halfway (found 4 Nov from an Android
// report). Now it takes about half a screen, and the story is taller to fit (story.module.css).
export interface Geometry {
  roomsFrom: number // where the first room starts to rise
  roomSpan: number // from one room's start to the next
  enter: number // how long a photo takes to rise over the one before it
}
export const WIDE_GEOMETRY: Geometry = { roomsFrom: 0.24, roomSpan: 0.17, enter: 0.06 }
export const TALL_GEOMETRY: Geometry = { roomsFrom: 0.22, roomSpan: 0.17, enter: 0.09 }
const OPENING_FROM = 0.02 // the photo starts to open from its card...
const OPENING_TO = 0.16 // ...and the panel with the number has arrived

// The stretches of progress where something is on its way (the opening, and each
// photo rising). Resting inside one is a half-finished picture.
export function transitionWindows({ roomsFrom, roomSpan, enter }: Geometry, rooms: number): [number, number][] {
  const windows: [number, number][] = [[OPENING_FROM, OPENING_TO]]
  for (let i = 0; i < rooms; i++) windows.push([roomsFrom + i * roomSpan, roomsFrom + i * roomSpan + enter])
  return windows
}

// Where scrolling should come to rest: the nearest end of the stretch it stopped in,
// or where it is when it stopped outside all of them.
export function restingPoint(progress: number, windows: [number, number][]): number {
  for (const [from, to] of windows) {
    if (progress > from && progress < to) return progress - from < to - progress ? from : to
  }
  return progress
}

