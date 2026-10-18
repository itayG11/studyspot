// The link in every email notice: /unsubscribe#t=<token>. The token is
// after "#", so it never reaches a server log; the page sends it to the
// server once and shows the result. No sign-in needed.

import { useEffect, useState } from 'react'
import { MailX } from 'lucide-react'
import { unsubscribeEmail } from '../api/student'
import { ApiError } from '../api/client'
import { errorMessage } from '../i18n/errors'
import { ButtonLink, EmptyState, PageLoading } from '../ui'

type State = { status: 'working' } | { status: 'done' } | { status: 'failed'; message: string }

export function UnsubscribePage() {
  const [token] = useState(() => new URLSearchParams(window.location.hash.replace(/^#/, '')).get('t'))
  const [state, setState] = useState<State>(token ? { status: 'working' } : { status: 'failed', message: errorMessage('unsubscribe_invalid') })

  useEffect(() => {
    if (!token) return
    window.history.replaceState(null, '', '/unsubscribe') // out of the address bar and history
    let live = true
    unsubscribeEmail(token)
      .then(() => live && setState({ status: 'done' }))
      .catch((error: unknown) => {
        const code = error instanceof ApiError ? error.code : 'network'
        if (live) setState({ status: 'failed', message: errorMessage(code) })
      })
    return () => {
      live = false
    }
  }, [token])

  if (state.status === 'working') return <PageLoading />
  return (
    <EmptyState
      icon={<MailX />}
      title={state.status === 'done' ? 'ההתראות במייל כבויות' : 'לא הצלחנו לכבות'}
      action={<ButtonLink to="/me">לאזור שלי</ButtonLink>}
    >
      {state.status === 'done'
        ? 'לא יישלחו אליך יותר התראות במייל. אפשר להפעיל אותן שוב ב"האזור שלי".'
        : state.message}
    </EmptyState>
  )
}
