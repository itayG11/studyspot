// The timetable as a week: a column per day, each class a card at its
// hours, each break of half an hour or more a dashed slot. Picking a class
// shows its details and removal; picking a break shows where to go in it
// (today's, from "between classes"); picking an empty hour fills the form.
// On a phone: the same week, scrolled sideways.

import { Coffee } from 'lucide-react'
import { useEffect, useRef, useState, type MouseEvent, type RefObject } from 'react'
import { betweenClasses } from '../api/student'
import type { BetweenClasses as Between, ClassSlot } from '../api/types'
import { useApi } from '../hooks/useApi'
import { REFRESH_INTERVAL_MS } from '../config'
import { useInstitution } from '../institution'
import { formatTime, todayWeekday, WEEK_ORDER, weekdayName } from '../logic/time'
import { classPlace, courseTone, dayLayout, hourRange, pickedTime, type Gap, type HourRange } from '../logic/week'
import { ConfirmButton, JumpTo } from '../ui'
import { BETWEEN_ID, SuggestionList } from './BetweenClasses'
import styles from './week.module.css'

const SATURDAY = 5
// A break shorter than this has room for one line: the cup and the minutes.
const SHORT_BREAK = 45
const MINUTE = 60_000
const clock = (value: string) => value.slice(0, 5)
// "בניין M", or the place as the student named it.
const placeLabel = (slot: ClassSlot) => (slot.building_code ? `בניין ${slot.building_code}` : classPlace(slot))
const minutesOf = (value: string) => Number(value.slice(0, 2)) * 60 + Number(value.slice(3, 5))

type Picked = { kind: 'class'; slot: ClassSlot } | { kind: 'gap'; day: number; gap: Gap } | null

interface Props {
  classes: ClassSlot[]
  between: Between | null
  removingId: number | null
  onRemove: (id: number) => void
  onPickTime: (weekday: number, time: string) => void
  onShowBetween: (weekday: number | null) => void
  now?: Date // a fixed moment for the tests
}

export function WeekGrid({ classes, between, removingId, onRemove, onPickTime, onShowBetween, now: start }: Props) {
  const { timezone } = useInstitution()
  const [now, setNow] = useState(() => start ?? new Date())
  useEffect(() => {
    if (start) return
    const timer = setInterval(() => setNow(new Date()), MINUTE)
    return () => clearInterval(timer)
  }, [start])
  const today = todayWeekday(timezone, now)
  const nowMinutes = minutesOf(formatTime(now.toISOString(), timezone))

  const days = WEEK_ORDER.filter((d) => d !== SATURDAY || classes.some((c) => c.weekday === SATURDAY))
  const [picked, setPicked] = useState<Picked>(null)
  const gridRef = useRef<HTMLDivElement>(null)
  const range = hourRange(classes)
  const hours = Array.from({ length: range.to - range.from }, (_, i) => range.from + i)
  const visible = days

  // A class picked and then removed, or a break that a new class filled:
  // nothing to show.
  const pickedNow = stillThere(picked, classes, range) ? picked : null

  return (
    <div className={styles.board}>
      {/* On a phone the whole week too, as on a computer: it scrolls sideways. */}
      <div className={styles.scroller} tabIndex={0} role="region" aria-label="מערכת השעות, אפשר לגלול לצדדים">
      <div ref={gridRef} tabIndex={-1} aria-label="מערכת השעות לפי ימים" role="group" className={styles.grid} style={{ ['--days' as string]: visible.length, ['--hours' as string]: hours.length }}>
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
      </div>
      {pickedNow && (
        <Details
          picked={pickedNow}
          version={classes.map((c) => `${c.id}:${c.weekday}${c.starts}${c.ends}`).join(',')}
          today={today}
          nowMinutes={nowMinutes}
          between={between}
          onShowBetween={onShowBetween}
          removingId={removingId}
          onRemove={(id) => {
            onRemove(id)
            gridRef.current?.focus()
          }}
          onClose={() => {
            setPicked(null)
            gridRef.current?.focus()
          }}
        />
      )}
      {!pickedNow && <p className={styles.hint}>לחיצה על שיעור או על הפסקה מציגה פרטים. לחיצה על שעה ריקה ממלאת את הטופס.</p>}
    </div>
  )
}

