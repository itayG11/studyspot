// Many buildings and places at once, from a table (Excel or CSV): the
// server reads it and says what it holds, nothing saved; the admin decides
// about each building that is already there; then one save, all or none
// (backend/app/campus_import.py).

import { Upload } from 'lucide-react'
import { useId, useState, type ChangeEvent } from 'react'
import { previewCampusImport, saveCampusImport } from '../api/admin'
import { ApiError } from '../api/client'
import type { CampusImportBuilding, CampusPreview, CampusSaved, ImportedBuilding, ImportedPlace } from '../api/types'
import { errorMessage } from '../i18n/errors'
import { floorLabel, KIND_LABELS, STATUS_LABELS } from '../i18n/labels'
import { useInstitution } from '../institution'
import { Button, ConfirmButton, Notice } from '../ui'
import picker from '../me/import.module.css'
import styles from './admin.module.css'

type Choice = 'add' | 'skip' | 'replace'

// The timetable import shares these codes; here they are about a table.
const TABLE_MESSAGES: Record<string, string> = {
  import_too_big: 'הקובץ גדול מדי. עד 200 קילובייט, ועד 300 שורות.',
  import_not_xlsx: 'לא הצלחנו לפתוח את קובץ האקסל. שומרים אותו שוב, או כ-CSV.',
  import_empty: 'לא מצאנו בטבלה אף שורה מתחת לכותרות.',
}
const message = (code: string) => TABLE_MESSAGES[code] ?? errorMessage(code)

const TABLES = '.xlsx,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

const many = (n: number, one: string, several: string) => (n === 1 ? one : `${n} ${several}`)
const buildingsWord = (n: number) => many(n, 'בניין אחד', 'בניינים')
const placesWord = (n: number) => many(n, 'מקום אחד', 'מקומות')
// "and": "ו-2 מקומות", but "ומקום אחד".
const and = (words: string) => (/^\d/.test(words) ? `ו-${words}` : `ו${words}`)

// The places of a building that would be saved, by the admin's choice: into
// a building that is there, only those that fit it (the rest are skipped).
function sent(building: ImportedBuilding, choice: Choice): ImportedPlace[] {
  if (choice === 'skip') return []
  if (choice === 'replace' || building.existing === null) return building.places
  return building.places.filter((place) => place.when_added === null)
}

function request(building: ImportedBuilding, choice: Choice): CampusImportBuilding {
  const { code, name, floors_count, status, latitude, longitude, existing } = building
  return {
    code, name, floors_count, status, latitude, longitude,
    // "create": new at the preview, so refused if it was added elsewhere since.
    action: existing === null ? 'create' : choice === 'replace' ? 'replace' : 'add',
    // What the admin was shown: if it changed since, nothing is deleted.
    ...(choice === 'replace' && existing
      ? { expected_places: existing.places, expected_upcoming_bookings: existing.upcoming_bookings }
      : {}),
    places: sent(building, choice).map(({ kind, name, floor, capacity, lab_rows, lab_cols, location_note, weekday_hours, friday_hours }) => ({
      kind, name, floor,
      ...(capacity !== null ? { capacity } : {}),
      ...(lab_rows !== null && lab_cols !== null ? { lab_rows, lab_cols } : {}),
      ...(location_note ? { location_note } : {}),
      ...(weekday_hours ? { weekday_hours } : {}),
      ...(friday_hours ? { friday_hours } : {}),
    })),
  }
}

// The table's own hours, if it gives any: "א'-ה' 07:00-20:00 · ו' סגור".
function hoursText(place: ImportedPlace): string | null {
  const day = (label: string, hours: string | null) => hours && `${label} ${hours === 'closed' ? 'סגור' : hours}`
  const parts = [day("א'-ה'", place.weekday_hours), day("ו'", place.friday_hours)].filter(Boolean)
  return parts.length > 0 ? parts.join(' · ') : null
}

