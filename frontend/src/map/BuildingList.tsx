// The buildings as a departures-style board next to the map: the same
// information as the map, readable with a screen reader or on a small phone.

import type { CSSProperties } from 'react'
import type { Building } from '../api/types'
import { BuildingTile } from '../components/ui/BuildingTile'
import { Count } from '../components/ui/Count'
import { Meter } from '../components/ui/Meter'
import styles from './map.module.css'
import { LEVEL_COLORS, LEVEL_LABELS, occupancyLevel, type Level } from '../logic/occupancy'
import { buildingSummary } from '../logic/places'

interface Props {
  buildings: Building[]
  selected: string | null
  onSelect: (code: string) => void
  startIndex?: number // continues the entrance stagger of a list above
}

export function BuildingList({ buildings, selected, onSelect, startIndex = 0 }: Props) {
  return (
    <ul className={styles.board} aria-label="בניינים">
      {buildings.map((building, i) => {
        const level = occupancyLevel(building)
        const hasSeats = building.capacity > 0
        return (
          <li key={building.code} className="rise" style={{ '--i': startIndex + i } as CSSProperties}>
            <button
              type="button"
              className={styles.row}
              aria-pressed={building.code === selected}
              onClick={() => onSelect(building.code)}
            >
              <BuildingTile code={building.code} level={level} />
              <span className={styles.rowText}>
                <span className={styles.rowTitle}>בניין {building.code}</span>
                <span className={styles.rowSummary}>{hasSeats ? LEVEL_LABELS[level] : buildingSummary(building)}</span>
                {hasSeats && <Meter taken={building.occupied} total={building.capacity} color={LEVEL_COLORS[level]} />}
              </span>
              {hasSeats && (
                <span aria-label={buildingSummary(building)}>
                  <Count value={building.available} className={styles.rowCount} />
                  <span className={`num ${styles.rowTotal}`}>/{building.capacity}</span>
                </span>
              )}
            </button>
          </li>
        )
      })}
    </ul>
  )
}

const LEGEND: Level[] = ['low', 'medium', 'high', 'closed', 'construction']

export function Legend() {
  return (
    <ul className={styles.legend} aria-label="מקרא">
      {LEGEND.map((level) => (
        <li key={level}>
          <span
            className={level === 'construction' ? `${styles.swatch} ${styles.swatchConstruction}` : styles.swatch}
            style={{ background: LEVEL_COLORS[level] }}
          />
          {LEVEL_LABELS[level]}
        </li>
      ))}
    </ul>
  )
}
