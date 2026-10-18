import type { CSSProperties, ReactNode } from 'react'
import styles from './Skeleton.module.css'

// The shape of content that is still loading. Hidden from screen readers:
// the region around it says "loading" once (see LoadingRegion).
export function Skeleton({ width = '100%', height = '1em', radius, className }: { width?: string; height?: string; radius?: string; className?: string }) {
  const style: CSSProperties = { width, height, borderRadius: radius }
  return <span className={[styles.skeleton, className].filter(Boolean).join(' ')} style={style} aria-hidden="true" />
}

// Wraps skeletons: one polite "loading" for assistive technology.
export function LoadingRegion({ label = 'טוען…', children }: { label?: string; children: ReactNode }) {
  return (
    <div role="status" aria-busy="true">
      <span className="visually-hidden">{label}</span>
      {children}
    </div>
  )
}
