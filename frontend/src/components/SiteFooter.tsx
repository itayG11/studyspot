// The line at the bottom of every page: what the site is, and the pages a
// site owes its visitors (terms, privacy, accessibility, licenses).

import { Link } from 'react-router'
import styles from './Layout.module.css'

export function SiteFooter() {
  return (
    <footer className={styles.footer}>
      <span>StudySpot · פרויקט לימודי</span>
      <nav aria-label="מידע על האתר" className={styles.footerLinks}>
        <Link to="/terms">תנאי שימוש</Link>
        <Link to="/privacy">פרטיות</Link>
        <Link to="/accessibility">הצהרת נגישות</Link>
        <Link to="/licenses">רישיונות</Link>
      </nav>
    </footer>
  )
}
