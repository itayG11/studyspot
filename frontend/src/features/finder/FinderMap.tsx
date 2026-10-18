// Loaded only when the map view opens: Leaflet is the largest library on the
// site, and most visits never need it.
import type { Building } from '../../api/types'
import { CampusMap } from '../../map/CampusMap'
import { position } from '../../logic/occupancy'

export default function FinderMap({ buildings, selected, onSelect }: { buildings: Building[]; selected: string | null; onSelect: (code: string) => void }) {
  return <CampusMap buildings={buildings.filter((b) => position(b) !== null)} selected={selected} onSelect={onSelect} flyToSelected />
}
