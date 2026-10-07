import { useSearchParams } from 'react-router'
import { getPlaces } from '../api/campus'
import type { PlaceKind } from '../api/types'
import { PlaceCard } from '../components/PlaceCard'
import { REFRESH_INTERVAL_MS } from '../config'
import { useApi } from '../hooks/useApi'
import { errorMessage } from '../i18n/errors'
import { KIND_LABELS, KINDS } from '../i18n/labels'
import styles from './pages.module.css'

function readKind(value: string | null): PlaceKind | undefined {
  return KINDS.find((kind) => kind === value)
}

export function PlacesPage() {
  // The filter lives in the address (?kind=library), so a filtered list can be shared.
  const [params, setParams] = useSearchParams()
  const kind = readKind(params.get('kind'))
  const places = useApi(() => getPlaces({ kind }), `places-${kind ?? 'all'}`, REFRESH_INTERVAL_MS)

  return (
    <section>
      <div className={styles.pageHead}>
        <h1>מקומות לימוד</h1>
        {places.data && <span className="hint">{places.data.length} מקומות</span>}
      </div>

      <div className={styles.filters} role="group" aria-label="סינון לפי סוג">
        <button type="button" className={styles.chip} aria-pressed={!kind} onClick={() => setParams({})}>
          הכול
        </button>
        {KINDS.map((k) => (
          <button
            key={k}
            type="button"
            className={styles.chip}
            aria-pressed={kind === k}
            onClick={() => setParams({ kind: k })}
          >
            {KIND_LABELS[k]}
          </button>
        ))}
      </div>

      {places.error && <p className="error" role="alert">{errorMessage(places.error.code)}</p>}
      {places.loading && !places.data && <p className="page-message">טוען…</p>}
      {places.data && places.data.length === 0 && <p className="page-message">אין מקומות מהסוג הזה.</p>}
      {places.data && (
        <ul className={`${styles.cards} ${styles.cardsGrid}`}>
          {places.data.map((place, i) => (
            <PlaceCard key={place.id} place={place} index={i} />
          ))}
        </ul>
      )}
    </section>
  )
}
