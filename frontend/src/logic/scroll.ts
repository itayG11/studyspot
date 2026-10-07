// How far the visitor has scrolled through a tall section, from 0 to 1.
//
// top:      the section's top edge relative to the window (negative once
//           it has scrolled up past the top of the window)
// height:   the section's full height
// viewport: the window's height
//
// The section can scroll (height - viewport) pixels before its bottom edge
// reaches the bottom of the window; that distance is the whole range.
export function progressFor(top: number, height: number, viewport: number): number {
  const range = height - viewport
  if (range <= 0) return 1
  return Math.min(Math.max(-top / range, 0), 1)
}
