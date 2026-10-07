import { useState, type CSSProperties } from 'react'
import { Link, useParams } from 'react-router'
import { getPlace } from '../api/campus'
import type { PlaceDetail } from '../api/types'
import { OpenBadge } from '../components/Availability'
import { SeatGrid } from '../components/SeatGrid'
import { BuildingTile } from '../components/ui/BuildingTile'
import { Count } from '../components/ui/Count'
import { Meter } from '../components/ui/Meter'
import { REFRESH_INTERVAL_MS } from '../config'
import { useApi } from '../hooks/useApi'
import { LoadError } from '../components/LoadError'
import { floorLabel, KIND_LABELS } from '../i18n/labels'
import { useInstitution } from '../institution'
import { LEVEL_COLORS, placeLevel } from '../logic/occupancy'
import { availabilityText } from '../logic/places'
import { formatClock, todayWeekday, weekdayName, WEEK_ORDER } from '../logic/time'
import { NotFoundPage } from './NotFoundPage'
import styles from './pages.module.css'

export function PlacePage() {
  const { placeId } = useParams()
  const id = Number(placeId)
  const valid = Number.isInteger(id) && id > 0
  // An address like /places/abc is not sent to the server at all.
  const place = useApi(() => getPlace(id), valid ? `place-${id}` : null, REFRESH_INTERVAL_MS)

  if (!valid || place.error?.code === 'place_not_found') return <NotFoundPage />
  if (!place.data && place.error) return <LoadError error={place.error} onRetry={place.reload} />
  if (!place.data) return <p className="page-message">טוען…</p>
  return (
    <>
      {place.error && <LoadError error={place.error} onRetry={place.reload} inline />}
      <PlaceView place={place.data} />
    </>
  )
}

function PlaceView({ place }: { place: PlaceDetail }) {
  const { timezone } = useInstitution()
  const level = placeLevel(place)

  return (
    <article>
      <Link to={`/?building=${encodeURIComponent(place.building_code)}`} className={styles.back} viewTransition>
        חזרה לבניין {place.building_code}
      </Link>

      <header className={`${styles.hero} rise`}>
        <BuildingTile code={place.building_code} level={level} large />
        <div>
          <span className="tag">{KIND_LABELS[place.kind]}</span>
          <h1>{place.name}</h1>
          <span className={styles.heroMeta}>
            בניין {place.building_code} · {floorLabel(place.floor)}
            {place.location_note && ` · ${place.location_note}`}
          </span>
        </div>
      </header>

      <div className={styles.placeGrid}>
        <div className="stack">
          <section className="panel rise" style={{ '--i': 1 } as CSSProperties}>
            <OpenBadge isOpen={place.is_open} />
            {place.kind !== 'group_room' && place.is_open ? (
              <>
                <div className={styles.stat}>
                  <Count value={place.available} className={styles.statNumber} />
                  <span className={styles.statOf}>
                    {place.kind === 'computer_lab' ? 'תאים פנויים' : 'מקומות פנויים'} מתוך {place.capacity}
                  </span>
                </div>
                <Meter taken={place.occupied} total={place.capacity} color={LEVEL_COLORS[level]} />
              </>
            ) : (
              <p>{availabilityText(place)}</p>
            )}
          </section>

          {place.seats && place.lab_rows && place.lab_cols && (
            <section className="rise" style={{ '--i': 2 } as CSSProperties}>
              <h2>מפת התאים</h2>
              <SeatGrid
                seats={place.seats}
                rows={place.lab_rows}
                cols={place.lab_cols}
                placeOpen={place.is_open}
                timeZone={timezone}
              />
            </section>
          )}

          {place.bookable && <p className={styles.note}>הזמנה מראש תיפתח באתר בקרוב.</p>}
        </div>

        <aside className="rise" style={{ '--i': 3 } as CSSProperties}>
          <Timetable place={place} timeZone={timezone} />
        </aside>
      </div>
    </article>
  )
}

function Timetable({ place, timeZone }: { place: PlaceDetail; timeZone: string }) {
  // Read the clock once when the table first appears, not on every render.
  const [today] = useState(() => todayWeekday(timeZone))
  return (
    <table className={styles.timetable}>
      <caption>שעות פתיחה</caption>
      <tbody>
        {WEEK_ORDER.map((weekday) => {
          const hours = place.opening_hours.filter((h) => h.weekday === weekday)
          const isToday = weekday === today
          const allDay = isToday && place.open_all_day_today
          return (
            <tr key={weekday} className={[isToday && styles.today, !hours.length && !allDay && styles.closedDay].filter(Boolean).join(' ')}>
              <th scope="row">
                {weekdayName(weekday)}
                {isToday && ' · היום'}
              </th>
              <td>
                {allDay
                  ? 'פתוח 24 שעות'
                  : hours.length
                    ? hours.map((h) => `${formatClock(h.opens)}–${formatClock(h.closes)}`).join(', ')
                    : 'סגור'}
              </td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}
