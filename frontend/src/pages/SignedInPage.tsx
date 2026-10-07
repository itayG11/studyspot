// The server sends the browser here after Microsoft or Google.
// On success there is no token in the address: the AuthProvider's refresh
// picks up the new session cookie.

import { useEffect, useState } from 'react'
import { Link, Navigate, useSearchParams } from 'react-router'
import { useAuth } from '../auth/AuthContext'
import { clearReturnTo, peekReturnTo } from '../auth/returnTo'
import { errorMessage } from '../i18n/errors'

export function SignedInPage() {
  const [params] = useSearchParams()
  const { status } = useAuth()
  const error = params.get('error')
  const [target] = useState(peekReturnTo) // the page the student came from
  useEffect(() => {
    if (status !== 'loading') clearReturnTo()
  }, [status])

  if (error) {
    return (
      <section className="panel narrow">
        <h1>ההתחברות לא הצליחה</h1>
        <p role="alert" className="error">{errorMessage(error)}</p>
        <Link to="/login">לנסות שוב</Link>
      </section>
    )
  }
  if (status === 'signed-in') return <Navigate to={target} replace />
  if (status === 'loading') return <p className="page-message">משלים את ההתחברות…</p>
  return (
    <section className="panel narrow">
      <h1>ההתחברות לא הושלמה</h1>
      <Link to="/login">לנסות שוב</Link>
    </section>
  )
}
