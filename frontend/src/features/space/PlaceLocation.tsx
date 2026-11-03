// "Where is it": a small map of the building this place is in, with the
// building's name and how many places are free in it now. For every kind of
// place, booked ahead or not. The positions come from the buildings list the
// home page already loads; a building not yet on the map has no card at all.

import { lazy, Suspense } from 'react'
import { Link } from 'react-router'
import { getBuildings } from '../../api/campus'
import type { PlaceDetail } from '../../api/types'
import { REFRESH_INTERVAL_MS } from '../../config'
import { useApi } from '../../hooks/useApi'
import { floorLabel } from '../../i18n/labels'
import { useInstitution } from '../../institution'
import { position } from '../../logic/occupancy'
import { Skeleton } from '../../ui'
import styles from './space.module.css'

// Leaflet is loaded only when a place's page shows its map.
const PlaceMap = lazy(() => import('../../map/PlaceMap'))

export function PlaceLocation({ place, className = styles.card }: { place: PlaceDetail; className?: string }) {
  const { slug } = useInstitution()
  const buildings = useApi(() => getBuildings(slug), `buildings-${slug}`, REFRESH_INTERVAL_MS)
  const building = buildings.data?.find((b) => b.code === place.building_code)
  if (!building || !position(building)) return null
  const free = building.available
  return (
    <section className={className} aria-labelledby="where">
      <h2 id="where" className={styles.h2}>
        איפה זה
      </h2>
      <div role="group" aria-label={`מפה: בניין ${building.code}`}>
        <Suspense fallback={<Skeleton height="220px" radius="var(--r-lg)" />}>
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
