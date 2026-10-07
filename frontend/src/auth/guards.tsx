// Pages that need a signed-in user (or an admin). Anyone else is sent to
// the sign-in page, which brings them back here afterwards (?next=).

import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router'
import { ShieldX } from 'lucide-react'
import { ButtonLink, EmptyState, PageLoading } from '../ui'
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

export function RequireAdmin({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  return (
    <RequireAuth>
      {user?.role === 'student' ? (
        <EmptyState icon={<ShieldX />} title="אין גישה" action={<ButtonLink to="/" variant="secondary">לחיפוש מקום</ButtonLink>}>
          הדף הזה מיועד למנהלי המוסד בלבד.
        </EmptyState>
      ) : (
        children
      )}
    </RequireAuth>
  )
}
