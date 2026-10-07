// The campus map: one coloured circle per building, on a street map or an
// aerial photo. Leaflet does the drawing; react-leaflet wraps it in components.

import 'leaflet/dist/leaflet.css'
import { latLngBounds } from 'leaflet'
import { useEffect } from 'react'
import { CircleMarker, LayerGroup, LayersControl, MapContainer, TileLayer, Tooltip, useMap } from 'react-leaflet'
import type { Building } from '../api/types'
import styles from './map.module.css'
import { LEVEL_COLORS, occupancyLevel, position } from '../logic/occupancy'
import { AERIAL, AERIAL_LABELS, MAX_ZOOM, STREETS, type TileSource } from './tiles'

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
        <LayersControl position="topright">
          <LayersControl.BaseLayer checked name="תצלום אוויר">
            <LayerGroup>
              <SourceLayer source={AERIAL} />
              <SourceLayer source={AERIAL_LABELS} />
            </LayerGroup>
          </LayersControl.BaseLayer>
          <LayersControl.BaseLayer name="מפת רחובות">
            <SourceLayer source={STREETS} />
          </LayersControl.BaseLayer>
        </LayersControl>

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
              radius={isSelected ? 19 : 15}
              pathOptions={{
                // A white ring reads on both the dark photo and the light street map.
                color: isSelected ? '#ff5b14' : '#ffffff',
                weight: isSelected ? 4 : 3,
                fillColor: level === 'construction' ? '#ffcc00' : LEVEL_COLORS[level],
                fillOpacity: 0.95,
                dashArray: level === 'construction' ? '5 4' : undefined,
                className: isSelected ? 'marker-selected' : undefined,
              }}
              eventHandlers={{ click: () => onSelect(building.code) }}
            >
              <Tooltip
                permanent
                direction="center"
                className={level === 'construction' ? 'map-label map-label-dark' : 'map-label'}
              >
                {building.code}
              </Tooltip>
            </CircleMarker>
          )
        })}
      </MapContainer>
      <div className={styles.live} aria-hidden="true">
        <span className={styles.liveDot} />
        מתעדכן כל 30 שניות
      </div>
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

export function SourceLayer({ source }: { source: TileSource }) {
  return (
    <TileLayer
      url={source.url}
      attribution={source.attribution}
      maxNativeZoom={source.maxNativeZoom}
      maxZoom={MAX_ZOOM}
    />
  )
}
