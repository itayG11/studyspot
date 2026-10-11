// The timetable as a week: a column per day, each class a card at its
// hours, each break of half an hour or more a dashed slot. Picking a class
// shows its details and removal; picking a break shows where to go in it
// (today's, from "between classes"); picking an empty hour fills the form.
// On a phone: one day at a time, chosen by tabs.

import { useEffect, useState, type MouseEvent } from 'react'
import type { BetweenClasses as Between, ClassSlot } from '../api/types'
import { useMediaQuery } from '../hooks/useMediaQuery'
import { useInstitution } from '../institution'
import { formatTime, todayWeekday, WEEK_ORDER, weekdayName } from '../logic/time'
import { courseTone, dayLayout, hourRange, pickedTime, type Gap, type HourRange } from '../logic/week'
import { Chip, ConfirmButton } from '../ui'
import { SuggestionList } from './BetweenClasses'
import styles from './week.module.css'

const SATURDAY = 5
const MINUTE = 60_000
const clock = (value: string) => value.slice(0, 5)
const minutesOf = (value: string) => Number(value.slice(0, 2)) * 60 + Number(value.slice(3, 5))

type Picked = { kind: 'class'; slot: ClassSlot } | { kind: 'gap'; day: number; gap: Gap } | null

interface Props {
  classes: ClassSlot[]
  between: Between | null
  removingId: number | null
  onRemove: (id: number) => void
  onPickTime: (weekday: number, time: string) => void
  now?: Date // a fixed moment for the tests
}

export function WeekGrid({ classes, between, removingId, onRemove, onPickTime, now: start }: Props) {
  const { timezone } = useInstitution()
  const [now, setNow] = useState(() => start ?? new Date())
  useEffect(() => {
    if (start) return
    const timer = setInterval(() => setNow(new Date()), MINUTE)
    return () => clearInterval(timer)
  }, [start])
  const today = todayWeekday(timezone, now)
  const nowMinutes = minutesOf(formatTime(now.toISOString(), timezone))

  const phone = useMediaQuery('(max-width: 720px)')
  const days = WEEK_ORDER.filter((d) => d !== SATURDAY || classes.some((c) => c.weekday === SATURDAY))
  const [shownDay, setShownDay] = useState<number | null>(null)
  const firstDay = days.includes(today) ? today : (days.find((d) => classes.some((c) => c.weekday === d)) ?? days[0])
  const phoneDay = shownDay ?? firstDay
  const [picked, setPicked] = useState<Picked>(null)
  const range = hourRange(classes)
  const hours = Array.from({ length: range.to - range.from }, (_, i) => range.from + i)
  const visible = phone ? [phoneDay] : days

  // A class picked and then removed: nothing to show.
  const pickedNow = picked?.kind === 'class' && !classes.some((c) => c.id === picked.slot.id) ? null : picked

  return (
    <div className={styles.board}>
      {phone && (
        <div className={styles.tabs} role="group" aria-label="יום בשבוע">
          {days.map((d) => (
            <Chip key={d} selected={d === phoneDay} onClick={() => setShownDay(d)}>
              {weekdayName(d).replace('יום ', '')}
            </Chip>
          ))}
        </div>
      )}
      <div className={styles.grid} style={{ ['--days' as string]: visible.length, ['--hours' as string]: hours.length }}>
        <div className={styles.corner} aria-hidden="true" />
        {visible.map((d) => (
          <div key={d} className={`${styles.dayHead} ${d === today ? styles.today : ''}`} aria-hidden="true">
            {weekdayName(d).replace('יום ', '')}
            {d === today && <span className={styles.todayMark}>היום</span>}
          </div>
        ))}
        <div className={styles.gutter} aria-hidden="true">
          {hours.map((h) => (
            <span key={h} className={styles.hourLabel} dir="ltr">
              {String(h).padStart(2, '0')}:00
            </span>
          ))}
        </div>
        {visible.map((d) => (
          <Day
            key={d}
            day={d}
            classes={classes.filter((c) => c.weekday === d)}
            range={range}
            isToday={d === today}
            nowMinutes={nowMinutes}
            picked={pickedNow}
            onPick={setPicked}
            onPickTime={onPickTime}
          />
        ))}
      </div>
      {pickedNow && (
        <Details picked={pickedNow} today={today} between={between} removingId={removingId} onRemove={onRemove} onClose={() => setPicked(null)} />
      )}
      {!pickedNow && <p className={styles.hint}>לחיצה על שיעור או על הפסקה מציגה פרטים. לחיצה על שעה ריקה ממלאת את הטופס.</p>}
    </div>
  )
}

interface DayProps {
  day: number
  classes: ClassSlot[]
  range: HourRange
  isToday: boolean
  nowMinutes: number
  picked: Picked
  onPick: (picked: Picked) => void
  onPickTime: (weekday: number, time: string) => void
}

