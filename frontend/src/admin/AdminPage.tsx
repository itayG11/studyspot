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
      <h1>ניהול</h1>
      <div className={styles.tabs} role="tablist" aria-label="ניהול">
        <button type="button" role="tab" className={styles.tab} aria-selected={tab === 'signs'} onClick={() => setTab('signs')}>
          שלטים להדפסה
        </button>
        <button type="button" role="tab" className={styles.tab} aria-selected={tab === 'placing'} onClick={() => setTab('placing')}>
          מיקום בניינים
        </button>
      </div>
      <section role="tabpanel">{tab === 'signs' ? <Signs /> : <Placer />}</section>
    </div>
  )
}
