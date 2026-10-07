import type { CSSProperties } from 'react'
import { LEVEL_COLORS, type Level } from '../../logic/occupancy'
import styles from './ui.module.css'

interface Props {
  code: string
  level: Level
  large?: boolean
}

export function BuildingTile({ code, level, large = false }: Props) {
  const classes = [styles.tile, large && styles.tileLarge, level === 'construction' && styles.tileConstruction]
  return (
    <span
      className={classes.filter(Boolean).join(' ')}
      style={{ '--edge': LEVEL_COLORS[level] } as CSSProperties}
      aria-hidden="true"
    >
      {code}
    </span>
  )
}
