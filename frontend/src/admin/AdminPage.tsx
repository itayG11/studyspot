// The institution admin's page: setting the institution up, printable
// signs, placing buildings, and adding new buildings and places.
// The server checks the admin role on every request; this page only hides
// what a student could not use anyway.

import { useState } from 'react'
import { Adder } from './Adder'
import styles from './admin.module.css'
import { Placer } from './Placer'
import { Setup, useSetup } from './Setup'
import { Signs } from './Signs'

type Tab = 'setup' | 'signs' | 'placing' | 'adding'

const TAB_LABELS: Record<Tab, string> = { setup: 'הקמה', signs: 'שלטים להדפסה', placing: 'מיקום בניינים', adding: 'הוספה' }

export function AdminPage() {
  const setup = useSetup()
  const [chosen, setTab] = useState<Tab | null>(null)
  // The first tab, picked once when the setup loads: setting up while the
  // institution is not open yet, the signs once it is. Picked once, so
  // opening the institution does not move the admin to another tab.
  if (chosen === null && setup.data) setTab(setup.data.is_active ? 'signs' : 'setup')
  const tab: Tab = chosen ?? 'setup'
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
          <button key={t} type="button" className={styles.tab} aria-pressed={tab === t} onClick={() => {
              setTab(t)
              setToPlace(null) // a building chosen once is not chosen again later
            }}>
            {TAB_LABELS[t]}
          </button>
        ))}
      </div>
      <section aria-label={TAB_LABELS[tab]}>
        {tab === 'setup' && <Setup setup={setup} onGo={(t) => setTab(t)} />}
        {tab === 'signs' && <Signs />}
        {tab === 'placing' && <Placer key={toPlace ?? ''} initial={toPlace} onSaved={setup.reload} />}
        {tab === 'adding' && (
          <Adder
            onAdded={setup.reload}
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
