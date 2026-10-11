// "Between classes today": each gap of the student's day, with up to three
// places worth going to, and the numbers that make each one worth it
// (app/between_classes.py on the server works them out).

import { Link } from 'react-router'
import type { BetweenClasses as Data, ClassSlot, Suggestion } from '../api/types'
import type { ApiState } from '../hooks/useApi'
import { useInstitution } from '../institution'
import { levelWord, type ForecastLevel } from '../logic/forecast'
import { HIGH_FROM, MEDIUM_FROM } from '../logic/occupancy'
import { ErrorState, JumpTo, LoadingRegion, Skeleton } from '../ui'
import styles from './me.module.css'

const clock = (value: string) => value.slice(0, 5)
const walking = (minutes: number) => (minutes === 1 ? 'דקת הליכה אחת' : `${minutes} דקות הליכה`)

const minutesOf = (value: string) => Number(value.slice(0, 2)) * 60 + Number(value.slice(3, 5))

// Today's gaps of half an hour or more, from the timetable (the same rule as
// the server's find_gaps, app/between_classes.py).
function gapsOf(classes: ClassSlot[], weekday: number) {
  const today = classes.filter((c) => c.weekday === weekday).sort((a, b) => a.starts.localeCompare(b.starts))
  const gaps = []
  for (let i = 1; i < today.length; i++) {
    if (minutesOf(today[i].starts) - minutesOf(today[i - 1].ends) >= 30) gaps.push({ starts: today[i - 1].ends, ends: today[i].starts })
  }
  return gaps
}

function load(s: Suggestion): string {
  // Not bookable: the student has no bookings left (two ahead at most).
  if (s.kind === 'group_room') return s.bookable ? 'החדר פנוי, אפשר להזמין' : 'החדר פנוי'
  if (s.available !== null) return `${s.available} מקומות פנויים עכשיו`
  if (s.usual === null) return 'אין עדיין חיזוי'
  const share = s.usual / s.capacity
  const level: ForecastLevel = share >= HIGH_FROM ? 'high' : share >= MEDIUM_FROM ? 'medium' : 'low'
  return `בדרך כלל ${levelWord(level, s.kind)}`
}

// The timetable grid links here (WeekGrid's ToBetween).
export const BETWEEN_ID = 'between-classes'

// A gap's places to go, each with why. Also in the timetable grid.
export function SuggestionList({ suggestions }: { suggestions: Suggestion[] }) {
  const { slug } = useInstitution()
  return (
    <ol className={styles.suggestions}>
      {suggestions.map((s) => (
        <li key={s.place_id}>
          <Link to={`/${slug}/spaces/${s.place_id}`} className={styles.suggestionName}>
            {s.name}
          </Link>
          <span className={styles.suggestionWhy}>
            בניין <bdi>{s.building_code}</bdi> · {walking(s.walk_there)} · {s.sit_minutes} דקות לשבת · {load(s)}
          </span>
        </li>
      ))}
    </ol>
  )
}

export function BetweenClasses({ between, classes }: { between: ApiState<Data>; classes: ClassSlot[] | null }) {
  let body
  if (!between.data && between.error) body = <ErrorState error={between.error} onRetry={between.reload} compact />
  else if (!between.data) {
    body = (
      <LoadingRegion>
        <Skeleton height="120px" radius="var(--r-lg)" />
      </LoadingRegion>
    )
  } else if (classes?.length === 0) {
    body = (
      <div className={styles.idle}>
        <p className={styles.idleTitle}>עוד אין לך מערכת שעות.</p>
        <p className={styles.idleText}>הוסף את השיעורים שלך <JumpTo id="my-timetable">במערכת השעות</JumpTo> למטה, ונציע לך מקום ללמוד בכל הפסקה.</p>
      </div>
    )
  } else if (between.data.gaps.length === 0) {
    // The server lists only gaps not over yet: a gap today that is gone is
    // over, not missing.
    const over = gapsOf(classes ?? [], between.data.weekday)
    body = over.length > 0 ? (
      <div className={styles.idle}>
        <p className={styles.idleTitle}>{over.length === 1 ? 'ההפסקה של היום כבר נגמרה:' : 'ההפסקות של היום כבר נגמרו:'}</p>
        <p className={styles.idleText}>
          {over.map((g, i) => (
            <span key={g.starts}>
              {i > 0 && ', '}
              <span dir="ltr">{`${clock(g.starts)}–${clock(g.ends)}`}</span>
            </span>
          ))}
        </p>
        <p className={styles.idleText}>ההצעות מופיעות כאן לפני כל הפסקה ובמהלכה.</p>
      </div>
    ) : (
      <div className={styles.idle}>
        <p className={styles.idleTitle}>אין היום הפסקות של חצי שעה ומעלה.</p>
        <p className={styles.idleText}>בימים עם הפסקה, תראה כאן לאן כדאי ללכת.</p>
      </div>
    )
  } else {
    body = between.data.gaps.map((gap) => {
      const range = `${clock(gap.starts)}–${clock(gap.ends)}`
      return (
        <article key={gap.starts} className={styles.gap} aria-label={`הפסקה ${range}`}>
          <header className={styles.gapHead}>
            <span className={styles.num} dir="ltr">
              {range}
            </span>
            <span className={styles.gapRoute}>
              מבניין {gap.from_building} לבניין {gap.to_building}
            </span>
            {gap.now && <span className={styles.gapNow}>עכשיו</span>}
          </header>
          {gap.suggestions.length === 0 ? (
            <p className={styles.idleText}>אין מקום פתוח ופנוי שמספיק לזמן שנשאר בהפסקה הזו.</p>
          ) : (
            <SuggestionList suggestions={gap.suggestions} />
          )}
        </article>
      )
    })
  }
  return (
    <section id={BETWEEN_ID} tabIndex={-1} aria-label="בין שיעורים היום" className={`${styles.section} ${styles.jumpTarget}`}>
      <h2 className={styles.heading}>בין שיעורים היום</h2>
      {body}
      {between.data && between.data.gaps.length > 0 && (
        <p className={styles.idleText}>זמני ההליכה הם הערכה לפי המפה, ולא מסלול מדויק.</p>
      )}
    </section>
  )
}
