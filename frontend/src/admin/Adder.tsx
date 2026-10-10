// Adding a building, and places in a building. There is no editing or
// deleting yet; on the demo campus, additions are removed once a day.

import { useId, useState, type FormEvent } from 'react'
import { LocateFixed } from 'lucide-react'
import { addBuilding, addPlace, geocode } from '../api/admin'
import { getBuildings } from '../api/campus'
import type { Building, GeocodeResult, PlaceKind } from '../api/types'
import { useAction } from '../hooks/useAction'
import { useApi } from '../hooks/useApi'
import { floorLabel, KIND_LABELS, KINDS } from '../i18n/labels'
import { Button, ErrorState, Notice, PageLoading } from '../ui'
import styles from './admin.module.css'
import { useInstitution } from '../institution'
import { PickMap } from './PickMap'

export function Adder({ onPlace, onAdded }: { onPlace: (code: string) => void; onAdded?: () => void }) {
  const { slug } = useInstitution()
  const buildings = useApi(() => getBuildings(slug), `admin-buildings-${slug}`)
  if (buildings.error) return <ErrorState error={buildings.error} onRetry={buildings.reload} />
  if (!buildings.data) return <PageLoading />
  return (
    <div className={styles.adder}>
      <p className={styles.lead}>
        מוסיפים בניין, ואז מקומות בתוכו. מקום חדש פתוח בשעות הרגילות של הקמפוס. לכל מקום נוצר שלט לבד, ומוכן להדפסה
        בלשונית השלטים. עדיין אין עריכה או מחיקה.
      </p>
      <BuildingForm
        buildings={buildings.data}
        onAdded={() => {
          buildings.reload()
          onAdded?.()
        }}
        onPlace={onPlace}
      />
      <PlaceForm buildings={buildings.data} onAdded={onAdded} />
    </div>
  )
}

function BuildingForm({
  buildings,
  onAdded,
  onPlace,
}: {
  buildings: Building[]
  onAdded: () => void
  onPlace: (code: string) => void
}) {
  const { slug } = useInstitution()
  const id = useId()
  const [name, setName] = useState('')
  const [code, setCode] = useState('')
  const [floors, setFloors] = useState('1')
  const [picked, setPicked] = useState<[number, number] | null>(null)
  const [flyTo, setFlyTo] = useState<[number, number] | null>(null)
  const [added, setAdded] = useState<{ name: string; code: string; located: boolean } | null>(null)
  const action = useAction()

  async function submit(event: FormEvent) {
    event.preventDefault()
    setAdded(null)
    const at = picked ? { latitude: Number(picked[0].toFixed(6)), longitude: Number(picked[1].toFixed(6)) } : {}
    const saved = await action.run(() =>
      addBuilding(slug, { name: name.trim(), code: code.trim().toUpperCase(), floors_count: Number(floors), ...at }),
    )
    if (saved) {
      setAdded({ name: name.trim(), code: saved.code, located: picked !== null })
      setName('')
      setCode('')
      setPicked(null)
      onAdded()
    }
  }

  return (
    <form className={styles.form} onSubmit={submit} aria-labelledby={`${id}-title`}>
      <h2 id={`${id}-title`} className={styles.formTitle}>
        בניין חדש
      </h2>
      <p className={styles.lead}>לחץ על המפה במקום של הבניין. אפשר גם בלי, ולמקם אותו אחר כך.</p>
      <MapTools onFly={setFlyTo} />
      <PickMap buildings={buildings} selected={null} onPick={(lat, lng) => setPicked([lat, lng])} flyTo={flyTo} picked={picked} />
      <p className={styles.lead} role="status">
        {picked ? 'נבחר מיקום על המפה.' : 'עוד לא נבחר מיקום.'}
      </p>
      <label className={styles.label} htmlFor={`${id}-name`}>
        שם הבניין
      </label>
      <input
        id={`${id}-name`}
        className={styles.field}
        required
        maxLength={200}
        value={name}
        onChange={(event) => setName(event.target.value)}
      />
      <label className={styles.label} htmlFor={`${id}-code`}>
        שם קצר, באותיות אנגליות או מספרים, למשל M. הוא מופיע בשמות של המקומות
      </label>
      <input
        id={`${id}-code`}
        className={styles.field}
        dir="ltr"
        required
        maxLength={16}
        value={code}
        onChange={(event) => setCode(event.target.value)}
      />
      <label className={styles.label} htmlFor={`${id}-floors`}>
        מספר קומות
      </label>
      <input
        id={`${id}-floors`}
        className={styles.field}
        type="number"
        inputMode="numeric"
        required
        min={1}
        max={50}
        value={floors}
        onChange={(event) => setFloors(event.target.value)}
      />
      <Button type="submit" busy={action.busy}>
        הוספת בניין
      </Button>
      <div role="status">
        {added && (
          <Notice tone="success">
            {added.name} נוסף. עכשיו מוסיפים לו מקומות, למטה.{' '}
            {!added.located && (
              <Button variant="ghost" size="sm" onClick={() => onPlace(added.code)}>
                למיקום על המפה
              </Button>
            )}
          </Notice>
        )}
      </div>
      {action.error && <Notice tone="error">{action.error}</Notice>}
    </form>
  )
}

