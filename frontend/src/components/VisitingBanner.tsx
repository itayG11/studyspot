// On the pages of an institution that is not the visitor's own: what they
// can do here. An account belongs to one institution, and the server
// refuses a booking, a check-in or the waiting list at any other
// (other_institution, app/bookings.py and app/checkins.py), so this only
// says what the server already enforces. Signed out: no banner, a guest
// belongs nowhere yet.

import { Link } from 'react-router'
import { getInstitution } from '../api/campus'
import { useAuth } from '../auth/AuthContext'
import { useApi } from '../hooks/useApi'
import { useInstitution } from '../institution'
import styles from './Layout.module.css'

export function VisitingBanner() {
  const { user } = useAuth()
  const here = useInstitution()
  const home = user?.institution_slug ?? null
  const visiting = home !== null && home !== here.slug
  // The name of their own institution, for the words; cached per slug.
  const own = useApi(() => getInstitution(home ?? ''), visiting ? `institution-${home}` : null)
  if (!visiting || !user) return null
  const ownName = own.data?.name ?? 'מוסד אחר'
  return (
    <div className={styles.visitingBanner} role="note" aria-label="קמפוס של מוסד אחר">
      <strong>אתה צופה בקמפוס של {here.name}.</strong> החשבון שלך שייך ל{ownName}, ולכן כאן אפשר רק לצפות: לא להזמין, ולא
      להיכנס למקום.{user.role === 'system_admin' ? ' כמנהל המערכת, אפשר גם לנהל כאן.' : ''}{' '}
      <Link to={`/${home}`}>חזרה ל{ownName}</Link>
    </div>
  )
}
