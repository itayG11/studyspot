// How far the visitor has scrolled through a tall section, from 0 to 1.
//
// top:      the section's top edge relative to the window (negative once
//           it has scrolled up past the top of the window)
// height:   the section's full height
// viewport: the window's height
//
// The section can scroll (height - viewport) pixels before its bottom edge
// reaches the bottom of the window; that distance is the whole range.
// From this point the headline and its buttons have faded out completely
// (see .content in hero.module.css), so they must stop taking clicks and
// keyboard focus too.
export const LANDED_FROM = 0.4

export function isLanded(progress: number): boolean {
  return progress >= LANDED_FROM
}

export function progressFor(top: number, height: number, viewport: number): number {
  const range = height - viewport
  if (range <= 0) return 1
  return Math.min(Math.max(-top / range, 0), 1)
}
