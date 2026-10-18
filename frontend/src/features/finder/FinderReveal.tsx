import { m, useMotionValue, useReducedMotionConfig, useScroll, useTransform } from 'motion/react'
import { useEffect, useRef, type ReactNode } from 'react'
import { revealTransform } from './reveal'

// The finder rises tilted back, like a screen being set upright, and is
// flat by the time its top reaches the upper third of the window. At the
// end the transform is removed altogether, so the sticky search bar inside
// behaves as on any page. With "reduce motion", there is no tilt.
// The tilt depends on the finder's height (logic in ./reveal), and the
// wrapper clips what the tilt draws past the finder, so the page never
// grows because of it. A clip is not a scroll container: the sticky bar
// inside still sticks to the window.
export function FinderReveal({ children }: { children: ReactNode }) {
  const box = useRef<HTMLDivElement>(null)
  const reduce = useReducedMotionConfig()
  const { scrollYProgress } = useScroll({ target: box, offset: ['start end', 'start 30%'] })
  // A motion value, so the cards arriving (a taller finder, no scroll yet)
  // updates the tilt too. Measured off the scroll path: reading it in the
  // transform would cost a layout on every frame.
  const height = useMotionValue(0)
  const transform = useTransform([scrollYProgress, height], ([v, h]: number[]) => revealTransform(v, h))

  useEffect(() => {
    const element = box.current
    if (!element) return
    height.set(element.offsetHeight)
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(() => height.set(element.offsetHeight))
    observer.observe(element)
    return () => observer.disconnect()
  }, [height])

  return (
    <div style={{ overflow: 'clip' }}>
      <m.div ref={box} style={reduce ? undefined : { transform, transformOrigin: '50% 0%' }}>
        {children}
      </m.div>
    </div>
  )
}
