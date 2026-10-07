// The finder: search, filter chips, and results as cards or on the map.
// Everything that defines the results lives in the address (logic/filters),
// so a shared link shows the same list. Results follow each keystroke and
// each chip at once, without animation: they change many times in a row.

import { CircleDot, Computer, List, Map as MapIcon, Plug, Search, Star, Users, Volume1, X } from 'lucide-react'
import { lazy, Suspense, useState } from 'react'
import { useSearchParams } from 'react-router'
import type { ApiError } from '../../api/client'
import type { Building, Place } from '../../api/types'
import { useFavorites } from '../../hooks/useFavorites'
import { KIND_LABELS, KINDS } from '../../i18n/labels'
import {
  applyFilters,
  countWith,
  EMPTY_FILTERS,
  FLAGS,
  hasFilters,
  readFilters,
  toggleFlag,
  toggleKind,
  writeFilters,
  type Filters,
  type Flag,
} from '../../logic/filters'
import { Button, Chip, EmptyState, ErrorState, LoadingRegion, SearchField, Skeleton } from '../../ui'
import { SpaceCard } from './SpaceCard'
import styles from './finder.module.css'

const FinderMap = lazy(() => import('./FinderMap'))

const FLAG_LABELS: Record<Flag, string> = {
  free: 'פנוי עכשיו',
  quiet: 'שקט',
  group: 'לקבוצה',
  computers: 'עם מחשבים',
  outlets: 'שקעים',
}

const FLAG_ICONS = { free: CircleDot, quiet: Volume1, group: Users, computers: Computer, outlets: Plug }

interface FinderProps {
  places: Place[] | null
  buildings: Building[] | null
  error: ApiError | null
  onRetry: () => void
}

export function Finder({ places, buildings, error, onRetry }: FinderProps) {
  const [params, setParams] = useSearchParams()
  const filters = readFilters(params)
  // Favourites are per device, so this filter is not put in the address.
  const [onlyFavorites, setOnlyFavorites] = useState(false)
  const { favorites } = useFavorites()
  const [selected, setSelected] = useState<string | null>(null)

  const update = (next: Filters) => setParams(writeFilters(next), { replace: true, preventScrollReset: true })

  return (
    <section id="finder" className={styles.finder} aria-labelledby="finder-title" tabIndex={-1}>
      <div className={styles.bar}>
        <h2 id="finder-title" className={styles.heading}>
          איפה תלמד היום?
        </h2>
        <SearchField
          label="חיפוש מקום"
          value={filters.q}
          onChange={(q) => update({ ...filters, q })}
          placeholder="שם, בניין, סוג או ציוד"
        />
        <div className={styles.chips} role="group" aria-label="סינון">
          {FLAGS.map((flag) => {
            const Icon = FLAG_ICONS[flag]
            return (
              <Chip
                key={flag}
                selected={filters.flags.includes(flag)}
                icon={<Icon aria-hidden="true" />}
                count={places ? countWith(places, filters, flag) : undefined}
                onClick={() => update(toggleFlag(filters, flag))}
              >
                {FLAG_LABELS[flag]}
              </Chip>
            )
          })}
          {favorites.length > 0 && (
            <Chip selected={onlyFavorites} icon={<Star aria-hidden="true" />} onClick={() => setOnlyFavorites(!onlyFavorites)}>
              המועדפים שלי
            </Chip>
          )}
          <span className={styles.divider} aria-hidden="true" />
          {KINDS.map((kind) => (
            <Chip key={kind} selected={filters.kinds.includes(kind)} onClick={() => update(toggleKind(filters, kind))}>
              {KIND_LABELS[kind]}
            </Chip>
          ))}
        </div>
      </div>

      <Results
        places={places}
        buildings={buildings}
        error={error}
        onRetry={onRetry}
        filters={filters}
        update={update}
        favorites={onlyFavorites ? favorites : null}
        clearFavorites={() => setOnlyFavorites(false)}
        selected={selected}
        setSelected={setSelected}
      />
    </section>
  )
}

