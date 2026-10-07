// Placing buildings on the map: choose a building, click its roof.

import { useState } from 'react'
import { placeBuilding } from '../api/admin'
import { getBuildings } from '../api/campus'
import { useAction } from '../hooks/useAction'
import { useApi } from '../hooks/useApi'
import { AERIAL_ENABLED } from '../map/tiles'
import { ErrorState, Notice, PageLoading } from '../ui'
import styles from './admin.module.css'
import { PickMap } from './PickMap'

export function Placer() {
  const buildings = useApi(getBuildings, 'admin-buildings')
  const [selected, setSelected] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)
  const action = useAction()

  if (buildings.error) return <ErrorState error={buildings.error} onRetry={buildings.reload} />
  if (!buildings.data) return <PageLoading />
  const chosen = buildings.data.find((b) => b.code === selected) ?? null

  async function pick(latitude: number, longitude: number) {
    if (!chosen || action.busy) return // one save at a time
    const saved = await action.run(() => placeBuilding(chosen.id, latitude, longitude))
    if (saved) {
      setDone(`בניין ${saved.code} מוקם על המפה (${saved.latitude}, ${saved.longitude}).`)
      buildings.reload()
    }
  }

  return (
    <div className={styles.placer}>
      <div className={styles.side}>
        <p className={styles.lead}>בחר בניין, ואז לחץ על הגג שלו {AERIAL_ENABLED ? 'בתצלום האוויר' : 'במפה'}.</p>
        <ul className={styles.choices}>
          {buildings.data.map((b) => (
            <li key={b.code}>
              <button
                type="button"
                className={styles.choice}
                aria-pressed={b.code === selected}
                onClick={() => {
                  setSelected(b.code)
                  setDone(null)
                }}
              >
                <span className={styles.building}>{b.code}</span>
                <span>
                  בניין {b.code}
                  <br />
                  <span className={styles.coords}>{b.latitude ? `${b.latitude}, ${b.longitude}` : 'עוד לא על המפה'}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
        <div role="status">{done && <Notice tone="success">{done}</Notice>}</div>
        {action.error && <Notice tone="error">{action.error}</Notice>}
      </div>
      <PickMap buildings={buildings.data} selected={selected} onPick={(lat, lng) => void pick(lat, lng)} />
    </div>
  )
}
