// A small map for one place's page: the building it is in, and nothing else.
// It is loaded only when that page shows it (Leaflet is the biggest library on
// the site). The campus map (CampusMap) shows every building and fits them all;
// this one is centred on a single building, closer in.

import 'leaflet/dist/leaflet.css'
import { Browser } from 'leaflet'
import { CircleMarker, MapContainer, Tooltip } from 'react-leaflet'
import type { Building } from '../api/types'
import { LEVEL_COLORS, occupancyLevel, position } from '../logic/occupancy'
import styles from './map.module.css'
import { SourceLayer } from './CampusMap'
import { AERIAL, AERIAL_ENABLED, AERIAL_LABELS, MAX_ZOOM, STREETS } from './tiles'

const ZOOM = 17

export default function PlaceMap({ building }: { building: Building }) {
  const center = position(building)
  if (!center) return null
  const level = occupancyLevel(building)
  return (
    // Leaflet is built for left-to-right pages, so the map itself stays LTR.
    <div dir="ltr" className={`${styles.frame} ${styles.placeFrame}`}>
      <MapContainer
        center={center}
        zoom={ZOOM}
        maxZoom={MAX_ZOOM}
        // A map that wheels or drags on its own would trap the page's scroll, above all on a phone:
        // with a finger the page scrolls past it, and the zoom buttons stay.
        scrollWheelZoom={false}
        dragging={!Browser.mobile}
        className={styles.placeMap}
      >
        {/* No layer switch here (the campus map has one): the card shows the photo when it is on, else the streets. */}
        {AERIAL_ENABLED ? (
          <>
            <SourceLayer source={AERIAL} />
            <SourceLayer source={AERIAL_LABELS} />
          </>
        ) : (
          <SourceLayer source={STREETS} />
        )}
        <CircleMarker
          center={center}
          radius={22}
          interactive={false}
          pathOptions={{
            color: '#ffffff',
            weight: 3,
            fillColor: level === 'construction' ? '#ffcc00' : LEVEL_COLORS[level],
            fillOpacity: 0.95,
            dashArray: level === 'construction' ? '5 4' : undefined,
          }}
        >
          <Tooltip permanent direction="center" className={level === 'construction' ? 'map-label map-label-dark' : 'map-label'}>
            <span className="map-code">{building.code}</span>
            {level !== 'construction' && <span className="map-free">{building.available}</span>}
          </Tooltip>
        </CircleMarker>
      </MapContainer>
    </div>
  )
}
