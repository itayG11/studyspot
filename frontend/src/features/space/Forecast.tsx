// "How busy is it usually?": the load forecast of one place, hour by hour,
// on a day of the week the student picks (today first). Read right to
// left, like the day's bar above it. The columns are a picture; the same
// facts are in a list for screen readers, and the levels are in words.

import { useEffect, useState } from 'react'
import { getForecast } from '../../api/campus'
import type { Place } from '../../api/types'
import { useApi } from '../../hooks/useApi'
import { useLiveSimulated } from '../../institution'
import { hourly, withToday } from '../../logic/load'
import { LoadChart } from '../load/LoadChart'
import { forecastLimit, freesAt, levelWord, usualAt } from '../../logic/forecast'
import { formatTime, todayWeekday, WEEK_ORDER, weekdayName } from '../../logic/time'
import { Chip, ErrorState } from '../../ui'
import styles from './space.module.css'

// Python's numbering, Monday = 0.
const SHORT = ['ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳', 'א׳']

interface Props {
  place: Place
  timeZone: string
  now?: Date // a fixed moment for the tests; otherwise the clock
}

const MINUTE = 60_000
const currentHourOf = (clock: string) => Number(clock.slice(0, 2))

export function PlaceForecast({ place, timeZone, now: start }: Props) {
  // Kept in state and moved on every minute, like the day's bar.
  const [now, setNow] = useState(() => start ?? new Date())
  useEffect(() => {
    if (start) return // a fixed moment, in the tests
    const timer = setInterval(() => setNow(new Date()), MINUTE)
    return () => clearInterval(timer)
  }, [start])
  const today = todayWeekday(timeZone, now)
  // Today until the student picks a day: after midnight, the new today.
  const [picked, setPicked] = useState<number | null>(null)
  const weekday = picked ?? today
  const forecast = useApi(() => getForecast(place.id, weekday), `forecast-${place.id}-${weekday}`)
  const data = forecast.data?.weekday === weekday ? forecast.data : null
  const limit = forecastLimit(place.kind, place.capacity)
  const clock = formatTime(now.toISOString(), timeZone)
  const isToday = weekday === today
  const room = place.kind === 'group_room'
  const simulated = useLiveSimulated()

  let body
  if (!data && forecast.error) body = <ErrorState error={forecast.error} onRetry={forecast.reload} compact />
  else if (!data) body = <div className={styles.barSkeleton} aria-hidden="true" />
  else if (data.closed) body = <p className={styles.muted}>סגור ביום הזה.</p>
  else if (data.slots.length === 0) {
    body = (
      <>
        <p className={styles.muted}>עוד אין מספיק נתונים. החיזוי מופיע אחרי שבועיים של כניסות למקום.</p>
        {/* No usual yet, but today's people can still be shown. */}
        {isToday && (data.today ?? []).length > 0 && (
          <LoadChart
            hours={withToday([], data.today ?? [], clock)}
            limit={limit}
            currentHour={currentHourOf(clock)}
            live={place.is_open && !room ? place.occupied : null}
            simulated={simulated}
            kind={place.kind}
          />
        )}
      </>
    )
  } else {
    const usual = isToday ? usualAt(data, clock) : null
    const currentHour = Number(clock.slice(0, 2))
    // The server leaves it out in special periods (exams): then not here either.
    const frees = isToday && place.is_open && place.available === 0 && data.frees_at ? freesAt(data, clock, limit) : null
    body = (
      <>
        {usual !== null && place.is_open && (
          <p className={styles.forecastNow}>
            {room
              ? `בדרך כלל בשעה הזו: ${levelWord(usual >= 0.85 ? 'high' : usual >= 0.5 ? 'medium' : 'low', place.kind)}.`
              : `עכשיו ${place.occupied} מתוך ${place.capacity}. בדרך כלל בשעה הזו: ${Math.round(usual)}.`}
          </p>
        )}
        {frees && <p className={styles.forecastNow}>בדרך כלל מתפנה ב-{frees}.</p>}
        {isToday ? (
          <LoadChart
            hours={withToday(hourly(data.slots.map((s) => ({ start: s.start, usual: s.people, today: null }))), data.today ?? [], clock)}
            limit={limit}
            currentHour={currentHour}
            live={place.is_open && !room ? place.occupied : null}
            simulated={simulated}
            kind={place.kind}
          />
        ) : (
          <LoadChart
            hours={hourly(data.slots.map((s) => ({ start: s.start, usual: s.people, today: null })))}
            limit={limit}
            currentHour={null}
            live={null}
            simulated={simulated}
            kind={place.kind}
          />
        )}
        <p className={styles.demo}>
          לפי {data.weeks} השבועות האחרונים.
          {data.simulated && ' נתוני דמו: ההיסטוריה כאן מדומה, כדי להראות איך החיזוי עובד.'}
        </p>
      </>
    )
  }

  return (
    <section className={styles.card} aria-labelledby="forecast">
      <h2 id="forecast" className={styles.h2}>
        עומס צפוי
      </h2>
      <div className={styles.forecastDays} role="group" aria-label="יום בשבוע">
        {WEEK_ORDER.map((day) => (
          <Chip key={day} className={styles.forecastDay} selected={day === weekday} aria-label={weekdayName(day)} onClick={() => setPicked(day)}>
            {SHORT[day]}
          </Chip>
        ))}
      </div>
      {body}
    </section>
  )
}
