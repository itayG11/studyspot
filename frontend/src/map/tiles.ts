// Where the map pictures (tiles) come from: the finder's map and the
// admin's map for placing buildings.
//
// Each provider asks for credit on the map (attribution). Terms of use:
// docs/DEPLOY.md. OpenStreetMap's tiles may be used by a light site that
// credits them and sends a Referer (the server's Referrer-Policy does).
// Esri's aerial photo is licensed through an ArcGIS account, so the public
// build leaves it out unless VITE_AERIAL=on is set at build time.

export const AERIAL_ENABLED: boolean = (import.meta.env.VITE_AERIAL ?? (import.meta.env.DEV ? 'on' : 'off')) === 'on'

export interface TileSource {
  url: string
  attribution: string
  maxNativeZoom: number // deepest zoom the provider has pictures for
  credit: string // the same credit as plain text, for places outside a map
}

export const AERIAL: TileSource = {
  url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
  attribution: 'Powered by Esri | Imagery &copy; Esri, Maxar, Earthstar Geographics',
  maxNativeZoom: 19,
  credit: 'Powered by Esri · Imagery © Esri, Maxar, Earthstar Geographics',
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
