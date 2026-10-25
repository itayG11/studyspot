// Importing the timetable from the college's Excel export ("Yedion"). The
// server reads the file and only says what it holds; nothing is saved until
// the student checks the list, picks a building where none was found, and
// adds. A place the campus does not list ("אולם ספורט") is kept in the
// file's words, and its admin is told how many students name it. Each class
// goes through the usual checks: a refused one stays on the list with why.

import { Upload } from 'lucide-react'
import { useId, useState, type ChangeEvent } from 'react'
import { ApiError } from '../api/client'
import { getBuildings } from '../api/campus'
import { addClasses, importOptions, previewImport, previewPhoto } from '../api/student'
import type { ImportRow } from '../api/types'
import { useAuth } from '../auth/AuthContext'
import { useApi } from '../hooks/useApi'
import { errorMessage } from '../i18n/errors'
import { useInstitution } from '../institution'
import { weekdayName } from '../logic/time'
import { Button, Notice } from '../ui'
import admin from '../admin/admin.module.css'
import styles from './import.module.css'

interface Item {
  row: ImportRow
  chosen: boolean
  building: string // a building's code, NOT_LISTED for the file's words, '' until picked
  refused: string | null // why the server said no, in Hebrew
}

// The place as the file names it, though the campus does not list it.
const NOT_LISTED = '-'

// The file's words can be kept as the place: not empty, and short enough.
const canKeep = (row: ImportRow) => row.building_text !== '' && row.building_text.length <= 40

// A phone photo is often 3–6 MB: made smaller here, to a long edge of
// 2000 px as JPEG, which is more than the reading needs. Where the browser
// cannot (or the photo is small already), it goes as it is.
const LONG_EDGE = 2000
async function smaller(file: File): Promise<Blob> {
  if (typeof createImageBitmap !== 'function' || typeof OffscreenCanvas !== 'function') return file
  try {
    const image = await createImageBitmap(file)
    const scale = Math.min(1, LONG_EDGE / Math.max(image.width, image.height))
    if (scale === 1 && file.size < 1_500_000) return file
    const canvas = new OffscreenCanvas(Math.round(image.width * scale), Math.round(image.height * scale))
    canvas.getContext('2d')?.drawImage(image, 0, 0, canvas.width, canvas.height)
    return await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.85 })
  } catch {
    return file // not an image the browser reads: the server says so
  }
}

const XLSX = '.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
const IMAGES = 'image/png,image/jpeg,image/webp'
const PICTURE = /\.(png|jpe?g|webp|heic|heif)$/i
const HEIC = /heic|heif/i

const count = (n: number) => (n === 1 ? 'שיעור אחד' : `${n} שיעורים`)

