// Loaded on demand by MotionProvider. domMax (not the smaller domAnimation)
// because toasts use layout animation: the others slide into place when one
// leaves. It is a separate chunk, so the first screen does not wait for it.
import { domMax } from 'motion/react'

export default domMax