function Day({ day, classes, range, isToday, nowMinutes, picked, onPick, onPickTime }: DayProps) {
  const { blocks, gaps } = dayLayout(classes, range)
  const span = (range.to - range.from) * 60
  const nowTop = ((nowMinutes - range.from * 60) / span) * 100
  const name = weekdayName(day)

  // An empty hour: the form, filled with this day and the half hour clicked.
  function pickEmpty(event: MouseEvent<HTMLDivElement>) {
    if (event.target !== event.currentTarget) return
    const box = event.currentTarget.getBoundingClientRect()
    onPickTime(day, pickedTime((event.clientY - box.top) / box.height, range))
  }

  return (
    <div className={`${styles.day} ${isToday ? styles.todayColumn : ''}`} onClick={pickEmpty}>
      <ul className={styles.dayList} aria-label={name}>
        {blocks.map(({ slot, top, height }) => {
          const selected = picked?.kind === 'class' && picked.slot.id === slot.id
          const short = height < 7
          return (
            <li key={slot.id} className={styles.place} style={{ top: `${top}%`, height: `${height}%` }}>
              <button
                type="button"
                className={`${styles.block} ${styles[`tone${courseTone(slot)}`]} ${short ? styles.short : ''}`}
                aria-pressed={selected}
                aria-label={`${slot.title ?? 'שיעור'}, ${name} ${clock(slot.starts)} עד ${clock(slot.ends)}, בניין ${slot.building_code}`}
                onClick={() => onPick(selected ? null : { kind: 'class', slot })}
              >
                <span className={styles.blockTitle}>{slot.title ?? 'שיעור'}</span>
                <span className={styles.blockMeta}>
                  <span dir="ltr">
                    {clock(slot.starts)}–{clock(slot.ends)}
                  </span>{' '}
                  · <bdi>{slot.building_code}</bdi>
                </span>
              </button>
            </li>
          )
        })}
        {gaps.map((gap) => {
          const selected = picked?.kind === 'gap' && picked.day === day && picked.gap.starts === gap.starts
          const underWay = isToday && minutesOf(gap.starts) <= nowMinutes && nowMinutes < minutesOf(gap.ends)
          return (
            <li key={`gap-${gap.starts}`} className={styles.place} style={{ top: `${gap.top}%`, height: `${gap.height}%` }}>
              <button
                type="button"
                className={`${styles.gap} ${underWay ? styles.gapNow : ''}`}
                aria-pressed={selected}
                aria-label={`הפסקה של ${gap.minutes} דקות, ${name} ${gap.starts} עד ${gap.ends}`}
                onClick={() => onPick(selected ? null : { kind: 'gap', day, gap })}
              >
                <span>הפסקה</span>
                <span className={styles.gapMinutes}>{gap.minutes} דק׳</span>
              </button>
            </li>
          )
        })}
      </ul>
      {isToday && nowTop > 0 && nowTop < 100 && <span className={styles.nowLine} style={{ top: `${nowTop}%` }} aria-hidden="true" />}
    </div>
  )
}

interface DetailsProps {
  picked: NonNullable<Picked>
  today: number
  between: Between | null
  removingId: number | null
  onRemove: (id: number) => void
  onClose: () => void
}

function Details({ picked, today, between, removingId, onRemove, onClose }: DetailsProps) {
  if (picked.kind === 'class') {
    const { slot } = picked
    return (
      <section className={styles.details} aria-label="פרטי השיעור">
        <div>
          <p className={styles.detailsTitle}>{slot.title ?? 'שיעור'}</p>
          <p className={styles.detailsMeta}>
            {weekdayName(slot.weekday)} ·{' '}
            <span dir="ltr">
              {clock(slot.starts)}–{clock(slot.ends)}
            </span>{' '}
            · בניין <bdi>{slot.building_code}</bdi>
          </p>
        </div>
        <div className={styles.detailsActions}>
          <ConfirmButton label="הסרה" confirmLabel="כן, להסיר" size="sm" busy={removingId === slot.id} onConfirm={() => onRemove(slot.id)} />
          <button type="button" className={styles.close} onClick={onClose}>
            סגירה
          </button>
        </div>
      </section>
    )
  }
  const { day, gap } = picked
  // Today's gaps come with places to go; other days get them on the day.
  const todays = day === today ? between?.gaps.find((g) => clock(g.starts) === gap.starts) : undefined
  return (
    <section className={styles.details} aria-label="פרטי ההפסקה">
      <div className={styles.detailsBody}>
        <p className={styles.detailsTitle}>
          הפסקה של {gap.minutes} דקות, {weekdayName(day)}{' '}
          <span dir="ltr">
            {gap.starts}–{gap.ends}
          </span>
        </p>
        {todays && todays.suggestions.length > 0 && <SuggestionList suggestions={todays.suggestions} />}
        {todays && todays.suggestions.length === 0 && <p className={styles.detailsMeta}>אין מקום פתוח ופנוי שמספיק לזמן שנשאר בהפסקה הזו.</p>}
        {!todays && day === today && <p className={styles.detailsMeta}>ההפסקה הזו כבר נגמרה.</p>}
        {day !== today && <p className={styles.detailsMeta}>ביום ההפסקה, כאן ובאזור "בין שיעורים היום", יופיעו מקומות פנויים קרובים שמספיקים לזמן שלה.</p>}
      </div>
      <div className={styles.detailsActions}>
        <button type="button" className={styles.close} onClick={onClose}>
          סגירה
        </button>
      </div>
    </section>
  )
}