// Finding the campus on the map: the admin's own location, or a search.
// The search runs only on a press of the button: OpenStreetMap's place search
// does not allow searching as one types (app/geocode.py on the server).
function MapTools({ onFly }: { onFly: (at: [number, number]) => void }) {
  const id = useId()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<GeocodeResult[] | null>(null)
  const [locating, setLocating] = useState<string | null>(null)
  const search = useAction()

  async function find(event: FormEvent) {
    event.preventDefault()
    const found = await search.run(() => geocode(query.trim()))
    if (found) setResults(found)
  }

  function myLocation() {
    if (!('geolocation' in navigator)) {
      setLocating('הדפדפן הזה לא מאפשר לאתר לדעת איפה אתה.')
      return
    }
    setLocating(null)
    navigator.geolocation.getCurrentPosition(
      (where) => onFly([where.coords.latitude, where.coords.longitude]),
      () => setLocating('לא קיבלנו את המיקום. אפשר לאשר אותו בדפדפן, או לחפש מקום.'),
      { enableHighAccuracy: true, timeout: 10_000 },
    )
  }

  return (
    <div className={styles.mapTools}>
      <Button type="button" variant="secondary" size="sm" icon={<LocateFixed aria-hidden="true" />} onClick={myLocation}>
        המיקום שלי
      </Button>
      {/* A form of its own would nest inside the building form: a div with a
          button that submits only this search. */}
      <div className={styles.search} role="search">
        <label className={styles.label} htmlFor={`${id}-q`}>
          חיפוש מקום על המפה
        </label>
        <input
          id={`${id}-q`}
          className={styles.field}
          value={query}
          maxLength={120}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') void find(event)
          }}
        />
        <Button type="button" size="sm" busy={search.busy} disabled={query.trim().length < 2} onClick={(event) => void find(event)}>
          חיפוש
        </Button>
      </div>
      {results && (
        <ul className={styles.results} aria-label="תוצאות החיפוש">
          {results.length === 0 && <li>לא נמצא מקום בשם הזה.</li>}
          {results.map((result) => (
            <li key={`${result.latitude},${result.longitude}`}>
              <Button type="button" variant="ghost" size="sm" onClick={() => onFly([result.latitude, result.longitude])}>
                {result.name}
              </Button>
            </li>
          ))}
        </ul>
      )}
      <p className={styles.attribution}>החיפוש: © OpenStreetMap</p>
      {locating && <Notice>{locating}</Notice>}
      {search.error && <Notice tone="error">{search.error}</Notice>}
    </div>
  )
}

interface BuildingChoice {
  id: number
  code: string
  floors_count: number
}

