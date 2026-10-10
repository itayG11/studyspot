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

// The institution of an invite just accepted. Accepting changes the
// visitor's home institution, and the pages with one address (this one too)
// are then drawn again from scratch: kept out here, it survives that.
let justAccepted: string | null = null

export function InvitePage() {
  const { status, user } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const [token] = useState(() => tokenFromHash(location.hash) ?? peekPendingInvite())
  const invite = useApi(() => inspectInvite(token!), status === 'signed-in' && token ? `invite-${token}` : null)
  const action = useAction()
  const [accepted, setAccepted] = useState<string | null>(() => justAccepted)
  const [stale, setStale] = useState(false) // accepted, but the new role did not load

  useEffect(() => {
    if (accepted) justAccepted = null // used: on the way to the admin page
  }, [accepted])
  useEffect(() => {
    if (!tokenFromHash(location.hash)) return
    rememberPendingInvite(tokenFromHash(location.hash)!) // waits here if sign-in comes first
    navigate('/invite', { replace: true }) // out of the address and history
  }, [location.hash, navigate])

  if (accepted) return <Navigate to={`/${accepted}/admin`} replace />
  if (stale) {
    return (
      <EmptyState icon={<KeyRound />} title="ההזמנה התקבלה">
        טען מחדש את הדף, כדי להיכנס לדף הניהול.
      </EmptyState>
    )
  }
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
    justAccepted = done.slug
    // The admin page checks the role: wait for the new one, or say so.
    const fresh = await refreshSession().catch(() => null)
    if (fresh?.institution_slug === done.slug) {
      setAccepted(done.slug)
    } else {
      justAccepted = null
      setStale(true)
    }
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
