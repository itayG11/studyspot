// "My timetable": the student's week, to add to and remove from. The
// server checks every class (app/classes.py); this form only asks.

import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { getBuildings } from '../api/campus'
import { addClass, removeClass } from '../api/student'
import type { BetweenClasses as BetweenClassesData, ClassSlot } from '../api/types'
import { useAuth } from '../auth/AuthContext'
import { useAction } from '../hooks/useAction'
import { useApi, type ApiState } from '../hooks/useApi'
import { useInstitution } from '../institution'
import { WEEK_ORDER, weekdayName } from '../logic/time'
import { ActionError, Button, ErrorState, LoadingRegion, Skeleton } from '../ui'
import admin from '../admin/admin.module.css'
import styles from './me.module.css'
import { ImportClasses } from './ImportClasses'
import { WeekGrid } from './WeekGrid'

// The building picker's choice for a place the campus does not list.
const NOT_LISTED = '-'

interface Props {
  classes: ApiState<ClassSlot[]>
  between: BetweenClassesData | null // a day's gaps with places to go, for the grid
  onShowBetween: (weekday: number | null) => void // "between classes" on that day (null: today)
  onChanged: () => void
}

export function Classes({ classes, between, onShowBetween, onChanged }: Props) {
  const { user } = useAuth()
  const list = classes.data
  const removing = useAction()
  const [removingId, setRemovingId] = useState<number | null>(null) // only that class's button spins
  // An empty hour picked on the grid: the form opens on that day and time.
  const [preset, setPreset] = useState<{ weekday: number; starts: string; key: number } | null>(null)

  async function remove(id: number) {
    setRemovingId(id)
    const done = await removing.run(() => removeClass(id).then(() => true))
    setRemovingId(null)
    if (done) onChanged()
  }
  return (
    <section id="my-timetable" tabIndex={-1} aria-label="מערכת השעות" className={`${styles.section} ${styles.jumpTarget}`}>
      <h2 className={styles.heading}>מערכת השעות</h2>
      {user?.is_demo && (
        <p className={styles.idleText}>המערכת כאן לדוגמה, ומשותפת לכל המבקרים. כל יום היא חוזרת למצב ההתחלתי, ושמות קורסים חדשים לא נשמרים בה.</p>
      )}
      {!list && classes.error && <ErrorState error={classes.error} onRetry={classes.reload} compact />}
      {!list && !classes.error && (
        <LoadingRegion>
          <Skeleton height="96px" radius="var(--r-lg)" />
        </LoadingRegion>
      )}
      {list && (
        <WeekGrid
          classes={list}
          between={between}
          removingId={removingId}
          onRemove={(id) => void remove(id)}
          onShowBetween={onShowBetween}
          onPickTime={(weekday, starts) => setPreset({ weekday, starts, key: Date.now() })}
        />
      )}
      <ActionError action={removing} />
      <ImportClasses onAdded={onChanged} />
      <NewClassForm preset={preset} onAdded={onChanged} />
      <p className={styles.idleText}>רק אתה רואה את המערכת שלך. היא נמחקת עם החשבון.</p>
    </section>
  )
}

function NewClassForm({ preset, onAdded }: { preset: { weekday: number; starts: string; key: number } | null; onAdded: () => void }) {
  const id = useId()
  const { slug } = useInstitution()
  const buildings = useApi(() => getBuildings(slug), `buildings-${slug}`)
  const action = useAction()
  const [weekday, setWeekday] = useState(6)
  const [starts, setStarts] = useState('')
  const endsRef = useRef<HTMLInputElement>(null)
  // An empty hour picked on the grid: that day and time, and straight to the
  // end time. What was already typed (building, course) stays.
  const [applied, setApplied] = useState<number | null>(null)
  if (preset && preset.key !== applied) {
    setApplied(preset.key)
    setWeekday(preset.weekday)
    setStarts(preset.starts)
  }
  useEffect(() => {
    if (preset) endsRef.current?.focus()
  }, [preset])
  const [ends, setEnds] = useState('')
  const [building, setBuilding] = useState('')
  const [place, setPlace] = useState('') // a place the campus does not list, in words
  const [title, setTitle] = useState('')
  const choices = (buildings.data ?? []).filter((b) => b.status !== 'under_construction')
  // No buildings on the campus yet: a place in words is the only choice.
  const chosen = building || choices[0]?.code || (buildings.data ? NOT_LISTED : '')
  const elsewhere = chosen === NOT_LISTED

  async function submit(event: FormEvent) {
    event.preventDefault()
    const added = await action.run(() =>
      addClass({
        weekday,
        starts,
        ends,
        ...(elsewhere ? { place_text: place.trim() } : { building_code: chosen }),
        title: title.trim() || null,
      }),
    )
    if (!added) return
    setStarts('')
    setEnds('')
    setTitle('')
    setPlace('')
    onAdded()
  }

  return (
    <form className={admin.form} onSubmit={(event) => void submit(event)} aria-labelledby={`${id}-title`}>
      <h3 id={`${id}-title`} className={admin.formTitle}>
        שיעור חדש
      </h3>
      <div className={styles.classFields}>
        <div className={styles.classField}>
          <label className={admin.label} htmlFor={`${id}-day`}>
            יום
          </label>
          <select id={`${id}-day`} className={admin.field} value={weekday} onChange={(e) => setWeekday(Number(e.target.value))}>
            {WEEK_ORDER.map((day) => (
              <option key={day} value={day}>
                {weekdayName(day)}
              </option>
            ))}
          </select>
        </div>
        <div className={styles.classField}>
          <label className={admin.label} htmlFor={`${id}-starts`}>
            מתחיל
          </label>
          <input id={`${id}-starts`} className={admin.field} type="time" required value={starts} onChange={(e) => setStarts(e.target.value)} />
        </div>
        <div className={styles.classField}>
          <label className={admin.label} htmlFor={`${id}-ends`}>
            נגמר
          </label>
          <input ref={endsRef} id={`${id}-ends`} className={admin.field} type="time" required value={ends} onChange={(e) => setEnds(e.target.value)} />
        </div>
        <div className={styles.classField}>
          <label className={admin.label} htmlFor={`${id}-building`}>
            בניין
          </label>
          <select id={`${id}-building`} className={admin.field} required value={chosen} onChange={(e) => setBuilding(e.target.value)}>
            {choices.map((b) => (
              <option key={b.code} value={b.code}>
                {b.code}
              </option>
            ))}
            <option value={NOT_LISTED}>מקום שלא ברשימה</option>
          </select>
        </div>
      </div>
      {elsewhere && (
        <>
          <label className={admin.label} htmlFor={`${id}-place`}>
            שם המקום
          </label>
          <input id={`${id}-place`} className={admin.field} required maxLength={40} value={place} onChange={(e) => setPlace(e.target.value)} />
          <p className={styles.idleText}>מנהל המוסד יראה כמה סטודנטים מזכירים את המקום, בלי שמות, ויוכל להוסיף אותו לרשימה.</p>
        </>
      )}
      <label className={admin.label} htmlFor={`${id}-course`}>
        שם הקורס, לא חובה
      </label>
      <input id={`${id}-course`} className={admin.field} maxLength={60} value={title} onChange={(e) => setTitle(e.target.value)} />
      <Button type="submit" size="sm" busy={action.busy} disabled={!chosen || (elsewhere && !place.trim())}>
        הוספת שיעור
      </Button>
      <ActionError action={action} />
    </form>
  )
}
