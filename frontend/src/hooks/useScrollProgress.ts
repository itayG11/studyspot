// Writes how far a section has been scrolled (0 to 1) into the CSS variable
// --progress on that section. The CSS then moves and fades things with it.
//
// No React state is involved: changing a CSS variable does not re-render
// anything, and the browser animates transform and opacity on the GPU.
// The value is updated at most once per frame (requestAnimationFrame), and
// only when it changed. data-landed marks the end of the headline's fade.

import { useEffect, type RefObject } from 'react'
import { isLanded, progressFor } from '../logic/scroll'

export function useScrollProgress(ref: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    const element = ref.current
    if (!element) return
    let frame = 0
    let last = ''

    const update = () => {
      frame = 0
      const box = element.getBoundingClientRect()
      const progress = progressFor(box.top, box.height, window.innerHeight)
      const value = progress.toFixed(3)
      if (value === last) return // below the hero it stays 1: nothing to do
      last = value
      element.style.setProperty('--progress', value)
      element.toggleAttribute('data-landed', isLanded(progress))
    }
    const schedule = () => {
      if (frame === 0) frame = requestAnimationFrame(update)
    }

    update()
    window.addEventListener('scroll', schedule, { passive: true })
    window.addEventListener('resize', schedule)
    return () => {
      window.removeEventListener('scroll', schedule)
      window.removeEventListener('resize', schedule)
      cancelAnimationFrame(frame)
    }
  }, [ref])
}
