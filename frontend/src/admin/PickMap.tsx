// A map that reports where it was clicked. The admin uses it to place a
// building: click on the building's roof in the aerial photo.

import { latLngBounds } from 'leaflet'
import { CircleMarker, LayerGroup, MapContainer, Tooltip, useMapEvents } from 'react-leaflet'
import type { Building } from '../api/types'
import { position } from '../logic/occupancy'
import { SourceLayer } from '../map/CampusMap'
import { AERIAL, AERIAL_LABELS, MAX_ZOOM } from '../map/tiles'
import styles from './admin.module.css'

interface Props {
  buildings: Building[]
  selected: string | null
  onPick: (latitude: number, longitude: number) => void
}

function ClickCatcher({ onPick }: { onPick: Props['onPick'] }) {
  useMapEvents({ click: (event) => onPick(event.latlng.lat, event.latlng.lng) })
  return null
}

export function PickMap({ buildings, selected, onPick }: Props) {
  const points = buildings.map(position).filter((p): p is [number, number] => p !== null)
  // With nothing placed yet there is no campus to frame: start on Israel.
  const view = points.length > 0 ? { bounds: latLngBounds(points).pad(0.3) } : { center: [31.5, 34.9] as [number, number], zoom: 8 }

  return (
    <div dir="ltr" className={styles.pickMap}>
      <MapContainer {...view} maxZoom={MAX_ZOOM} style={{ height: '100%' }}>
        <LayerGroup>
          <SourceLayer source={AERIAL} />
          <SourceLayer source={AERIAL_LABELS} />
        </LayerGroup>
        {buildings.map((b) => {
          const at = position(b)
          if (!at) return null
          return (
            <CircleMarker
              key={`${b.code}-${b.latitude}-${b.longitude}-${b.code === selected}`}
              center={at}
              radius={b.code === selected ? 14 : 10}
              interactive={false}
              pathOptions={{ color: '#ffffff', weight: 3, fillColor: b.code === selected ? '#ff5b14' : '#141a2e', fillOpacity: 0.95 }}
            >
              <Tooltip permanent direction="top" offset={[0, -10]}>
                {b.code}
              </Tooltip>
            </CircleMarker>
          )
        })}
        <ClickCatcher onPick={onPick} />
      </MapContainer>
    </div>
  )
}
