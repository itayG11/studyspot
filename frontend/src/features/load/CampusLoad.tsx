// "The campus today", above the search: every place but the group rooms,
// usually and so far today, and one line on how now compares.

import { useEffect, useState } from 'react'
import type { CampusToday, Place } from '../../api/types'
import { campusTiles, compareToUsual, hourly } from '../../logic/load'
import { formatTime } from '../../logic/time'
import { LoadChart } from './LoadChart'
import styles from './load.module.css'

const COMPARED = { busier: 'עמוס מהרגיל', quieter: 'שקט מהרגיל', usual: 'כרגיל' } as const

const MINUTE = 60_000

interface CampusLoadProps {
  data: CampusToday
  places?: Place[] | null // for the tiles; without them, the chart only
  timeZone: string
  now?: Date
}

export function CampusLoad({ data, places = null, timeZone, now: start }: CampusLoadProps) {
  // Kept in state and moved on every minute, like the place page's chart.
  const [now, setNow] = useState(() => start ?? new Date())
  useEffect(() => {
    if (start) return // a fixed moment, in the tests
    const timer = setInterval(() => setNow(new Date()), MINUTE)
    return () => clearInterval(timer)
  }, [start])
  const clock = formatTime(now.toISOString(), timeZone)
  const hours = hourly(data.slots)
  // The data may already be in the next hour while the page's minute timer
  // is not (up to a minute after the hour): the later of the two.
  const lastCounted = Math.max(-1, ...hours.filter((h) => h.today !== null).map((h) => h.hour))
  const currentHour = Math.max(Number(clock.slice(0, 2)), lastCounted)
  const usualNow = hours.find((h) => h.hour === currentHour)?.usual ?? null
  const compared = data.weeks > 0 ? compareToUsual(data.occupied, usualNow) : null
  const open = hours.some((h) => h.hour === currentHour)

  return (
    <section className={styles.card} aria-labelledby="campus-today">
      <h2 id="campus-today" className={styles.title}>
        העומס היום בקמפוס
      </h2>
      {places && <Tiles places={places} compared={compared} hasForecast={data.weeks > 0} closedToday={hours.length === 0} />}
      {hours.length === 0 ? (
        <p className={styles.line}>הקמפוס סגור היום.</p>
      ) : (
        <>
          <p className={styles.line}>
            {open && `עכשיו ${data.occupied} אנשים בקמפוס, מתוך ${data.capacity} מקומות.`}
            {open && compared && usualNow !== null && ` בדרך כלל בשעה הזו: ${Math.round(usualNow)}. `}
            {open && compared && <strong>{COMPARED[compared]}.</strong>}
            {data.weeks === 0 && ' עוד אין חיזוי: הוא מופיע אחרי שבועיים של כניסות.'}
          </p>
          <LoadChart
            hours={hours}
            limit={data.capacity}
            currentHour={open ? currentHour : null}
            live={open ? data.occupied : null}
            simulated={data.simulated}
          />
          {data.weeks > 0 && (
            <p className={styles.note}>
              "בדרך כלל" הוא ממוצע של {data.weeks} השבועות האחרונים.
              {data.simulated && ' נתוני דמו: ההיסטוריה והנוכחות כאן מדומות.'}
            </p>
          )}
        </>
      )}
    </section>
  )
}

// Four numbers at a glance, every one from the server: no figure here is
// written into the page.
interface TilesProps {
  places: Place[]
  compared: keyof typeof COMPARED | null
  hasForecast: boolean
  closedToday: boolean
}

function Tiles({ places, compared, hasForecast, closedToday }: TilesProps) {
  const t = campusTiles(places)
  const vsUsual = closedToday
    ? ['סגור', 'היום']
    : compared
      ? [COMPARED[compared], 'בשעה הזו']
      : hasForecast
        ? ['אין השוואה', 'בשעה הזו']
        : ['עוד אין', 'חיזוי']
  const tiles = [
    [String(t.freeSeats), 'מקומות פנויים עכשיו'],
    [`${t.open} מתוך ${t.places}`, 'פתוחים עכשיו'],
    [String(t.freeRooms), 'חדרים פנויים להזמנה'],
    vsUsual,
  ]
  return (
    <ul className={styles.tiles} aria-label="הקמפוס עכשיו">
      {tiles.map(([value, label]) => (
        <li key={label} className={styles.tile}>
          <strong className={styles.tileValue}>{value}</strong>
          <span className={styles.tileLabel}>{label}</span>
        </li>
      ))}
    </ul>
  )
}
