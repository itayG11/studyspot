// The institutions on StudySpot: the public list (only the active ones),
// a card each, with how big its campus is.
//
// Signed in, the visitor's own institution says so, and opening another
// one asks first: an account belongs to one institution, so there it can
// only look (the server refuses a booking or a check-in at any other).

import { Building2 } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'
import { getInstitutions } from '../api/campus'
import type { InstitutionCard } from '../api/types'
import { useAuth } from '../auth/AuthContext'
import { useApi } from '../hooks/useApi'
import { Button, ButtonLink, ErrorState, PageLoading, Sheet } from '../ui'
import admin from '../admin/admin.module.css'
import styles from './pages.module.css'

const count = (n: number, one: string, many: string) => (n === 1 ? one : `${n} ${many}`)

export function InstitutionsPage() {
  const list = useApi(getInstitutions, 'institutions')
  const { user } = useAuth()
  const [asking, setAsking] = useState<InstitutionCard | null>(null)
  if (!list.data && list.error) return <ErrorState error={list.error} onRetry={list.reload} />
  if (!list.data) return <PageLoading />
  const own = user?.institution_slug ?? null
  const ownName = list.data.find((i) => i.slug === own)?.name ?? 'מוסד אחר'
  return (
    <div className={admin.page}>
      <h1 className={admin.title}>מוסדות</h1>
      <p className={admin.lead}>כל מוסד באתר, עם הקמפוס שלו. בוחרים מוסד, ומחפשים בו מקום ללמוד.</p>
      {own && (
        <p className={admin.lead}>
          החשבון שלך שייך למוסד אחד. במוסד אחר אפשר לצפות במקומות ובעומס, אבל לא להזמין ולא להיכנס למקום.
        </p>
      )}
      <ul className={styles.institutions}>
        {list.data.map((institution) => (
          <li key={institution.slug} className={styles.institution}>
            <span className={styles.institutionIcon} aria-hidden="true">
              <Building2 />
            </span>
            {/* The name is the link, and it covers the whole card. */}
            <Link
              to={`/${institution.slug}`}
              className={styles.institutionName}
              onClick={(event) => {
                if (!own || institution.slug === own) return
                if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
                event.preventDefault()
                setAsking(institution)
              }}
            >
              {institution.name}
            </Link>
            <span className={styles.institutionFacts}>
              {count(institution.buildings_count, 'בניין אחד', 'בניינים')} ·{' '}
              {count(institution.places_count, 'מקום לימוד אחד', 'מקומות לימוד')}
            </span>
            {institution.slug === own && <span className={styles.institutionOwn}>המוסד שלך</span>}
            {institution.is_demo && <span className={styles.institutionDemo}>קמפוס לדוגמה</span>}
          </li>
        ))}
      </ul>
      <Sheet open={asking !== null} onClose={() => setAsking(null)} title={asking ? `לעבור לקמפוס של ${asking.name}?` : ''}>
        {asking && (
          <div className={styles.visitAsk}>
            <p>
              החשבון שלך שייך ל{ownName}. בקמפוס של {asking.name} אפשר לצפות במקומות ובעומס, אבל לא להזמין ולא להיכנס למקום.
            </p>
            <p>הכתובת תשתנה ל-<bdi dir="ltr">/{asking.slug}</bdi>. החשבון שלך לא משתנה, ואפשר לחזור בכל רגע.</p>
            <div className={styles.visitActions}>
              <ButtonLink to={`/${asking.slug}`}>לעבור ולצפות</ButtonLink>
              <Button variant="secondary" onClick={() => setAsking(null)}>
                להישאר
              </Button>
            </div>
          </div>
        )}
      </Sheet>
    </div>
  )
}
