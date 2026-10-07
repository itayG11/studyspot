// The campus map: one coloured circle per building, on a street map or an
// aerial photo. Leaflet does the drawing; react-leaflet wraps it in components.

import { latLngBounds } from 'leaflet'
import { CircleMarker, LayerGroup, LayersControl, MapContainer, TileLayer, Tooltip } from 'react-leaflet'
import type { Building } from '../api/types'
import styles from './map.module.css'
import { LEVEL_COLORS, occupancyLevel, position } from '../logic/occupancy'
import { AERIAL, AERIAL_LABELS, MAX_ZOOM, STREETS, type TileSource } from './tiles'

interface Props {
  buildings: Building[] // only buildings that have a position
  selected: string | null
  onSelect: (code: string) => void
}

export function CampusMap({ buildings, selected, onSelect }: Props) {
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
