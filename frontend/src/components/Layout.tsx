import { useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { CalendarClock } from 'lucide-react'
import { Link, NavLink, Outlet, ScrollRestoration, useLocation, useNavigate } from 'react-router'
import { Pin } from '../illustrations/Pin'
import { ThemeSwitch } from './ThemeSwitch'
import type { UserRole } from '../api/types'
import { useAuth } from '../auth/AuthContext'
import { useInstitution } from '../institution'
import styles from './Layout.module.css'
import { SiteFooter } from './SiteFooter'
import { scrollKey } from '../logic/scroll'
import { CampusPulse } from './CampusPulse'
import { BookingsDrawer } from './BookingsDrawer'
import { CampusTodayProvider, useCampusToday } from '../features/load/campusToday'
import { cancelBooking, myBookings } from '../api/student'
import { REFRESH_INTERVAL_MS } from '../config'
import { useApi } from '../hooks/useApi'
import { activeBookings } from '../logic/bookings'

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
    <CampusTodayProvider slug={institution.slug}>
    <div className={styles.app}>
      {/* The first stop of the keyboard: past the header to the page itself. */}
      <a href="#main" className={styles.skip}>
        דלג לתוכן
      </a>
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
          {status === 'signed-in' && user && <MyAreaLink userId={user.id} />}
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
        <Pulse home={home} />
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
      <main id="main" tabIndex={-1} className={pathname.replace(/\/$/, '') === home ? styles.mainBleed : styles.main}>
        <Outlet />
      </main>
      <SiteFooter />
      {/* A new page starts at the top; "back" returns to where you were. */}
      <ScrollRestoration getKey={scrollKey} />
    </div>
    </CampusTodayProvider>
  )
}

function Pulse({ home }: { home: string }) {
  const today = useCampusToday()
  return <CampusPulse today={today.data} home={home} />
}

// "My area", with how many bookings are still ahead: the count is also in
// its name, for a screen reader. With bookings ahead, a button next to it
// opens them in a drawer, to see or cancel one without leaving the page.
function MyAreaLink({ userId }: { userId: number }) {
  const { slug, timezone } = useInstitution()
  // Counted when the answer arrives, against the clock at that moment.
  const bookings = useApi(
    () => myBookings().then((all) => activeBookings(all, new Date()).toSorted((a, b) => a.starts_at.localeCompare(b.starts_at))),
    `my-bookings-${userId}`,
    REFRESH_INTERVAL_MS,
  )
  const [drawer, setDrawer] = useState(false)
  const active = bookings.data ?? []
  const count = active.length
  return (
    <>
      <NavLink
        to="/me"
        className={styles.navLink}
        aria-label={count > 0 ? `האזור שלי, ${count === 1 ? 'הזמנה אחת' : `${count} הזמנות`}` : undefined}
        viewTransition
      >
        האזור שלי
        {count > 0 && <span className={styles.count} aria-hidden="true">{count}</span>}
      </NavLink>
      {/* Always there for a signed-in student: with no bookings, the drawer says so and leads to the search. */}
      <button type="button" className={styles.drawerButton} aria-label="ההזמנות הקרובות" onClick={() => setDrawer(true)}>
        <CalendarClock aria-hidden="true" />
      </button>
      {/* Out of the navigation landmark: a dialog is not part of the menu. */}
      {createPortal(
      <BookingsDrawer
        open={drawer}
        bookings={active}
        timeZone={timezone}
        findHref={`/${slug}#finder`}
        onClose={() => setDrawer(false)}
        onCancel={async (id) => {
          await cancelBooking(id)
          bookings.reload()
        }}
      />,
      document.body,
      )}
    </>
  )
}
