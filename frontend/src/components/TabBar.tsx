// The phone's tab bar (wave 17, the iOS app direction): four ways to the
// pages that already exist, at the thumb. Shown on the home page, my area
// and the list of institutions; a place page has its own booking bar at the
// bottom, so there the tab bar steps aside (as iOS hides it on a pushed page).
// On a wide screen it is not shown: the header has the same links.

import { useLayoutEffect } from 'react'
import { Building2, CalendarClock, LogIn, Map, Search, UserRound } from 'lucide-react'
import { Link, useLocation, useNavigate } from 'react-router'
import { useAuth } from '../auth/AuthContext'
import styles from './TabBar.module.css'

export function TabBar({ home }: { home: string }) {
  const { status } = useAuth()
  const navigate = useNavigate()
  const { pathname, search } = useLocation()
  const signedIn = status === 'signed-in'
  const onHome = pathname.replace(/\/$/, '') === home
  const mapOn = onHome && new URLSearchParams(search).get('view') === 'map'

  // Room for the bar under the page, and above it for anything fixed at the bottom.
  // Only where the bar shows (a phone), and kept in step if the window changes.
  useLayoutEffect(() => {
    if (typeof window.matchMedia !== 'function') return // an old browser, or a test
    const phone = window.matchMedia('(max-width: 760px)')
    const set = () => {
      if (phone.matches) document.documentElement.style.setProperty('--tabbar-h', 'calc(64px + env(safe-area-inset-bottom))')
      else document.documentElement.style.removeProperty('--tabbar-h')
    }
    set()
    phone.addEventListener('change', set)
    return () => {
      phone.removeEventListener('change', set)
      document.documentElement.style.removeProperty('--tabbar-h')
    }
  }, [])

  // To the search itself, as the header's link does (Layout.tsx).
  const toFinder = (event: React.MouseEvent, view?: 'map') => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
    event.preventDefault()
    navigate(view ? `${home}?view=map` : home, { state: { toFinder: Date.now() }, viewTransition: true })
  }

  return (
    <nav className={styles.bar} aria-label="ניווט מהיר">
      <Link to={home} className={styles.tab} aria-current={onHome && !mapOn ? 'page' : undefined} onClick={(e) => toFinder(e)}>
        <Search aria-hidden="true" />
        <span>חיפוש</span>
      </Link>
      <Link to={`${home}?view=map`} className={styles.tab} aria-current={mapOn ? 'page' : undefined} onClick={(e) => toFinder(e, 'map')}>
        <Map aria-hidden="true" />
        <span>מפה</span>
      </Link>
      {signedIn ? (
        <>
          <Link to="/me#my-bookings" className={styles.tab} viewTransition>
            <CalendarClock aria-hidden="true" />
            <span>ההזמנות</span>
          </Link>
          <Link to="/me" className={styles.tab} aria-current={pathname === '/me' ? 'page' : undefined} viewTransition>
            <UserRound aria-hidden="true" />
            <span>שלי</span>
          </Link>
        </>
      ) : (
        <>
          <Link to="/institutions" className={styles.tab} aria-current={pathname === '/institutions' ? 'page' : undefined} viewTransition>
            <Building2 aria-hidden="true" />
            <span>מוסדות</span>
          </Link>
          <Link to="/login" className={styles.tab} viewTransition>
            <LogIn aria-hidden="true" />
            <span>כניסה</span>
          </Link>
        </>
      )}
    </nav>
  )
}
