import { useLayoutEffect, useRef } from 'react'
import { Link, NavLink, Outlet, ScrollRestoration, useLocation, useNavigate } from 'react-router'
import { Pin } from '../illustrations/Pin'
import { ThemeSwitch } from './ThemeSwitch'
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
  const navigate = useNavigate()
  const header = useRef<HTMLElement>(null)
  const { pathname } = useLocation()
  const home = `/${institution.slug}` // this institution's own front page

  // The sticky header's height, as --header-h, so full-screen sections can
  // start below it. It changes when the header wraps on a narrow screen.
  // A layout effect, so the first paint already has it: set later, the
  // full-screen story would jump by the header's height (a layout shift).
  useLayoutEffect(() => {
    const element = header.current
    if (!element) return
    document.documentElement.style.setProperty('--header-h', `${element.offsetHeight}px`)
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(() => {
      document.documentElement.style.setProperty('--header-h', `${element.offsetHeight}px`)
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  return (
    <div className={styles.app}>
      <header ref={header} className={styles.header}>
        <Link to={home} className={styles.brand} viewTransition>
          <Pin size={18} />
          <span className={styles.brandName} lang="en">StudySpot</span>
          <span className={styles.brandInstitution}>{institution.name}</span>
        </Link>
        <nav className={styles.nav} aria-label="ניווט ראשי">
          {/* To the search itself, not the top of the story: a fresh value each
              click, so a second click on the home page scrolls down again. */}
          <NavLink
            to={home}
            end
            className={styles.navLink}
            onClick={(event) => {
              // Ctrl, Cmd or Shift: the browser's own new tab or window.
              if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
              event.preventDefault()
              navigate(home, { state: { toFinder: Date.now() }, viewTransition: true })
            }}
          >
            חיפוש מקום
          </NavLink>
          {status === 'signed-in' && (
            <NavLink to="/me" className={styles.navLink} viewTransition>האזור שלי</NavLink>
          )}
          {user && user.role !== 'student' && (
            // An institution's admin manages their own; the system admin, the one shown.
            <NavLink
              to={`/${user.role === 'system_admin' ? institution.slug : user.institution_slug}/admin`}
              className={styles.navLink}
              viewTransition
            >
              ניהול
            </NavLink>
          )}
          {user?.role === 'system_admin' && (
            <NavLink to="/system" className={styles.navLink} viewTransition>ניהול המערכת</NavLink>
          )}
          <NavLink to="/institutions" className={styles.navLink} viewTransition>מוסדות</NavLink>
        </nav>
        <div className={styles.account}>
          <ThemeSwitch />
          {status === 'signed-in' && user && (
            <>
              <span className={styles.accountName}>
                {user.display_name}
                {user.role !== 'student' && <span className={styles.role}>{ROLE_LABELS[user.role]}</span>}
              </span>
              <button type="button" className={styles.logout} onClick={() => void logout()}>
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
      <main className={pathname.replace(/\/$/, '') === home ? styles.mainBleed : styles.main}>
        <Outlet />
      </main>
      {/* A new page starts at the top; "back" returns to where you were. */}
      <ScrollRestoration />
    </div>
  )
}
