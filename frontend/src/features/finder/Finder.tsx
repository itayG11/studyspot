// The finder: search, filter chips, and results as cards or on the map.
// Everything that defines the results lives in the address (logic/filters),
// so a shared link shows the same list. Results follow each keystroke and
// each chip at once, without animation: they change many times in a row.

import { CircleDot, Computer, List, Map as MapIcon, Plug, Search, Star, Users, Volume1, X } from 'lucide-react'
import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router'
import type { ApiError } from '../../api/client'
import type { Building, CampusToday, Place } from '../../api/types'
import { LiveNote } from '../../components/LiveNote'
import { useFavorites } from '../../hooks/useFavorites'
import { KIND_LABELS, KINDS } from '../../i18n/labels'
import { useInstitution, useLiveSimulated } from '../../institution'
import {
  advancedCount,
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
import { Button, Chip, EmptyState, ErrorState, LoadingRegion, SearchField, Segmented, Skeleton } from '../../ui'
import { CampusLoad } from '../load/CampusLoad'
import { AdvancedFilters, AdvancedFiltersButton } from './AdvancedFilters'
import { QuickFinder } from './QuickFinder'
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

const TYPING_PAUSE_MS = 300

const FLAG_ICONS = { free: CircleDot, quiet: Volume1, group: Users, computers: Computer, outlets: Plug }

interface FinderProps {
  places: Place[] | null
  buildings: Building[] | null
  today?: CampusToday | null // the campus today (the load chart); optional, the search works without it
  error: ApiError | null
  onRetry: () => void
}

export function Finder({ places, buildings, today = null, error, onRetry }: FinderProps) {
  const { timezone } = useInstitution()
  const [params, setParams] = useSearchParams()
  const fromAddress = readFilters(params)
  // The search box keeps its own text, updated on every keystroke, and
  // copies it into the address. Reading it back from the address would lose
  // letters while typing fast: the address catches up a moment later.
  const [text, setText] = useState(fromAddress.q)
  const written = useRef(fromAddress.q)
  useEffect(() => {
    // Changed from outside (a "clear" button, back and forward): follow it.
    if (fromAddress.q !== written.current) {
      written.current = fromAddress.q
      setText(fromAddress.q)
    }
  }, [fromAddress.q])
  const filters = { ...fromAddress, q: text }
  // Favourites are per device, so this filter is not put in the address.
  const [onlyFavorites, setOnlyFavorites] = useState(false)
  const { favorites } = useFavorites()
  const [selected, setSelected] = useState<string | null>(null)
  // A shared link with expanded filters opens with their panel showing.
  const [moreOpen, setMoreOpen] = useState(() => advancedCount(fromAddress) > 0)

  // Typing changes the results at once, but the address only after a short
  // pause: writing it is a navigation that draws the page again, and Safari
  // refuses more than 100 address changes in 10 seconds.
  const pending = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  useEffect(() => () => clearTimeout(pending.current), [])
  const update = (next: Filters, wait = 0) => {
    written.current = next.q
    setText(next.q)
    clearTimeout(pending.current)
    const write = () => setParams(writeFilters(next), { replace: true, preventScrollReset: true })
    if (wait > 0) pending.current = setTimeout(write, wait)
    else write()
  }
  // Un-starring the last favourite hides the chip: its filter goes off too.
  const favoritesOn = onlyFavorites && favorites.length > 0

  return (
    <section id="finder" className={styles.finder} aria-labelledby="finder-title" tabIndex={-1}>
      {/* The heading scrolls away; only the search and the chips stay. */}
      <h2 id="finder-title" className={styles.heading}>
        איפה תלמד היום?
      </h2>
      <div className={styles.bar}>
        <SearchField
          label="חיפוש מקום"
          value={filters.q}
          onChange={(q) => update({ ...filters, q }, TYPING_PAUSE_MS)}
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
                count={places ? countWith(places, filters, flag) : null}
                onClick={() => update(toggleFlag(filters, flag))}
              >
                {FLAG_LABELS[flag]}
              </Chip>
            )
          })}
          {favorites.length > 0 && (
            <Chip selected={favoritesOn} icon={<Star aria-hidden="true" />} onClick={() => setOnlyFavorites(!favoritesOn)}>
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

      {/* Below the sticky bar, not in it: on a phone the bar stays one search
          and one row of chips, and does not cover the cards. */}
      <div className={styles.moreRow}>
        <AdvancedFiltersButton open={moreOpen} onToggle={() => setMoreOpen(!moreOpen)} filters={filters} />
        <QuickFinder places={places} />
      </div>
      <AdvancedFilters open={moreOpen} filters={filters} buildings={buildings} update={update} />

      {today && <CampusLoad data={today} places={places} timeZone={timezone} />}

      <Results
        places={places}
        today={today}
        buildings={buildings}
        error={error}
        onRetry={onRetry}
        filters={filters}
        update={update}
        favorites={favoritesOn ? favorites : null}
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

function Results({ places, buildings, today, error, onRetry, filters, update, favorites, clearFavorites, selected, setSelected }: ResultsProps) {
  const simulated = useLiveSimulated()
  const nextHour = new Map((today?.places ?? []).map((p) => [p.place_id, p.next_hour]))
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
        <LiveNote simulated={simulated} className={styles.live} />
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
        <Segmented
          label="תצוגה"
          value={isMap ? 'map' : 'list'}
          onChange={(view) => update({ ...filters, view })}
          options={[
            { value: 'list', label: <><List aria-hidden="true" /> רשימה</> },
            { value: 'map', label: <><MapIcon aria-hidden="true" /> מפה</> },
          ]}
        />
      </div>

      {isMap && selected && (
        <BuildingPanel
          building={buildings.find((b) => b.code === selected) ?? null}
          code={selected}
          count={shown.length}
          only={filters.building === selected}
          onOnly={() => update({ ...filters, building: selected })}
          onClose={() => setSelected(null)}
        />
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
              <SpaceCard key={place.id} place={place} nextHour={nextHour.get(place.id) ?? null} onShowOnMap={isMap ? setSelected : undefined} />
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

interface BuildingPanelProps {
  building: Building | null
  code: string
  count: number // its places in the list, after the other filters
  only: boolean // the list is already this building's only
  onOnly: () => void
  onClose: () => void
}

// The building chosen on the map: what is free in it now, and a way to keep
// the list on it (into the address, so it stays when going back to the list).
function BuildingPanel({ building, code, count, only, onOnly, onClose }: BuildingPanelProps) {
  return (
    <section className={styles.buildingPanel} aria-labelledby="chosen-building">
      <div>
        <p id="chosen-building" className={styles.buildingTitle}>
          בניין {code}
          {building?.name && <span> · {building.name}</span>}
        </p>
        <p className={styles.buildingFacts}>
          {building && `${building.available} מקומות פנויים עכשיו, מתוך ${building.capacity} · `}
          {count === 1 ? 'מקום אחד ברשימה' : `${count} מקומות ברשימה`}
        </p>
      </div>
      <div className={styles.buildingActions}>
        {!only && (
          <Button variant="secondary" size="sm" onClick={onOnly}>
            רק הבניין הזה
          </Button>
        )}
        <Button variant="ghost" size="sm" icon={<X aria-hidden="true" />} onClick={onClose}>
          הסרת הבחירה
        </Button>
      </div>
    </section>
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
