// On every page of an institution that is closing: when it all goes, and a
// way to delete one's account now. For whoever no notice reached.

import { Link } from 'react-router'
import { useInstitution } from '../institution'
import { formatDay } from '../logic/time'
import styles from './Layout.module.css'

export function ClosingBanner({ closesAt }: { closesAt: string }) {
  const { slug, name, timezone } = useInstitution()
  return (
    <div className={styles.closingBanner} role="note" aria-label="המוסד נסגר">
      <strong>{name} נסגר ב-StudySpot.</strong> ב-{formatDay(closesAt, timezone)} יימחקו החשבונות וכל הנתונים שבו.{' '}
      <Link to={`/${slug}/me`}>אפשר למחוק את החשבון כבר עכשיו</Link>
    </div>
  )
}
