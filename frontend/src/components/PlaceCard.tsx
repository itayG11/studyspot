import type { CSSProperties } from 'react'
import { Link } from 'react-router'
import type { Place } from '../api/types'
import { floorLabel, KIND_LABELS } from '../i18n/labels'
import { LEVEL_COLORS, placeLevel } from '../logic/occupancy'
import { availabilityText, KIND_COLORS } from '../logic/places'
import styles from '../pages/pages.module.css'
import { OpenBadge } from './Availability'
import { Meter } from './ui/Meter'

export function PlaceCard({ place, index = 0 }: { place: Place; index?: number }) {
  const level = placeLevel(place)
  const showMeter = place.is_open && place.kind !== 'group_room'
  return (
    <li className="rise" style={{ '--i': index } as CSSProperties}>
      <Link
        to={`/places/${place.id}`}
        className={styles.card}
        style={{ '--kind': KIND_COLORS[place.kind] } as CSSProperties}
        viewTransition
      >
        <span className={styles.cardTitle}>
          {place.name}
          <OpenBadge isOpen={place.is_open} />
        </span>
        <span className={styles.cardMeta}>
          {KIND_LABELS[place.kind]} · בניין {place.building_code} · {floorLabel(place.floor)}
        </span>
        <span className={styles.cardAvailability}>{availabilityText(place)}</span>
        {showMeter && <Meter taken={place.occupied} total={place.capacity} color={LEVEL_COLORS[level]} />}
      </Link>
    </li>
  )
}
