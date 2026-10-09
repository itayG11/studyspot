// Adding a building, and places in a building. There is no editing or
// deleting yet; on the demo campus, additions are removed once a day.

import { useId, useState, type FormEvent } from 'react'
import { addBuilding, addPlace } from '../api/admin'
import { getBuildings } from '../api/campus'
import type { PlaceKind } from '../api/types'
import { useAction } from '../hooks/useAction'
import { useApi } from '../hooks/useApi'
import { floorLabel, KIND_LABELS, KINDS } from '../i18n/labels'
import { Button, ErrorState, Notice, PageLoading } from '../ui'
import styles from './admin.module.css'

export function Adder({ onPlace }: { onPlace: (code: string) => void }) {
  const buildings = useApi(getBuildings, 'admin-buildings')
  if (buildings.error) return <ErrorState error={buildings.error} onRetry={buildings.reload} />
  if (!buildings.data) return <PageLoading />
  return (
    <div className={styles.adder}>
      <p className={styles.lead}>
        מוסיפים בניין, ואז מקומות בתוכו. מקום חדש פתוח בשעות הרגילות של הקמפוס, והשלט שלו מוכן בלשונית השלטים. עדיין
        אין עריכה או מחיקה.
      </p>
      <BuildingForm onAdded={buildings.reload} onPlace={onPlace} />
      <PlaceForm buildings={buildings.data} />
    </div>
  )
}

function BuildingForm({ onAdded, onPlace }: { onAdded: () => void; onPlace: (code: string) => void }) {
  const id = useId()
  const [code, setCode] = useState('')
  const [floors, setFloors] = useState('1')
  const [added, setAdded] = useState<string | null>(null)
  const action = useAction()

  async function submit(event: FormEvent) {
    event.preventDefault()
    setAdded(null)
    const saved = await action.run(() => addBuilding({ code: code.trim().toUpperCase(), floors_count: Number(floors) }))
    if (saved) {
      setAdded(saved.code)
      setCode('')
      onAdded()
    }
  }

  return (
    <form className={styles.form} onSubmit={submit} aria-labelledby={`${id}-title`}>
      <h2 id={`${id}-title`} className={styles.formTitle}>
        בניין חדש
      </h2>
      <label className={styles.label} htmlFor={`${id}-code`}>
        קוד הבניין
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
            בניין {added} נוסף. עכשיו אפשר למקם אותו על המפה.{' '}
            <Button variant="ghost" size="sm" onClick={() => onPlace(added)}>
              למיקום על המפה
            </Button>
          </Notice>
        )}
      </div>
      <div role="alert">{action.error && <Notice tone="error">{action.error}</Notice>}</div>
    </form>
  )
}

interface BuildingChoice {
  id: number
  code: string
  floors_count: number
}

function PlaceForm({ buildings }: { buildings: BuildingChoice[] }) {
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
