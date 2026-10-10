// The link a new institution's admin receives: /invite#t=<token>.
// The token sits after "#", which browsers never send to a server, and it
// leaves the address at once. Until it is accepted it waits in this tab
// (sessionStorage), so signing in first does not lose it.

import { useEffect, useState } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router'
import { KeyRound, Link2Off } from 'lucide-react'
import { refreshSession } from '../api/client'
import { acceptInvite, inspectInvite } from '../api/system'
import { useAuth } from '../auth/AuthContext'
import { clearPendingInvite, peekPendingInvite, rememberPendingInvite } from '../auth/pendingInvite'
import { useAction } from '../hooks/useAction'
import { useApi } from '../hooks/useApi'
import { Button, ButtonLink, EmptyState, ErrorState, PageLoading } from '../ui'

function tokenFromHash(hash: string): string | null {
  return new URLSearchParams(hash.replace(/^#/, '')).get('t') || null
}

export function InvitePage() {
  const { status, user } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const [token] = useState(() => tokenFromHash(location.hash) ?? peekPendingInvite())
  const invite = useApi(() => inspectInvite(token!), status === 'signed-in' && token ? `invite-${token}` : null)
  const action = useAction()
  const [accepted, setAccepted] = useState<string | null>(null)

  useEffect(() => {
    if (!tokenFromHash(location.hash)) return
    rememberPendingInvite(tokenFromHash(location.hash)!) // waits here if sign-in comes first
    navigate('/invite', { replace: true }) // out of the address and history
  }, [location.hash, navigate])

  if (accepted) return <Navigate to={`/${accepted}/admin`} replace />
  if (token === null) {
    return (
      <EmptyState icon={<Link2Off />} title="הקישור לא שלם">
        פתח שוב את קישור ההזמנה המלא, כפי שקיבלת אותו.
      </EmptyState>
    )
  }
  if (status === 'loading') return <PageLoading label="בודק התחברות…" />
  if (status === 'signed-out') {
    return (
      <EmptyState
        icon={<KeyRound />}
        title="הוזמנת לנהל מוסד ב-StudySpot"
        action={<ButtonLink to={`/login?next=${encodeURIComponent('/invite')}`}>התחברות</ButtonLink>}
      >
        כדי לקבל את ההזמנה, התחבר עם חשבון אישי, של גוגל או של מיקרוסופט. אחר כך תחזור לכאן.
      </EmptyState>
    )
  }
  if (!invite.data && invite.error) return <ErrorState error={invite.error} onRetry={invite.reload} />
  if (!invite.data) return <PageLoading />

  const institution = invite.data
  const moving = user?.institution_slug !== institution.slug
  async function accept() {
    const done = await action.run(() => acceptInvite(token!))
    if (!done) return
    clearPendingInvite()
    await refreshSession().catch(() => null) // the header shows the new role
    setAccepted(done.slug)
  }
  return (
    <EmptyState
      icon={<KeyRound />}
      title={`הוזמנת לנהל את ${institution.name}`}
      action={
        <Button busy={action.busy} onClick={() => void accept()}>
          לקבל את ההזמנה
        </Button>
      }
    >
      <p>אחרי הקבלה תהיה המנהל של המוסד, ותקים אותו בדף הניהול: בניינים, מקומות ושלטים.</p>
      {moving && <p>החשבון שלך יעבור למוסד הזה. ההזמנות והכניסות שלך בקמפוס ההדגמה יימחקו.</p>}
      {action.error && <p role="alert">{action.error}</p>}
    </EmptyState>
  )
}