interface ResultsProps extends FinderProps {
  filters: Filters
  update: (next: Filters) => void
  favorites: number[] | null // only these, when the favourites chip is on
  clearFavorites: () => void
  selected: string | null
  setSelected: (code: string | null) => void
}

function Results({ places, buildings, error, onRetry, filters, update, favorites, clearFavorites, selected, setSelected }: ResultsProps) {
  if (!places && error) return <ErrorState error={error} onRetry={onRetry} />
  if (!places || !buildings) return <CardSkeletons />

  const isMap = filters.view === 'map'
  let results = applyFilters(places, filters, buildings)
  if (favorites) results = results.filter((p) => favorites.includes(p.id))
  // On the map, a chosen building narrows the list to its places.
  const shown = isMap && selected ? results.filter((p) => p.building_code === selected) : results
  const anyFilter = hasFilters(filters) || favorites !== null
  const clearAll = () => {
    update({ ...EMPTY_FILTERS, view: filters.view })
    clearFavorites()
    setSelected(null)
  }

  return (
    <>
      {error && <ErrorState error={error} onRetry={onRetry} compact />}
      <div className={styles.toolbar}>
        <p className={styles.count} aria-live="polite">
          {shown.length === 1 ? 'מקום אחד' : `${shown.length} מקומות`}
        </p>
        <label className={styles.near}>
          <span>קרוב ל</span>
          <select value={filters.near ?? ''} onChange={(e) => update({ ...filters, near: e.target.value || null })}>
            <option value="">כל הקמפוס</option>
            {buildings.map((b) => (
              <option key={b.code} value={b.code}>
                בניין {b.code}
              </option>
            ))}
          </select>
        </label>
        {anyFilter && (
          <Button variant="ghost" size="sm" icon={<X aria-hidden="true" />} onClick={clearAll}>
            ניקוי הסינון
          </Button>
        )}
        <div className={styles.views} role="group" aria-label="תצוגה">
          <button type="button" aria-pressed={!isMap} onClick={() => update({ ...filters, view: 'list' })}>
            <List aria-hidden="true" /> רשימה
          </button>
          <button type="button" aria-pressed={isMap} onClick={() => update({ ...filters, view: 'map' })}>
            <MapIcon aria-hidden="true" /> מפה
          </button>
        </div>
      </div>

      {isMap && selected && (
        <p className={styles.selected}>
          <Chip selected icon={<X aria-hidden="true" />} onClick={() => setSelected(null)} aria-label={`הסרת הסינון לבניין ${selected}`}>
            בניין {selected}
          </Chip>
        </p>
      )}

      <div className={isMap ? styles.mapLayout : undefined}>
        {shown.length === 0 ? (
          <EmptyState
            icon={<Search />}
            title="אין מקום שמתאים לכל הסינונים"
            action={
              <Button variant="secondary" onClick={clearAll}>
                ניקוי הסינון
              </Button>
            }
          >
            נסה להוריד סינון אחד, או לחפש מילה אחרת.
          </EmptyState>
        ) : (
          <ul className={isMap ? styles.list : styles.grid}>
            {shown.map((place) => (
              <SpaceCard key={place.id} place={place} onShowOnMap={isMap ? setSelected : undefined} />
            ))}
          </ul>
        )}
        {isMap && (
          <div className={styles.mapBox}>
            <Suspense fallback={<Skeleton height="100%" radius="var(--r-lg)" />}>
              <FinderMap buildings={buildings} selected={selected} onSelect={(code) => setSelected(code === selected ? null : code)} />
            </Suspense>
          </div>
        )}
      </div>
    </>
  )
}

function CardSkeletons() {
  return (
    <LoadingRegion label="טוען את המקומות…">
      <ul className={styles.grid} aria-hidden="true">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <li key={i} className={styles.card}>
            <Skeleton height="150px" radius="var(--r-md)" />
            <div className={styles.body}>
              <Skeleton width="40%" height="1.4em" />
              <Skeleton width="70%" />
              <Skeleton width="55%" />
            </div>
          </li>
        ))}
      </ul>
    </LoadingRegion>
  )
}
