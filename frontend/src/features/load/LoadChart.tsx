// The load chart: for each hour a light bar for how busy it usually is,
// and inside it a filled bar for today so far. The hour under way shows the
// live count and the "live" note. One axis: both bars count people against
// the same full (a place's seats, or the campus's).
//
// A day other than today has no "today": then the usual bar itself takes
// the colour of its level.
//
// Every column has its number above (people, or for a group room how much
// of the hour it is booked) and its hour below, each in a row of fixed
// height, so every bar starts from the same line. The legend names every
// colour and its threshold, from the same constants that pick the colour.
//
// Hand-built like the rest of the site's charts, no library: a few divs.
// Colour by level (free, filling, full) with words for screen readers, and a
// list that reads every hour aloud.

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
const percent = (s: number) => `${Math.round(s * 100)}%`

function spoken(h: LoadHour, current: boolean, live: number | null, limit: number, kind: PlaceKind): string {
  const parts = []
  if (h.usual !== null) parts.push(`בדרך כלל ${levelWord(level(share(h.usual, limit)), kind)}, בערך ${Math.round(h.usual)} אנשים`)
  if (current && live !== null) parts.push(`עכשיו ${live}`)
  else if (h.today !== null) parts.push(`היום ${Math.round(h.today)}`)
  return `${clock(h.hour)}: ${parts.join(', ')}`
}

export function LoadChart({ hours, limit, currentHour, live, simulated, kind = 'open_area' }: Props) {
  const room = kind === 'group_room'
  // Today's chart has today's bars; another day's has only the usual ones.
  const ofToday = live !== null || currentHour !== null || hours.some((h) => h.today !== null)
  const value = (n: number) => (room ? percent(share(n, limit)) : String(Math.round(n)))
  const levels: [ForecastLevel, string, string][] = [
    ['low', levelWord('low', kind), `פחות מ-${percent(MEDIUM_FROM)}`],
    ['medium', levelWord('medium', kind), `${percent(MEDIUM_FROM)} עד ${percent(HIGH_FROM)}`],
    ['high', levelWord('high', kind), `${percent(HIGH_FROM)} ומעלה`],
  ]
  return (
    <div className={styles.chart}>
      <div className={styles.legend}>
        {ofToday && (
          <span className={styles.key}>
            <span className={`${styles.swatch} ${styles.swatchUsual}`} aria-hidden="true" />
            אפור: בדרך כלל
          </span>
        )}
        {levels.map(([l, word, range]) => (
          <span key={l} className={styles.key}>
            <span className={`${styles.swatch} ${styles[`today_${l}`]}`} aria-hidden="true" />
            {ofToday ? 'היום' : 'בדרך כלל'}: {word}, {range} {room ? 'מהזמן' : 'מהמקומות'}
          </span>
        ))}
        {live !== null && <LiveNote simulated={simulated} className={styles.live} />}
      </div>
      <p className={styles.axes}>
        {room
          ? 'למעלה: כמה מהשעה החדר תפוס בדרך כלל.'
          : ofToday
            ? 'למעלה: כמה אנשים היו היום. בשעות שעוד לא הגיעו, בצבע בהיר, כמה יש בדרך כלל.'
            : 'למעלה: כמה אנשים בדרך כלל.'}{' '}
        למטה: השעה.
      </p>
      <div className={styles.bars} aria-hidden="true">
        {hours.map((h) => {
          const current = h.hour === currentHour
          const today = current && live !== null ? live : h.today
          const todayShare = today === null ? null : share(today, limit)
          const usualShare = h.usual === null ? null : share(h.usual, limit)
          // Above the bar: today's number once there is one, else the usual.
          const shown = today ?? h.usual
          return (
            <span key={h.hour} className={`${styles.column} ${current ? styles.current : ''}`} title={spoken(h, current, live, limit, kind)}>
              <span className={`${styles.value} ${current ? styles.valueNow : today === null && ofToday ? styles.valueUsual : ''}`}>
                {shown === null ? '' : value(shown)}
              </span>
              <span className={styles.plot}>
                {usualShare !== null && (
                  <span
                    className={ofToday ? styles.usual : `${styles.usualAlone} ${styles[`today_${level(usualShare)}`]}`}
                    style={{ height: `${Math.max(usualShare * 100, 3)}%` }}
                  />
                )}
                {todayShare !== null && (
                  <span
                    className={`${styles.today} ${styles[`today_${level(todayShare)}`]}`}
                    style={{ height: `${Math.max(todayShare * 100, 3)}%` }}
                  />
                )}
              </span>
              <span className={styles.hour}>
                <span className={styles.hourFull}>{clock(h.hour)}</span>
                <span className={styles.hourShort}>{h.hour}</span>
              </span>
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
