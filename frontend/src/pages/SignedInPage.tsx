// The server sends the browser here after Microsoft or Google.
// On success there is no token in the address: the AuthProvider's refresh
// picks up the new session cookie.

import { useEffect, useState } from 'react'
import { Navigate, useSearchParams } from 'react-router'
import { LogIn } from 'lucide-react'
import { useAuth } from '../auth/AuthContext'
import { clearReturnTo, peekReturnTo } from '../auth/returnTo'
import { errorMessage } from '../i18n/errors'
import { ButtonLink, EmptyState, PageLoading } from '../ui'

export function SignedInPage() {
  const [params] = useSearchParams()
  const { status } = useAuth()
  const error = params.get('error')
  const [target] = useState(peekReturnTo) // the page the student came from
  useEffect(() => {
    if (status !== 'loading') clearReturnTo()
  }, [status])

  const again = <ButtonLink to="/login">לנסות שוב</ButtonLink>
  if (error) {
    return (
      <EmptyState icon={<LogIn />} title="ההתחברות לא הצליחה" action={again}>
        <p role="alert">{errorMessage(error)}</p>
      </EmptyState>
    )
  }
  if (status === 'signed-in') return <Navigate to={target} replace />
  if (status === 'loading') return <PageLoading label="משלים את ההתחברות…" />
  return <EmptyState icon={<LogIn />} title="ההתחברות לא הושלמה" action={again} />
}
