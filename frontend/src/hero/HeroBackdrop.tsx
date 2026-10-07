// The real aerial photo of the campus behind the hero, with each building's
// code as a small sign. Nothing here can be clicked or dragged: it is a
// picture that the scroll animation zooms into.

import { latLngBounds } from 'leaflet'
import type { CSSProperties } from 'react'
import { CircleMarker, MapContainer, Tooltip } from 'react-leaflet'
import type { Building } from '../api/types'
import { LEVEL_COLORS, occupancyLevel, position } from '../logic/occupancy'
import { SourceLayer } from '../map/CampusMap'
import { AERIAL } from '../map/tiles'
import styles from './hero.module.css'

export function HeroBackdrop({ buildings }: { buildings: Building[] }) {
  const placed = buildings.filter((b) => position(b) !== null)
  if (placed.length === 0) return null
  const points = placed.map((b) => position(b)!)
  // Start far out, so the scroll has room to "land" on the campus.
  const bounds = latLngBounds(points).pad(1.2)

  return (
    <div dir="ltr" className={styles.backdrop} aria-hidden="true">
      <MapContainer
        bounds={bounds}
        className={styles.backdropMap}
        zoomControl={false}
        attributionControl={false}
        dragging={false}
        scrollWheelZoom={false}
        doubleClickZoom={false}
        touchZoom={false}
        boxZoom={false}
        keyboard={false}
      >
        <SourceLayer source={AERIAL} />
        {placed.map((building, i) => {
          const level = occupancyLevel(building)
          return (
            <CircleMarker
              key={building.code}
              center={points[i]}
              radius={1}
              interactive={false}
              pathOptions={{ opacity: 0, fillOpacity: 0 }}
            >
              <Tooltip permanent direction="center" className="hero-pin">
                <span
                  className={level === 'construction' ? `${styles.pin} ${styles.pinConstruction}` : styles.pin}
                  style={{ '--i': i, '--pin': LEVEL_COLORS[level] } as CSSProperties}
                >
                  {building.code}
                </span>
              </Tooltip>
            </CircleMarker>
          )
        })}
      </MapContainer>
    </div>
  )
}
