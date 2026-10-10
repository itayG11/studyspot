// Who is signed in, for every page. On the first load it tries one refresh,
// which restores the session from the cookie after a page reload.

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import * as client from '../api/client'
import type { DemoPersona, Me } from '../api/types'
import { clearPendingInvite } from './pendingInvite'

type Status = 'loading' | 'signed-in' | 'signed-out'

interface AuthValue {
  status: Status
  user: Me | null
  demoLogin: (persona: DemoPersona) => Promise<void>
  emailStart: (email: string) => Promise<void>
  emailVerify: (email: string, code: string) => Promise<void>
  logout: () => Promise<void>
  logoutAll: () => Promise<void>
  deleteAccount: () => Promise<void>
}

const AuthContext = createContext<AuthValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<Me | null>(null)
  const [status, setStatus] = useState<Status>('loading')

  useEffect(() => {
    const stop = client.onSessionChange((next) => {
      setUser(next)
      setStatus(next ? 'signed-in' : 'signed-out')
    })
    client.refreshSession().catch(() => setStatus('signed-out')) // server down: browse signed out
    return stop
  }, [])

  const value: AuthValue = {
    status,
    user,
    demoLogin: async (persona) => {
      await client.demoLogin(persona)
    },
    emailStart: async (email) => {
      await client.emailStart(email)
    },
    emailVerify: async (email, code) => {
      await client.emailVerify(email, code)
    },
    // An invite waiting in this tab is the signed-in person's: it goes too.
    logout: () => { clearPendingInvite(); return client.logout() },
    logoutAll: () => { clearPendingInvite(); return client.logoutAll() },
    deleteAccount: () => { clearPendingInvite(); return client.deleteAccount() },
  }
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

// The hook lives next to its provider, which the lint rule flags by default.
// oxlint-disable-next-line react/only-export-components
export function useAuth(): AuthValue {
  const value = useContext(AuthContext)
  if (value === null) throw new Error('useAuth must be used inside <AuthProvider>')
  return value
}
