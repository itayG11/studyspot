// The load chart: for each hour a light bar for how busy it usually is,
// and inside it a filled bar for today so far. The hour under way shows the
// live count and the "live" note. One axis: both bars count people against
// the same full (a place's seats, or the campus's).
//
// Hand-built like the rest of the site's charts, no library: a few divs.
// Colour by level (free, filling, full) with words for screen readers, the
// numbers on hover, and a list that reads every hour aloud.

import { LiveNote } from '../../components/LiveNote'
import type { PlaceKind } from '../../api/types'
import { levelWord, type ForecastLevel } from '../../logic/forecast'
import type { LoadHour } from '../../logic/load'
import { HIGH_FROM, MEDIUM_FROM } from '../../logic/occupancy'
import styles from './load.module.css'

interface Props {
  hours: LoadHour[]
  limit: number // how many make it full
  currentHour: number | null // the hour under way, when the chart is of today
  live: number | null // the count now, for the hour under way
  simulated: boolean // the live count includes made-up people
  kind?: PlaceKind // for the words: a room is "usually free", not "quiet"
}

const clock = (hour: number) => `${String(hour).padStart(2, '0')}:00`
const share = (people: number, limit: number) => (limit > 0 ? Math.min(people / limit, 1) : 0)
const level = (s: number): ForecastLevel => (s >= HIGH_FROM ? 'high' : s >= MEDIUM_FROM ? 'medium' : 'low')

function spoken(h: LoadHour, current: boolean, live: number | null, limit: number, kind: PlaceKind): string {
  const parts = []
  if (h.usual !== null) parts.push(`בדרך כלל ${levelWord(level(share(h.usual, limit)), kind)}, בערך ${Math.round(h.usual)} אנשים`)
  if (current && live !== null) parts.push(`עכשיו ${live}`)
  else if (h.today !== null) parts.push(`היום ${Math.round(h.today)}`)
  return `${clock(h.hour)}: ${parts.join(', ')}`
}

export function LoadChart({ hours, limit, currentHour, live, simulated, kind = 'open_area' }: Props) {
  return (
    <div className={styles.chart}>
      <div className={styles.legend}>
        <span className={styles.key}>
          <span className={`${styles.swatch} ${styles.swatchUsual}`} aria-hidden="true" />
          בדרך כלל
        </span>
        <span className={styles.key}>
          <span className={`${styles.swatch} ${styles.swatchToday}`} aria-hidden="true" />
          היום
        </span>
        {live !== null && <LiveNote simulated={simulated} className={styles.live} />}
      </div>
      <div className={styles.bars} aria-hidden="true">
        {hours.map((h) => {
          const current = h.hour === currentHour
          const today = current && live !== null ? live : h.today
          const todayShare = today === null ? null : share(today, limit)
          return (
            <span key={h.hour} className={`${styles.column} ${current ? styles.current : ''}`} title={spoken(h, current, live, limit, kind)}>
              <span className={styles.plot}>
                {current && live !== null && <span className={styles.nowValue}>{live}</span>}
                {h.usual !== null && <span className={styles.usual} style={{ height: `${Math.max(share(h.usual, limit) * 100, 3)}%` }} />}
                {todayShare !== null && (
                  <span
                    className={`${styles.today} ${styles[`today_${level(todayShare)}`]}`}
                    style={{ height: `${Math.max(todayShare * 100, 3)}%` }}
                  />
                )}
              </span>
              <span className={styles.hour}>{h.hour % 2 === 0 ? h.hour : ''}</span>
            </span>
          )
        })}
      </div>
      <ul className="visually-hidden" aria-label="העומס לפי שעה">
        {hours.map((h) => (
          <li key={h.hour}>{spoken(h, h.hour === currentHour, live, limit, kind)}</li>
        ))}
      </ul>
    </div>
  )
}
