// The institution admin's page: setting the institution up, printable
// signs, placing buildings, and adding new buildings and places.
// The server checks the admin role on every request; this page only hides
// what a student could not use anyway.

import { useState } from 'react'
import { useSearchParams } from 'react-router'
import { Adder } from './Adder'
import styles from './admin.module.css'
import { Placer } from './Placer'
import { Setup, useSetup } from './Setup'
import { Signs } from './Signs'

type Tab = 'setup' | 'signs' | 'placing' | 'adding'

const TAB_LABELS: Record<Tab, string> = { setup: 'הקמה', signs: 'שלטים להדפסה', placing: 'מיקום בניינים', adding: 'הוספה' }

const isTab = (value: string | null): value is Tab => value !== null && value in TAB_LABELS

export function AdminPage() {
  const setup = useSetup()
  // The tab is in the address (?tab=signs), so a link elsewhere ("in the
  // signs tab") can open it, and back and refresh keep it.
  const [params, setParams] = useSearchParams()
  const fromUrl = params.get('tab')
  const setTab = (t: Tab) => setParams({ tab: t }, { replace: true })
  // With no tab in the address, the first one is picked once, when the setup
  // loads: setting up while the institution is not open yet, the signs once
  // it is. Picked once, so opening the institution does not move the admin.
  const [first, setFirst] = useState<Tab | null>(null)
  if (first === null && setup.data) setFirst(setup.data.is_active ? 'signs' : 'setup')
  const tab: Tab = isTab(fromUrl) ? fromUrl : (first ?? 'setup')

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
