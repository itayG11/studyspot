import { LazyMotion, MotionConfig } from 'motion/react'
import type { ReactNode } from 'react'
import { ENTER } from './motion'

const loadFeatures = () => import('./motionFeatures').then((module) => module.default)

// LazyMotion: components use the small `m` element, and the animation code
// arrives in its own chunk. strict turns a heavy `motion.div` into an error.
// reducedMotion="user": when the device asks for less motion, Motion skips
// movement and scale and keeps opacity.
export function MotionProvider({ children }: { children: ReactNode }) {
  return (
    <LazyMotion features={loadFeatures} strict>
      <MotionConfig reducedMotion="user" transition={ENTER}>
        {children}
      </MotionConfig>
    </LazyMotion>
  )
}
