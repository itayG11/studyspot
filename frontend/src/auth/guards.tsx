// Pages that need a signed-in user (or an admin). Anyone else is sent to
// the sign-in page, which brings them back here afterwards (?next=).

import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router'
import { useAuth } from './AuthContext'

export function RequireAuth({ children }: { children: ReactNode }) {
  const { status } = useAuth()
  const location = useLocation()
  if (status === 'loading') return <p className="page-message">בודק התחברות…</p>
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
        <section className="panel narrow">
          <h1>אין גישה</h1>
          <p>הדף הזה מיועד למנהלי המוסד בלבד.</p>
        </section>
      ) : (
        children
      )}
    </RequireAuth>
  )
}
