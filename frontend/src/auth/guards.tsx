// Pages that need a signed-in user (or an admin). Anyone else is sent to
// the sign-in page, which brings them back here afterwards (?next=).

import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router'
import { ShieldX } from 'lucide-react'
import { ButtonLink, EmptyState, PageLoading } from '../ui'
import { useInstitution } from '../institution'
import { useAuth } from './AuthContext'

export function RequireAuth({ children }: { children: ReactNode }) {
  const { status } = useAuth()
  const location = useLocation()
  if (status === 'loading') return <PageLoading label="בודק התחברות…" />
  if (status === 'signed-out') {
    const next = encodeURIComponent(location.pathname + location.search)
    return <Navigate to={`/login?next=${next}`} replace />
  }
  return children
}

// The admin page of the institution in the address: its own admins, and
// the system admin, who manages every institution. The server checks too.
export function RequireAdmin({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const { slug } = useInstitution()
  const allowed = user?.role === 'system_admin' || (user?.role === 'institution_admin' && user.institution_slug === slug)
  return <RequireAuth>{user && !allowed ? <NoAccess>הדף הזה מיועד למנהלי המוסד בלבד.</NoAccess> : children}</RequireAuth>
}

export function RequireSystemAdmin({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  return (
    <RequireAuth>
      {user && user.role !== 'system_admin' ? <NoAccess>הדף הזה מיועד למנהל המערכת בלבד.</NoAccess> : children}
    </RequireAuth>
  )
}

function NoAccess({ children }: { children: ReactNode }) {
  const { slug } = useInstitution()
  return (
    <EmptyState icon={<ShieldX />} title="אין גישה" action={<ButtonLink to={`/${slug}`} variant="secondary">לחיפוש מקום</ButtonLink>}>
      {children}
    </EmptyState>
  )
}
