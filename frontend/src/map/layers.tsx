// What CampusMap, PlaceMap and the admin's PickMap share: the picture under the map (tiles) and the look of a
// building's circle.

import { LayerGroup, LayersControl, TileLayer } from 'react-leaflet'
import { AERIAL, AERIAL_ENABLED, AERIAL_LABELS, MAX_ZOOM, STREETS, type TileSource } from './tiles'

export function SourceLayer({ source }: { source: TileSource }) {
  return (
    <TileLayer url={source.url} attribution={source.attribution} maxNativeZoom={source.maxNativeZoom} maxZoom={MAX_ZOOM} />
  )
}

// The aerial photo when it is on (VITE_AERIAL), else the streets. `switcher`: a control to choose between
// the two; a small map has none (it would be one more unnamed control in a corner).
export function BaseLayers({ switcher }: { switcher: boolean }) {
  if (!AERIAL_ENABLED) return <SourceLayer source={STREETS} />
  if (!switcher) {
    return (
      <>
        <SourceLayer source={AERIAL} />
        <SourceLayer source={AERIAL_LABELS} />
      </>
    )
  }
  return (
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
  )
}
