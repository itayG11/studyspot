import { m, useReducedMotionConfig, useScroll, useTransform } from 'motion/react'
import { useRef, type ReactNode } from 'react'

// The finder rises tilted back, like a screen being set upright, and is
// flat by the time its top reaches the upper third of the window. At the
// end the transform is removed altogether, so the sticky search bar inside
// behaves as on any page. With "reduce motion", there is no tilt.
export function FinderReveal({ children }: { children: ReactNode }) {
  const box = useRef<HTMLDivElement>(null)
  const reduce = useReducedMotionConfig()
  const { scrollYProgress } = useScroll({ target: box, offset: ['start end', 'start 30%'] })
  const transform = useTransform(scrollYProgress, (v) =>
    v >= 1 ? 'none' : `perspective(1400px) rotateX(${((1 - v) * 16).toFixed(2)}deg) scale(${(0.94 + 0.06 * v).toFixed(3)})`,
  )
  return (
    <m.div ref={box} style={reduce ? undefined : { transform, transformOrigin: '50% 0%' }}>
      {children}
    </m.div>
  )
}
