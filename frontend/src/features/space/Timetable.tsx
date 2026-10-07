import type { PlaceDetail } from '../../api/types'
import { formatClock, todayWeekday, weekdayName, WEEK_ORDER } from '../../logic/time'
import styles from './space.module.css'

// The week's opening hours, today first in the reader's eye (highlighted).
export function Timetable({ place, timeZone }: { place: PlaceDetail; timeZone: string }) {
  // Read on every render: the page refreshes every 30 seconds, so after
  // midnight the highlight moves with the server's "open all day today".
  const today = todayWeekday(timeZone)
  return (
    <table className={styles.timetable}>
      <caption className={styles.h2}>שעות פתיחה</caption>
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
