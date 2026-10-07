import { useSearchParams } from 'react-router'
import { getBuildings, getPlaces } from '../api/campus'
import { PlaceCard } from '../components/PlaceCard'
import { BuildingTile } from '../components/ui/BuildingTile'
import { Count } from '../components/ui/Count'
import { REFRESH_INTERVAL_MS } from '../config'
import { useApi } from '../hooks/useApi'
import { LoadError } from '../components/LoadError'
import { BuildingList, Legend } from '../map/BuildingList'
import { CampusMap } from '../map/CampusMap'
import { occupancyLevel, position } from '../logic/occupancy'
import { buildingSummary } from '../logic/places'
import styles from './pages.module.css'

export function MapPage() {
  const buildings = useApi(getBuildings, 'buildings', REFRESH_INTERVAL_MS)
  const places = useApi(() => getPlaces(), 'places', REFRESH_INTERVAL_MS)
  // The chosen building lives in the address (?building=M), so it can be shared.
  const [params, setParams] = useSearchParams()
  const selected = params.get('building')

  const select = (code: string) => setParams(code === selected ? {} : { building: code }, { replace: true })

  // Without data the whole page is the error. With data (one refresh failed)
  // the numbers stay, the map keeps its zoom, and a small notice appears.
  if (!buildings.data && buildings.error) return <LoadError error={buildings.error} onRetry={buildings.reload} />
  if (!buildings.data) return <p className="page-message">טוען את מפת הקמפוס…</p>

  const all = buildings.data
  const onMap = all.filter((b) => position(b) !== null)
  const offMap = all.filter((b) => position(b) === null)
  const chosen = all.find((b) => b.code === selected) ?? null
  const chosenPlaces = places.data?.filter((p) => p.building_code === chosen?.code) ?? null
  const refreshError = buildings.error ?? places.error
  const freeNow = all.reduce((sum, b) => sum + b.available, 0)

  return (
    <div className={styles.mapPage}>
      <aside>
        {refreshError && (
          <LoadError
            error={refreshError}
            onRetry={() => {
              buildings.reload()
              places.reload()
            }}
            inline
          />
        )}
        {chosen ? (
          <section className="panel rise" key={chosen.code}>
            <div className={styles.chosenHead}>
              <BuildingTile code={chosen.code} level={occupancyLevel(chosen)} large />
              <div>
                <h2>בניין {chosen.code}</h2>
                <span className={styles.heroMeta}>{buildingSummary(chosen)}</span>
              </div>
            </div>
            {chosenPlaces === null ? (
              <p className="hint">טוען את המקומות…</p>
            ) : chosenPlaces.length > 0 ? (
              <ul className={styles.cards}>
                {chosenPlaces.map((place, i) => (
                  <PlaceCard key={place.id} place={place} index={i} />
                ))}
              </ul>
            ) : (
              <p>אין בבניין הזה מקומות לימוד במערכת.</p>
            )}
            <p>
              <button type="button" className="link-button" onClick={() => select(chosen.code)}>
                חזרה לכל הבניינים
              </button>
            </p>
          </section>
        ) : (
          <section className="panel">
            <div className={styles.sideTitle}>
              <h2>איפה יש מקום?</h2>
              <Count value={freeNow} className={styles.bigCount} />
            </div>
            <p className="hint">מקומות פנויים עכשיו בכל הקמפוס. בחר בניין במפה או ברשימה.</p>
            <BuildingList buildings={onMap} selected={selected} onSelect={select} />
            {offMap.length > 0 && (
              <>
                <h3 className={styles.subTitle}>לא מופיעים במפה</h3>
                <BuildingList buildings={offMap} selected={selected} onSelect={select} startIndex={onMap.length} />
              </>
            )}
          </section>
        )}
      </aside>

      <section className={styles.mapArea} aria-label="מפת הקמפוס">
        {onMap.length > 0 ? (
          <CampusMap buildings={onMap} selected={selected} onSelect={select} />
        ) : (
          <p className="page-message">אף בניין עדיין לא מוקם על המפה.</p>
        )}
        <Legend />
      </section>
    </div>
  )
}
