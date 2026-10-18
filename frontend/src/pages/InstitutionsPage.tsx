// The institutions on StudySpot: the public list (only the active ones),
// a card each, with how big its campus is.

import { Building2 } from 'lucide-react'
import { Link } from 'react-router'
import { getInstitutions } from '../api/campus'
import { useApi } from '../hooks/useApi'
import { ErrorState, PageLoading } from '../ui'
import admin from '../admin/admin.module.css'
import styles from './pages.module.css'

const count = (n: number, one: string, many: string) => (n === 1 ? one : `${n} ${many}`)

export function InstitutionsPage() {
  const list = useApi(getInstitutions, 'institutions')
  if (!list.data && list.error) return <ErrorState error={list.error} onRetry={list.reload} />
  if (!list.data) return <PageLoading />
  return (
    <div className={admin.page}>
      <h1 className={admin.title}>מוסדות</h1>
      <p className={admin.lead}>כל מוסד באתר, עם הקמפוס שלו. בוחרים מוסד, ומחפשים בו מקום ללמוד.</p>
      <ul className={styles.institutions}>
        {list.data.map((institution) => (
          <li key={institution.slug} className={styles.institution}>
            <span className={styles.institutionIcon} aria-hidden="true">
              <Building2 />
            </span>
            {/* The name is the link, and it covers the whole card. */}
            <Link to={`/${institution.slug}`} className={styles.institutionName}>
              {institution.name}
            </Link>
            <span className={styles.institutionFacts}>
              {count(institution.buildings_count, 'בניין אחד', 'בניינים')} ·{' '}
              {count(institution.places_count, 'מקום לימוד אחד', 'מקומות לימוד')}
            </span>
            {institution.is_demo && <span className={styles.institutionDemo}>קמפוס לדוגמה</span>}
          </li>
        ))}
      </ul>
    </div>
  )
}
