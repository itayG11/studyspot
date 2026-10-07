// Where the map pictures (tiles) come from. Used by the campus map and by
// the home-page hero, so both show the same aerial photo.
//
// Each provider asks for credit on the map (attribution). Before going
// public, check each provider's terms of use (noted in docs/INTERVIEW_REPORT.md).

export interface TileSource {
  url: string
  attribution: string
  maxNativeZoom: number // deepest zoom the provider has pictures for
  credit: string // the same credit as plain text, for places outside a map
}

export const AERIAL: TileSource = {
  url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
  attribution: 'Imagery &copy; Esri, Maxar, Earthstar Geographics',
  maxNativeZoom: 19,
  credit: 'תצלום אוויר: © Esri, Maxar, Earthstar Geographics',
}

// Place and road names drawn on a transparent layer, laid over the photo.
export const AERIAL_LABELS: TileSource = {
  url: 'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}',
  attribution: 'Labels &copy; Esri',
  maxNativeZoom: 19,
  credit: 'שמות: © Esri',
}

export const STREETS: TileSource = {
  url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  maxNativeZoom: 19,
  credit: 'מפה: © OpenStreetMap contributors',
}

// Zooming one step past the pictures enlarges the last ones instead of
// showing an empty grey map.
export const MAX_ZOOM = 20