function stillThere(picked: Picked, classes: ClassSlot[], range: HourRange): boolean {
  if (picked === null) return false
  if (picked.kind === 'class') return classes.some((c) => c.id === picked.slot.id)
  const { gaps } = dayLayout(classes.filter((c) => c.weekday === picked.day), range)
  return gaps.some((g) => g.starts === picked.gap.starts && g.ends === picked.gap.ends)
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
          const short = minutesOf(slot.ends) - minutesOf(slot.starts) < 60
          return (
            <li key={slot.id} className={styles.place} style={{ top: `${top}%`, height: `${height}%` }}>
              <button
                type="button"
                className={`${styles.block} ${styles[`tone${courseTone(slot)}`]} ${short ? styles.short : ''}`}
                aria-pressed={selected}
                aria-label={`${slot.title ?? 'שיעור'}, ${name} ${clock(slot.starts)} עד ${clock(slot.ends)}, ${placeLabel(slot)}`}
                onClick={() => onPick(selected ? null : { kind: 'class', slot })}
              >
                <span className={styles.blockTitle}>{slot.title ?? 'שיעור'}</span>
                <span className={styles.blockMeta}>
                  <span dir="ltr">
                    {clock(slot.starts)}–{clock(slot.ends)}
                  </span>{' '}
                  · <bdi>{classPlace(slot)}</bdi>
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
                className={`${styles.gap} ${underWay ? styles.gapNow : ''} ${gap.minutes < SHORT_BREAK ? styles.gapShort : ''}`}
                aria-pressed={selected}
                aria-label={`הפסקה של ${gap.minutes} דקות, ${name} ${gap.starts} עד ${gap.ends}`}
                onClick={() => onPick(selected ? null : { kind: 'gap', day, gap })}
              >
                <span className={styles.gapLabel}>
                  <Coffee aria-hidden="true" />
                  <span className={styles.gapWord}>הפסקה</span>
                </span>
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

// "Between classes" on that day, as a link up the page to that section.
function ToBetween({ day, today, onShow }: { day: number; today: number; onShow: (weekday: number | null) => void }) {
  return (
    <JumpTo id={BETWEEN_ID} onJump={() => onShow(day === today ? null : day)}>
      {day === today ? 'בין שיעורים היום' : `בין שיעורים ב${weekdayName(day)}`}
    </JumpTo>
  )
}

interface DetailsProps {
  picked: NonNullable<Picked>
  version: string
  today: number
  nowMinutes: number
  between: Between | null
  onShowBetween: (weekday: number | null) => void
  removingId: number | null
  onRemove: (id: number) => void
  onClose: () => void
}

function Details({ picked, version, today, nowMinutes, between, onShowBetween, removingId, onRemove, onClose }: DetailsProps) {
  // Opened: focus moves to it, so a keyboard user lands on what they picked.
  const ref = useRef<HTMLElement>(null)
  useEffect(() => {
    ref.current?.focus()
  }, [picked])
  if (picked.kind === 'class') {
    const { slot } = picked
    return (
      <section ref={ref} tabIndex={-1} className={styles.details} aria-label="פרטי השיעור">
        <div>
          <p className={styles.detailsTitle}>{slot.title ?? 'שיעור'}</p>
          <p className={styles.detailsMeta}>
            {weekdayName(slot.weekday)} ·{' '}
            <span dir="ltr">
              {clock(slot.starts)}–{clock(slot.ends)}
            </span>{' '}
            · <bdi>{placeLabel(slot)}</bdi>
          </p>
          {!slot.building_code && <p className={styles.detailsMeta}>המקום עוד לא במפה של המוסד. ההליכה אליו מוערכת בכמה דקות.</p>}
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
  return (
    <GapDetails
      sectionRef={ref}
      version={version}
      day={picked.day}
      gap={picked.gap}
      today={today}
      nowMinutes={nowMinutes}
      between={between}
      onShowBetween={onShowBetween}
      onClose={onClose}
    />
  )
}

interface GapProps {
  sectionRef: RefObject<HTMLElement | null>
  version: string // the timetable as it is: asked again when it changes
  day: number
  gap: Gap
  today: number
  nowMinutes: number
  between: Between | null
  onShowBetween: (weekday: number | null) => void
  onClose: () => void
}

// A break's places to go: the page's own answer when it is about that day,
// otherwise asked for that day (by the forecast, on another day).
function GapDetails({ sectionRef, version, day, gap, today, nowMinutes, between, onShowBetween, onClose }: GapProps) {
  const fromPage = between && between.weekday === day ? between : null
  // Today's numbers are live: refreshed like the page's.
  const asked = useApi(
    () => betweenClasses(day),
    fromPage ? null : `between-day-${day}-${version}`,
    day === today ? REFRESH_INTERVAL_MS : undefined,
  )
  const data = fromPage ?? asked.data
  const found = data?.gaps.find((g) => clock(g.starts) === gap.starts)
  const over = day === today && nowMinutes >= minutesOf(gap.ends)
  return (
    <section ref={sectionRef} tabIndex={-1} className={styles.details} aria-label="פרטי ההפסקה">
      <div className={styles.detailsBody}>
        <p className={styles.detailsTitle}>
          הפסקה של {gap.minutes} דקות, {weekdayName(day)}{' '}
          <span dir="ltr">
            {gap.starts}–{gap.ends}
          </span>
        </p>
        {over && <p className={styles.detailsMeta}>ההפסקה הזו כבר נגמרה.</p>}
        {!over && found && found.suggestions.length > 0 && (
          <>
            {day !== today && <p className={styles.detailsMeta}>לפי העומס הצפוי באותו יום ובאותן שעות.</p>}
            <SuggestionList suggestions={found.suggestions} />
          </>
        )}
        {!over && found && found.suggestions.length === 0 && (
          <p className={styles.detailsMeta}>אין מקום פתוח ופנוי שמספיק לזמן של ההפסקה הזו.</p>
        )}
        {!over && !found && !data && !asked.error && <p className={styles.detailsMeta}>טוען הצעות…</p>}
        {!over && !found && data && <p className={styles.detailsMeta}>אין כרגע הצעות להפסקה הזו.</p>}
        {!over && !found && !data && asked.error && <p className={styles.detailsMeta}>לא הצלחנו לטעון הצעות להפסקה הזו.</p>}
        <p className={styles.detailsMeta}>
          כל ההפסקות של היום הזה: <ToBetween day={day} today={today} onShow={onShowBetween} />
        </p>
      </div>
      <div className={styles.detailsActions}>
        <button type="button" className={styles.close} onClick={onClose}>
          סגירה
        </button>
      </div>
    </section>
  )
}