export function ImportClasses({ onAdded }: { onAdded: () => void }) {
  const id = useId()
  const { user } = useAuth()
  const { slug } = useInstitution()
  const buildings = useApi(() => getBuildings(slug), `buildings-${slug}`)
  const choices = (buildings.data ?? []).filter((b) => b.status !== 'under_construction')
  const options = useApi(importOptions, 'import-options')
  const [items, setItems] = useState<Item[] | null>(null)
  const [fromPhoto, setFromPhoto] = useState(false) // the list was read by a model: check it
  const [reading, setReading] = useState(false)
  const [adding, setAdding] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)

  async function pick(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    // A picture goes to be read by the model; anything else is the Excel file
    // (the server checks the bytes either way). By type, or by name: some
    // phones give no type at all.
    const photo = file !== undefined && (file.type.startsWith('image/') || PICTURE.test(file.name))
    if (file && photo && (HEIC.test(file.type) || HEIC.test(file.name))) {
      // An iPhone photo format the browser cannot redraw and the server does
      // not read: said here, without spending one of the day's tries.
      event.target.value = ''
      setProblem('תמונות בפורמט HEIC לא נתמכות. שלח צילום מסך של המערכת, או תמונה בפורמט JPEG או PNG.')
      return
    }
    event.target.value = '' // the same file can be picked again
    if (!file) return
    setProblem(null)
    setDone(null)
    setReading(true)
    try {
      const rows = await (photo ? previewPhoto(await smaller(file)) : previewImport(file))
      setFromPhoto(photo)
      setItems(
        rows.map((row) => ({ row, chosen: true, building: row.building_code ?? (canKeep(row) ? NOT_LISTED : ''), refused: null })),
      )
    } catch (reason) {
      setProblem(errorMessage(reason instanceof ApiError ? reason.code : 'unknown_error'))
      setItems(null)
    } finally {
      setReading(false)
    }
  }

  const update = (index: number, change: Partial<Item>) =>
    setItems((all) => all && all.map((item, i) => (i === index ? { ...item, ...change } : item)))

  const chosen = (items ?? []).filter((item) => item.chosen)
  const ready = chosen.length > 0 && chosen.every((item) => item.building)

  async function add() {
    if (!items) return
    setAdding(true)
    setDone(null)
    setProblem(null)
    const picked = items.filter((item) => item.chosen)
    // One request: the server checks each in order, against the ones before it.
    let answers: { refused: string | null }[]
    try {
      answers = await addClasses(
        picked.map(({ row, building }) => ({
          weekday: row.weekday,
          starts: row.starts,
          ends: row.ends,
          ...(building === NOT_LISTED ? { place_text: row.building_text } : { building_code: building }),
          title: row.title,
        })),
      )
    } catch (reason) {
      setAdding(false)
      setProblem(errorMessage(reason instanceof ApiError ? reason.code : 'unknown_error'))
      return
    }
    const left = items.filter((item) => !item.chosen)
    let added = 0
    picked.forEach((item, index) => {
      const refused = answers[index]?.refused ?? null
      if (refused === null) added += 1
      else left.push({ ...item, refused: errorMessage(refused) })
    })
    setAdding(false)
    setItems(left.length > 0 ? left : null)
    setDone(`נוסף ${added === 1 ? 'שיעור אחד' : `${added} שיעורים`} מתוך ${chosen.length}.`)
    if (added > 0) onAdded()
  }

  return (
    <div className={styles.import}>
      <p className={styles.lead}>{reading ? 'קורא את מערכת השעות…' : 'הוספת מערכת שעות:'}</p>
      <label className={styles.pick}>
        <Upload aria-hidden="true" />
        <span>העלאת קובץ</span>
        <input
          type="file"
          className="visually-hidden"
          accept={options.data?.photo ? `${XLSX},${IMAGES}` : XLSX}
          disabled={reading || adding}
          onChange={(event) => void pick(event)}
        />
      </label>
      <p className={styles.hint}>
        {options.data?.photo
          ? 'אפשר להעלות: קובץ אקסל של מערכת השעות, כפי שאתר המכללה מייצא אותו, או צילום מסך או תמונה של המערכת, בפורמט PNG, JPG או WebP. צילום נשלח לקריאה לשירות של Anthropic. קובץ אקסל אחר, שלא יצא מאתר המכללה, לא ייקרא.'
          : 'אפשר להעלות: קובץ אקסל של מערכת השעות, כפי שאתר המכללה מייצא אותו. קובץ אקסל אחר לא ייקרא.'}{' '}
        הקובץ לא נשמר, רק השיעורים שתבחר.
      </p>
      {user?.is_demo && (
        <p className={styles.hint}>
          הסטודנט לדוגמה משותף לכל המבקרים: השעות שתוסיף ייראו גם להם עד האיפוס היומי, ושמות הקורסים לא יישמרו. למערכת משלך,
          מתחברים עם החשבון שלך.
        </p>
      )}
      {problem && <Notice tone="error">{problem}</Notice>}
      {done && <Notice tone="success">{done}</Notice>}
      {items && (
        <section className={styles.preview} aria-labelledby={`${id}-title`}>
          <h3 id={`${id}-title`} className={admin.formTitle}>
            {fromPhoto ? 'מה נמצא בצילום' : 'מה נמצא בקובץ'}
          </h3>
          {fromPhoto && <p className={styles.hint}>נקרא בעזרת בינה מלאכותית, ויכולות להיות בו טעויות: בדוק כל שורה לפני שמוסיפים.</p>}
          <ul className={styles.rows}>
            {items.map((item, index) => {
              const { row } = item
              const name = row.title ?? 'שיעור'
              return (
                <li key={index} className={styles.row}>
                  <label className={styles.check}>
                    <input type="checkbox" checked={item.chosen} disabled={adding} onChange={(e) => update(index, { chosen: e.target.checked })} />
                    <span>
                      <strong>{name}</strong>
                      <span className={styles.when}>
                        {weekdayName(row.weekday)} ·{' '}
                        <span dir="ltr" className={styles.times}>
                          {row.starts}–{row.ends}
                        </span>
                      </span>
                    </span>
                  </label>
                  <span className={styles.building}>
                    <select
                      className={admin.field}
                      aria-label={`מקום לשיעור ${name}`}
                      value={item.building}
                      disabled={adding}
                      onChange={(e) => update(index, { building: e.target.value })}
                    >
                      {!item.building && <option value="">בחר בניין</option>}
                      {canKeep(row) && !row.building_code && <option value={NOT_LISTED}>{`${row.building_text}, לא ברשימה`}</option>}
                      {choices.map((b) => (
                        <option key={b.code} value={b.code}>
                          {b.code}
                        </option>
                      ))}
                    </select>
                    {item.building === NOT_LISTED && <span className={styles.said}>עוד לא ברשימת הבניינים. מנהל המוסד יראה שסטודנטים מזכירים אותו.</span>}
                  </span>
                  {item.refused && <span className={styles.refused}>{item.refused}</span>}
                </li>
              )
            })}
          </ul>
          <div className={styles.actions}>
            <Button busy={adding} disabled={!ready} onClick={() => void add()}>
              {`להוסיף ${count(chosen.length)}`}
            </Button>
            <Button variant="ghost" disabled={adding} onClick={() => setItems(null)}>
              ביטול
            </Button>
          </div>
          {chosen.some((item) => !item.building) && <p className={styles.hint}>לשיעור שלא נמצא לו בניין, בוחרים בניין, או מורידים את הסימון.</p>}
        </section>
      )}
    </div>
  )
}
