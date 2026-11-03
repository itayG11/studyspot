// The campus map: one coloured circle per building, on a street map or an
// aerial photo. Leaflet does the drawing; react-leaflet wraps it in components.

import 'leaflet/dist/leaflet.css'
import { latLngBounds } from 'leaflet'
import { useEffect } from 'react'
import { CircleMarker, MapContainer, Tooltip, useMap } from 'react-leaflet'
import type { Building } from '../api/types'
import styles from './map.module.css'
import { LEVEL_COLORS, occupancyLevel, position, SELECTED_COLOR } from '../logic/occupancy'
import { MAX_ZOOM } from './tiles'
import { circleStyle } from './circleStyle'
import { BaseLayers } from './layers'

// PickMap (the admin's) takes the tile layer from here.
export { SourceLayer } from './layers'

interface Props {
  buildings: Building[] // only buildings that have a position
  selected: string | null
  onSelect: (code: string) => void
  flyToSelected?: boolean // move the map to the chosen building
}

export function CampusMap({ buildings, selected, onSelect, flyToSelected = false }: Props) {
  const points = buildings.map((b) => position(b)!)
  // The first view fits every building, with a little room around them.
  const bounds = latLngBounds(points).pad(0.25)

  return (
    // Leaflet is built for left-to-right pages, so the map itself stays LTR.
    <div dir="ltr" className={styles.frame}>
      <MapContainer bounds={bounds} maxZoom={MAX_ZOOM} scrollWheelZoom className={styles.map}>
        <BaseLayers switcher />

        {flyToSelected && <FlyTo target={points[buildings.findIndex((b) => b.code === selected)] ?? null} />}
        {buildings.map((building, i) => {
          const level = occupancyLevel(building)
          const isSelected = building.code === selected
          return (
            <CircleMarker
              // A new key when selection changes makes Leaflet redraw the
              // path with the pulsing class (it only reads className once).
              key={`${building.code}-${isSelected}`}
              center={points[i]}
              radius={isSelected ? 24 : 20}
              pathOptions={{
                ...circleStyle(level, isSelected ? SELECTED_COLOR : '#ffffff', isSelected ? 4 : 3),
                className: isSelected ? 'marker-selected' : undefined,
              }}
              eventHandlers={{ click: () => onSelect(building.code) }}
            >
              <Tooltip
                permanent
                direction="center"
                className={level === 'construction' ? 'map-label map-label-dark' : 'map-label'}
              >
                {/* As a pin in Apple Maps: the building, and how many places are free in it now. */}
                <span className="map-code">{building.code}</span>
                {level !== 'construction' && <span className="map-free">{building.available}</span>}
              </Tooltip>
            </CircleMarker>
          )
        })}
      </MapContainer>
      <div className={styles.live} aria-hidden="true">
        <span className={styles.liveDot} />
        מתעדכן כל 30 שניות
      </div>
      {/* What the colours mean, and the number in each circle. */}
      <ul className={styles.legend} aria-label="מקרא המפה">
        <li><span className={styles.swatch} style={{ background: LEVEL_COLORS.low }} />פנוי</li>
        <li><span className={styles.swatch} style={{ background: LEVEL_COLORS.medium }} />בינוני</li>
        <li><span className={styles.swatch} style={{ background: LEVEL_COLORS.high }} />עמוס</li>
        <li className={styles.legendNote}>המספר: מקומות פנויים עכשיו</li>
      </ul>
    </div>
  )
}

// Flies to a building when it is chosen. With "reduce motion", it jumps.
const FLY_ZOOM = 18
function FlyTo({ target }: { target: [number, number] | null }) {
  const map = useMap()
  const [lat, lng] = target ?? [null, null]
  useEffect(() => {
    if (lat === null || lng === null) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) map.setView([lat, lng], FLY_ZOOM)
    else map.flyTo([lat, lng], FLY_ZOOM, { duration: 0.9 })
  }, [map, lat, lng])
  return null
}
