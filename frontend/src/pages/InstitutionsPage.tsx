// The institutions on StudySpot: the public list (only the active ones).

import { Link } from 'react-router'
import { getInstitutions } from '../api/campus'
import { useApi } from '../hooks/useApi'
import { ErrorState, PageLoading } from '../ui'
import admin from '../admin/admin.module.css'
import styles from '../system/system.module.css'

export function InstitutionsPage() {
  const list = useApi(getInstitutions, 'institutions')
  if (!list.data && list.error) return <ErrorState error={list.error} onRetry={list.reload} />
  if (!list.data) return <PageLoading />
  return (
    <div className={admin.page}>
      <h1 className={admin.title}>מוסדות</h1>
      <p className={admin.lead}>כל מוסד באתר, עם הקמפוס שלו. בוחרים מוסד, ומחפשים בו מקום ללמוד.</p>
      <ul className={styles.list}>
        {list.data.map((institution) => (
          <li key={institution.slug} className={styles.row}>
            <Link to={`/${institution.slug}`} className={styles.name}>
              {institution.name}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}
