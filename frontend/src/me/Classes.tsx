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
import { Button, ErrorState, LoadingRegion, Notice, Skeleton } from '../ui'
import admin from '../admin/admin.module.css'
import styles from './me.module.css'
import { WeekGrid } from './WeekGrid'

interface Props {
  classes: ApiState<ClassSlot[]>
  between: BetweenClassesData | null // today's gaps with places to go, for the grid
  onChanged: () => void
}

export function Classes({ classes, between, onChanged }: Props) {
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
    <section aria-label="מערכת השעות" className={styles.section}>
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
          onPickTime={(weekday, starts) => setPreset({ weekday, starts, key: Date.now() })}
        />
      )}
      {removing.error && <Notice tone="error">{removing.error}</Notice>}
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
  const [title, setTitle] = useState('')
  const choices = (buildings.data ?? []).filter((b) => b.status !== 'under_construction')
  const chosen = building || choices[0]?.code || ''

  async function submit(event: FormEvent) {
    event.preventDefault()
    const added = await action.run(() =>
      addClass({ weekday, starts, ends, building_code: chosen, title: title.trim() || null }),
    )
    if (!added) return
    setStarts('')
    setEnds('')
    setTitle('')
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
          <select id={`${id}-building`} className={admin.field} dir="ltr" required value={chosen} onChange={(e) => setBuilding(e.target.value)}>
            {choices.map((b) => (
              <option key={b.code} value={b.code}>
                {b.code}
              </option>
            ))}
          </select>
        </div>
      </div>
      <label className={admin.label} htmlFor={`${id}-course`}>
        שם הקורס, לא חובה
      </label>
      <input id={`${id}-course`} className={admin.field} maxLength={60} value={title} onChange={(e) => setTitle(e.target.value)} />
      <Button type="submit" size="sm" busy={action.busy} disabled={!chosen}>
        הוספת שיעור
      </Button>
      {action.error && <Notice tone="error">{action.error}</Notice>}
    </form>
  )
}
