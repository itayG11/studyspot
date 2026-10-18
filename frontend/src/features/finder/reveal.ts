// The finder's tilt as it rises (FinderReveal), as plain numbers.
//
// The finder turns about its top edge, so its lower part leans toward the
// viewer: a point h below the edge comes h·sin(tilt) closer. Once that
// reaches the perspective distance, the point is drawn infinitely large.
// With 1400 px and 16° that is 5,079 px down, and on a phone the finder, one
// long column of cards, is taller: its end was drawn twenty times its size
// and the page grew to 100,000 px (the accessibility check then crashed the
// browser, CI run 97). So the distance grows with a tall finder.

export const MAX_TILT_DEG = 16
const DESIGN_PERSPECTIVE = 1400
// One and a half times the closest point: the far end is drawn three times
// its size at most, and FinderReveal clips that, so the page keeps its
// length. Small enough that a computer's finder (about 2,800 px) keeps the
// design's 1400 px.
const MARGIN = 1.5

export function revealPerspective(height: number): number {
  const closest = height * Math.sin((MAX_TILT_DEG * Math.PI) / 180)
  return Math.max(DESIGN_PERSPECTIVE, Math.ceil(MARGIN * closest))
}

// v: how far the finder has risen, 0 at the bottom of the window, 1 in place.
export function revealTransform(v: number, height: number): string {
  if (v >= 1) return 'none'
  return `perspective(${revealPerspective(height)}px) rotateX(${((1 - v) * MAX_TILT_DEG).toFixed(2)}deg) scale(${(0.94 + 0.06 * v).toFixed(3)})`
}