function PlaceForm({ buildings, onAdded }: { buildings: BuildingChoice[]; onAdded?: () => void }) {
  const id = useId()
  const [buildingId, setBuildingId] = useState(buildings[0]?.id ?? 0)
  const [kind, setKind] = useState<PlaceKind>('group_room')
  const [name, setName] = useState('')
  const [floor, setFloor] = useState(0)
  const [capacity, setCapacity] = useState('')
  const [rows, setRows] = useState('')
  const [cols, setCols] = useState('')
  const [added, setAdded] = useState<string | null>(null)
  const action = useAction()
  const building = buildings.find((b) => b.id === buildingId) ?? buildings[0]
  const lab = kind === 'computer_lab'

  if (!building) return <Notice>קודם מוסיפים בניין.</Notice>

  async function submit(event: FormEvent) {
    event.preventDefault()
    setAdded(null)
    const size = lab ? { lab_rows: Number(rows), lab_cols: Number(cols) } : { capacity: Number(capacity) }
    const saved = await action.run(() => addPlace(building.id, { kind, name: name.trim(), floor, ...size }))
    if (saved) {
      setAdded(`${saved.name} נוסף לבניין ${building.code}. השלט שלו מוכן בלשונית השלטים.`)
      onAdded?.()
      setName('')
    }
  }

  return (
    <form className={styles.form} onSubmit={submit} aria-labelledby={`${id}-title`}>
      <h2 id={`${id}-title`} className={styles.formTitle}>
        מקום חדש
      </h2>
      <label className={styles.label} htmlFor={`${id}-building`}>
        בניין
      </label>
      <select
        id={`${id}-building`}
        className={styles.field}
        value={building.id}
        onChange={(event) => {
          setBuildingId(Number(event.target.value))
          setFloor(0)
        }}
      >
        {buildings.map((b) => (
          <option key={b.id} value={b.id}>
            בניין {b.code}
          </option>
        ))}
      </select>
      <label className={styles.label} htmlFor={`${id}-kind`}>
        סוג המקום
      </label>
      <select
        id={`${id}-kind`}
        className={styles.field}
        value={kind}
        onChange={(event) => setKind(event.target.value as PlaceKind)}
      >
        {KINDS.map((k) => (
          <option key={k} value={k}>
            {KIND_LABELS[k]}
          </option>
        ))}
      </select>
      <label className={styles.label} htmlFor={`${id}-name`}>
        שם המקום
      </label>
      <input
        id={`${id}-name`}
        className={styles.field}
        required
        maxLength={100}
        value={name}
        onChange={(event) => setName(event.target.value)}
      />
      <label className={styles.label} htmlFor={`${id}-floor`}>
        קומה
      </label>
      <select
        id={`${id}-floor`}
        className={styles.field}
        value={floor}
        onChange={(event) => setFloor(Number(event.target.value))}
      >
        {Array.from({ length: building.floors_count }, (_, f) => (
          <option key={f} value={f}>
            {floorLabel(f)}
          </option>
        ))}
      </select>
      {lab ? (
        <>
          <label className={styles.label} htmlFor={`${id}-rows`}>
            שורות של עמדות
          </label>
          <input
            id={`${id}-rows`}
            className={styles.field}
            type="number"
            inputMode="numeric"
            required
            min={1}
            max={20}
            value={rows}
            onChange={(event) => setRows(event.target.value)}
          />
          <label className={styles.label} htmlFor={`${id}-cols`}>
            עמדות בכל שורה
          </label>
          <input
            id={`${id}-cols`}
            className={styles.field}
            type="number"
            inputMode="numeric"
            required
            min={1}
            max={20}
            value={cols}
            onChange={(event) => setCols(event.target.value)}
          />
        </>
      ) : (
        <>
          <label className={styles.label} htmlFor={`${id}-capacity`}>
            כמה אנשים
          </label>
          <input
            id={`${id}-capacity`}
            className={styles.field}
            type="number"
            inputMode="numeric"
            required
            min={1}
            max={1000}
            value={capacity}
            onChange={(event) => setCapacity(event.target.value)}
          />
        </>
      )}
      <Button type="submit" busy={action.busy}>
        הוספת מקום
      </Button>
      <div role="status">{added && <Notice tone="success">{added}</Notice>}</div>
      <div role="alert">{action.error && <Notice tone="error">{action.error}</Notice>}</div>
    </form>
  )
}
