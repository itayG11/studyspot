// The motion language in numbers, for Motion components. The CSS side has
// the same values in tokens.css (--ease-out, --dur-ui, ...).
//
// Rules:
// - Animate transform and opacity only; they skip layout and paint.
// - Things that enter use ease-out; things that move on screen ease-in-out.
// - Leaving is quicker than arriving.
// - Keyboard actions and filters that change many times are not animated.
// - With "reduce motion" on, Motion drops the movement and keeps fades
//   (reducedMotion="user" in MotionProvider).

import type { Transition } from 'motion/react'

export const EASE_OUT = [0.23, 1, 0.32, 1] as const
export const EASE_IN_OUT = [0.77, 0, 0.175, 1] as const
export const EASE_DRAWER = [0.32, 0.72, 0, 1] as const

export const DURATION = {
  press: 0.12,
  ui: 0.22,
  exit: 0.16,
  sheet: 0.38,
} as const

// A screen-to-screen move (the card that grows into the space page): a
// spring keeps its speed if interrupted, and a little bounce feels physical.
export const SPRING: Transition = { type: 'spring', duration: 0.45, bounce: 0.15 }

export const ENTER: Transition = { duration: DURATION.ui, ease: EASE_OUT }
export const EXIT: Transition = { duration: DURATION.exit, ease: EASE_OUT }
