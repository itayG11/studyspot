import { MapPin, Star } from 'lucide-react'
import type { CSSProperties } from 'react'
import { Link } from 'react-router'
import type { Place } from '../../api/types'
import { useFavorites } from '../../hooks/useFavorites'
import { AMENITY_LABELS, ATMOSPHERE_LABELS, floorLabel, KIND_LABELS } from '../../i18n/labels'
import { useInstitution } from '../../institution'
import { spaceStatus } from '../../logic/availability'
import { KIND_PHOTO } from '../../media/photos'
import { Badge, Photo } from '../../ui'
import { artTransitionName } from '../space/transition'
import { AMENITY_ICONS, topAmenities } from './amenityIcons'
import styles from './finder.module.css'

const UNIT: Record<Place['kind'], string> = {
  computer_lab: 'תאים',
  open_area: 'מקומות',
  library: 'מקומות',
  group_room: 'אנשים',
}

interface SpaceCardProps {
  place: Place
  onShowOnMap?: (buildingCode: string) => void
}

// One place, as a card. The name is the link and it covers the whole card;
// the star and "on the map" are separate buttons above it (a button inside
// a link is not valid HTML, and a screen reader could not tell them apart).
export function SpaceCard({ place, onShowOnMap }: SpaceCardProps) {
  const { timezone } = useInstitution()
  const { isFavorite, toggle } = useFavorites()
  const status = spaceStatus(place, timezone)
  const favorite = isFavorite(place.id)
  const amenities = topAmenities(place.amenities)

  return (
    <li className={styles.card}>
      {/* Named like the space page header: the browser grows one into the other. */}
      <div className={styles.art} style={{ viewTransitionName: artTransitionName(place.id) } as CSSProperties}>
        <Photo name={KIND_PHOTO[place.kind]} variant="card" decorative className={styles.artPhoto} />
      </div>
      <div className={styles.body}>
        <div className={styles.top}>
          <Badge tone={status.tone}>{status.label}</Badge>
          {place.details_are_demo && <span className={styles.demo}>נתוני דמו</span>}
        </div>
        <h3 className={styles.title}>
          <Link to={`/spaces/${place.id}`} className={styles.link} viewTransition>
            {place.name}
          </Link>
        </h3>
        <p className={styles.meta}>
          {KIND_LABELS[place.kind]} · בניין {place.building_code} · {floorLabel(place.floor)}
        </p>
        <ul className={styles.amenities} aria-label="ציוד">
          {amenities.map((amenity) => {
            const Icon = AMENITY_ICONS[amenity]
            return (
              <li key={amenity}>
                <Icon aria-hidden="true" />
                {AMENITY_LABELS[amenity]}
              </li>
            )
          })}
        </ul>
        <p className={styles.facts}>
          {ATMOSPHERE_LABELS[place.atmosphere]} · עד {place.capacity} {UNIT[place.kind]}
        </p>
      </div>
      <div className={styles.actions}>
        {onShowOnMap && (
          <button type="button" className={styles.iconButton} aria-label={`${place.name} במפה`} onClick={() => onShowOnMap(place.building_code)}>
            <MapPin aria-hidden="true" />
          </button>
        )}
        <button
          type="button"
          className={styles.iconButton}
          aria-pressed={favorite}
          aria-label={`מועדף: ${place.name}`}
          onClick={() => toggle(place.id)}
        >
          <Star aria-hidden="true" className={favorite ? styles.starOn : undefined} />
        </button>
      </div>
    </li>
  )
}
