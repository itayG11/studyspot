import { Link, NavLink, Outlet } from 'react-router'
import type { UserRole } from '../api/types'
import { useAuth } from '../auth/AuthContext'
import { useInstitution } from '../institution'
import styles from './Layout.module.css'

const ROLE_LABELS: Record<UserRole, string> = {
  student: 'סטודנט',
  institution_admin: 'מנהל מוסד',
  system_admin: 'מנהל מערכת',
}

export function Layout() {
  const { status, user, logout } = useAuth()
  const institution = useInstitution()

  return (
    <div className={styles.app}>
      <header className={styles.header}>
        <Link to="/" className={styles.brand} viewTransition>
          <span className={styles.brandName} lang="en">StudySpot</span>
          <span className={styles.brandInstitution}>{institution.name}</span>
        </Link>
        <nav className={styles.nav} aria-label="ניווט ראשי">
          <NavLink to="/" end className={styles.navLink} viewTransition>מפה</NavLink>
          <NavLink to="/places" className={styles.navLink} viewTransition>מקומות</NavLink>
        </nav>
        <div className={styles.account}>
          {status === 'signed-in' && user && (
            <>
              <span className={styles.accountName}>
                {user.display_name}
                {user.role !== 'student' && <span className="tag">{ROLE_LABELS[user.role]}</span>}
              </span>
              <button type="button" className="link-button" onClick={() => void logout()}>
                התנתקות
              </button>
            </>
          )}
          {status === 'signed-out' && (
            <Link to="/login" className={styles.navLink} viewTransition>
              התחברות
            </Link>
          )}
        </div>
      </header>
      <main className={styles.main}>
        <Outlet />
      </main>
    </div>
  )
}
