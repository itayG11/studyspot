// "Where is it": a small map of the building this place is in, with the
// building's name and how many places are free in it now. For every kind of
// place, booked ahead or not. The building comes with the place (PlaceDetail);
// a building not yet on the map has no card at all.

import { lazy, Suspense } from 'react'
import { Link } from 'react-router'
import type { PlaceDetail } from '../../api/types'
import { floorLabel } from '../../i18n/labels'
import { useInstitution } from '../../institution'
import { position } from '../../logic/occupancy'
import { PLACE_MAP_HEIGHT } from '../../map/placeMapSize'
import { Skeleton } from '../../ui'
import styles from './space.module.css'

// Leaflet is loaded only when a place's page shows its map.
const PlaceMap = lazy(() => import('../../map/PlaceMap'))

export function PlaceLocation({ place, className = styles.card }: { place: PlaceDetail; className?: string }) {
  const { slug } = useInstitution()
  const building = place.building // comes with the place, so it refreshes with it
  if (!position(building)) return null
  const free = building.available
  return (
    <section className={className} aria-labelledby="where">
      <h2 id="where" className={styles.h2}>
        איפה זה
      </h2>
      <div role="group" aria-label={`מפה: בניין ${building.code}`}>
        <Suspense fallback={<Skeleton height={`${PLACE_MAP_HEIGHT}px`} radius="var(--r-lg)" />}>
          <PlaceMap building={building} />
        </Suspense>
      </div>
      <p className={styles.muted}>
        בניין {building.code}
        {building.name && `, ${building.name}`} · {floorLabel(place.floor)} · {free} מקומות פנויים בבניין עכשיו
      </p>
      <Link to={`/${slug}?view=map#finder-map`} className={styles.locationLink}>
        לכל המקומות במפת הקמפוס
      </Link>
    </section>
  )
}
