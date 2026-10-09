// The institution admin's page: printable signs, placing buildings, and
// adding new buildings and places.
// The server checks the admin role on every request; this page only hides
// what a student could not use anyway.

import { useState } from 'react'
import { Adder } from './Adder'
import styles from './admin.module.css'
import { Placer } from './Placer'
import { Signs } from './Signs'

type Tab = 'signs' | 'placing' | 'adding'

const TAB_LABELS: Record<Tab, string> = { signs: 'שלטים להדפסה', placing: 'מיקום בניינים', adding: 'הוספה' }

export function AdminPage() {
  const [tab, setTab] = useState<Tab>('signs')
  // A building just added, to choose for placing on the map.
  const [toPlace, setToPlace] = useState<string | null>(null)
  return (
    <div className={styles.page}>
      <header className={styles.head}>
        <p className={styles.eyebrow}>מנהל המוסד</p>
        <h1 className={styles.title}>ניהול</h1>
      </header>
      {/* Two plain toggle buttons: simpler than full ARIA tabs, and honest
          about what they are. */}
      <div className={styles.tabs} role="group" aria-label="ניהול">
        {(Object.keys(TAB_LABELS) as Tab[]).map((t) => (
          <button key={t} type="button" className={styles.tab} aria-pressed={tab === t} onClick={() => setTab(t)}>
            {TAB_LABELS[t]}
          </button>
        ))}
      </div>
      <section aria-label={TAB_LABELS[tab]}>
        {tab === 'signs' && <Signs />}
        {tab === 'placing' && <Placer initial={toPlace} />}
        {tab === 'adding' && (
          <Adder
            onPlace={(code) => {
              setToPlace(code)
              setTab('placing')
            }}
          />
        )}
      </section>
    </div>
  )
}