// Hebrew agrees in number: "נוסף בניין אחד", "נוספו 2 בניינים".
function savedText(saved: CampusSaved, skipped: number): string {
  const b = saved.buildings_added
  const p = saved.places_added
  const r = saved.buildings_replaced
  const parts = [
    b > 0 && p > 0 && `נוספו ${buildingsWord(b)} ${and(placesWord(p))}.`,
    b > 0 && p === 0 && (b === 1 ? 'נוסף בניין אחד.' : `נוספו ${b} בניינים.`),
    b === 0 && p > 0 && (p === 1 ? 'נוסף מקום אחד.' : `נוספו ${p} מקומות.`),
    r > 0 && (r === 1 ? 'בניין אחד נמחק ונוסף מחדש.' : `${r} בניינים נמחקו ונוספו מחדש.`),
    skipped > 0 &&
      (skipped === 1
        ? 'מקום אחד, שכבר קיים או שלא מתאים לבניין הקיים, דולג.'
        : `${skipped} מקומות, שכבר קיימים או שלא מתאימים לבניין הקיים, דולגו.`),
  ].filter(Boolean)
  return parts.length > 0 ? parts.join(' ') : 'לא נוספו בניינים או מקומות.'
}

export function BulkImport({ onSaved }: { onSaved: () => void }) {
  const id = useId()
  const { slug } = useInstitution()
  const [preview, setPreview] = useState<CampusPreview | null>(null)
  const [choices, setChoices] = useState<Record<string, Choice>>({})
  const [reading, setReading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)

  async function pick(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = '' // the same file can be picked again, after fixing it
    if (!file) return
    setProblem(null)
    setDone(null)
    setReading(true)
    try {
      setPreview(await previewCampusImport(slug, file))
      setChoices({})
    } catch (reason) {
      setPreview(null)
      setProblem(message(reason instanceof ApiError ? reason.code : 'unknown_error'))
    } finally {
      setReading(false)
    }
  }

  const choiceOf = (b: ImportedBuilding): Choice => choices[b.code] ?? 'add'
  // A building that is there, with nothing new for it, has nothing to save.
  const chosen = (preview?.buildings ?? []).filter(
    (b) => choiceOf(b) !== 'skip' && !(b.existing && choiceOf(b) === 'add' && sent(b, 'add').length === 0),
  )
  const skipped = chosen.reduce((sum, b) => sum + b.places.length - sent(b, choiceOf(b)).length, 0)
  const placeCount = chosen.reduce((sum, b) => sum + sent(b, choiceOf(b)).length, 0)
  const replacing = chosen.some((b) => b.existing !== null && choiceOf(b) === 'replace')
  const saveLabel = `לשמור ${buildingsWord(chosen.length)}${placeCount > 0 ? ` ${and(placesWord(placeCount))}` : ''}`

  async function save() {
    if (!preview) return
    setSaving(true)
    setProblem(null)
    try {
      const saved = await saveCampusImport(slug, chosen.map((b) => request(b, choiceOf(b))))
      setPreview(null)
      setDone(savedText(saved, skipped))
      onSaved()
    } catch (reason) {
      setProblem(message(reason instanceof ApiError ? reason.code : 'unknown_error'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className={styles.form} aria-labelledby={`${id}-title`}>
      <h2 id={`${id}-title`} className={styles.formTitle}>
        הרבה בניינים בבת אחת
      </h2>
      <p className={styles.lead}>
        טבלה עם שורה לכל מקום: פרטי הבניין, ואחריהם פרטי המקום. שורה בלי מקום מוסיפה בניין בלבד. מתחילים מהתבנית:{' '}
        <a href="/templates/buildings.xlsx" download>
          תבנית אקסל
        </a>{' '}
        או{' '}
        <a href="/templates/buildings.csv" download>
          תבנית CSV
        </a>
        .
      </p>
      <label className={picker.pick}>
        <Upload aria-hidden="true" />
        <span>העלאת טבלה</span>
        <input type="file" className="visually-hidden" accept={TABLES} disabled={reading || saving} onChange={(e) => void pick(e)} />
      </label>
      <p className={picker.hint}>
        {reading ? 'קורא את הטבלה…' : 'הקובץ לא נשמר. לפני שמירה מוצג מה נמצא בו, ושום דבר לא נשמר עד שמאשרים.'}
      </p>
      {problem && <Notice tone="error">{problem}</Notice>}
      {done && (
        <Notice tone="success">
          {done} השלטים מוכנים בלשונית השלטים, ואת המיקום על המפה קובעים ב"מיקום בניינים".
        </Notice>
      )}
      {preview && (
        <div className={styles.subform}>
          <h3 className={styles.formTitle}>מה נמצא בטבלה</h3>
          {preview.problems.length > 0 && (
            <Notice tone="warning">
              <p>שורות שלא ייכנסו. מתקנים אותן בקובץ ומעלים שוב:</p>
              <ul className={styles.rules}>
                {preview.problems.map((p) => (
                  <li key={p.line}>{`שורה ${p.line}: ${message(p.code)}`}</li>
                ))}
              </ul>
            </Notice>
          )}
          {preview.buildings.map((b) => (
            <ImportedBuildingCard
              key={b.code}
              building={b}
              choice={choiceOf(b)}
              disabled={saving}
              onChoose={(choice) => setChoices((all) => ({ ...all, [b.code]: choice }))}
            />
          ))}
          {chosen.length > 0 ? (
            <div className={picker.actions}>
              {replacing ? (
                <ConfirmButton label={saveLabel} confirmLabel="כן, למחוק ולשמור" busy={saving} onConfirm={() => void save()} />
              ) : (
                <Button busy={saving} onClick={() => void save()}>
                  {saveLabel}
                </Button>
              )}
              <Button variant="ghost" disabled={saving} onClick={() => setPreview(null)}>
                ביטול
              </Button>
            </div>
          ) : (
            <p className={picker.hint}>אין מה לשמור.</p>
          )}
        </div>
      )}
    </section>
  )
}

function ImportedBuildingCard({
  building,
  choice,
  disabled,
  onChoose,
}: {
  building: ImportedBuilding
  choice: Choice
  disabled: boolean
  onChoose: (choice: Choice) => void
}) {
  const id = useId()
  const { existing } = building
  const title = building.name ? `${building.code} · ${building.name}` : building.code
  const places = (
    <ul className={styles.rules}>
      {building.places.map((place) => (
        <li key={place.line}>
          {`${place.name} · ${KIND_LABELS[place.kind]} · ${floorLabel(place.floor)}`}
          {hoursText(place) && ` · ${hoursText(place)}`}
          {existing && choice === 'add' && place.when_added === 'place_name_taken' && ' · כבר קיים, מדלגים'}
          {existing && choice === 'add' && place.when_added === 'floor_not_in_building' && ' · אין קומה כזו בבניין הקיים, מדלגים'}
        </li>
      ))}
    </ul>
  )
  if (!existing) {
    return (
      <div className={styles.subform}>
        <strong>
          {`${title} · בניין חדש, ${building.floors_count === 1 ? 'קומה אחת' : `${building.floors_count} קומות`}`}
          {building.status !== 'active' && ` · ${STATUS_LABELS[building.status]}`}
        </strong>
        {building.places.length > 0 ? places : <p className={picker.hint}>בלי מקומות בטבלה.</p>}
      </div>
    )
  }
  return (
    <fieldset className={styles.subform} aria-labelledby={`${id}-legend`}>
      <legend id={`${id}-legend`}>
        <strong>{`הבניין ${building.code} כבר קיים`}</strong>
      </legend>
      <p className={picker.hint}>
        {`יש בו ${placesWord(existing.places)}. מה לעשות איתו?`}
      </p>
      {(
        [
          ['add', 'להוסיף את המקומות החדשים'],
          ['skip', 'להשאיר כמו שהוא'],
          ...(existing.locked ? [] : ([['replace', 'למחוק ולהוסיף מחדש מהטבלה']] as const)),
        ] as const
      ).map(([value, label]) => (
        <label key={value} className={styles.label}>
          <input type="radio" name={`${id}-choice`} value={value} checked={choice === value} disabled={disabled} onChange={() => onChoose(value)} />{' '}
          {label}
        </label>
      ))}
      {existing.locked && (
        <p className={picker.hint}>זה בניין של קמפוס ההדגמה: אפשר להוסיף לו מקומות, אבל לא למחוק אותו.</p>
      )}
      {choice === 'replace' && (
        <Notice tone="error">
          {existing.places === 0
            ? 'אין בו מקומות. '
            : existing.places === 1
              ? 'יימחק מקום אחד, עם השלט שלו. '
              : `יימחקו ${existing.places} מקומות, עם השלטים שלהם. `}
          {existing.upcoming_bookings > 0 &&
            `${many(existing.upcoming_bookings, 'הזמנה עתידית אחת תבוטל', 'הזמנות עתידיות יבוטלו')}. `}
          {existing.classes > 0 &&
            `${many(existing.classes, 'שיעור אחד', 'שיעורים')} של סטודנטים יישמרו, ויחזרו לבניין החדש באותו שם קצר. `}
          אי אפשר לבטל את המחיקה.
        </Notice>
      )}
      {choice !== 'skip' && places}
    </fieldset>
  )
}
