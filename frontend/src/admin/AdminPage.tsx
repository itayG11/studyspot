// The institution admin's page: printable signs, and placing buildings.
// The server checks the admin role on every request; this page only hides
// what a student could not use anyway.

import { useState } from 'react'
import styles from './admin.module.css'
import { Placer } from './Placer'
import { Signs } from './Signs'

type Tab = 'signs' | 'placing'

export function AdminPage() {
  const [tab, setTab] = useState<Tab>('signs')
  return (
    <div className={styles.page}>
      <h1 className={styles.title}>ניהול</h1>
      {/* Two plain toggle buttons: simpler than full ARIA tabs, and honest
          about what they are. */}
      <div className={styles.tabs} role="group" aria-label="ניהול">
        <button type="button" className={styles.tab} aria-pressed={tab === 'signs'} onClick={() => setTab('signs')}>
          שלטים להדפסה
        </button>
        <button type="button" className={styles.tab} aria-pressed={tab === 'placing'} onClick={() => setTab('placing')}>
          מיקום בניינים
        </button>
      </div>
      <section aria-label={tab === 'signs' ? 'שלטים להדפסה' : 'מיקום בניינים'}>
        {tab === 'signs' ? <Signs /> : <Placer />}
      </section>
    </div>
  )
}
