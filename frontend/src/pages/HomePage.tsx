// The home page: the scroll story, then the finder. Both read the same
// live data, refreshed every 30 seconds.

import { getBuildings, getPlaces } from '../api/campus'
import { REFRESH_INTERVAL_MS } from '../config'
import { Finder } from '../features/finder/Finder'
import { useApi } from '../hooks/useApi'

export function HomePage() {
  const buildings = useApi(getBuildings, 'buildings', REFRESH_INTERVAL_MS)
  const places = useApi(() => getPlaces(), 'places', REFRESH_INTERVAL_MS)
  return (
    <Finder
      places={places.data}
      buildings={buildings.data}
      error={places.error ?? buildings.error}
      onRetry={() => {
        places.reload()
        buildings.reload()
      }}
    />
  )
}
