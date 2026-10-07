// Who is signed in, for every page. On the first load it tries one refresh,
// which restores the session from the cookie after a page reload.

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import * as client from '../api/client'
import type { DemoPersona, Me } from '../api/types'

type Status = 'loading' | 'signed-in' | 'signed-out'

interface AuthValue {
  status: Status
  user: Me | null
  demoLogin: (persona: DemoPersona) => Promise<void>
  logout: () => Promise<void>
  logoutAll: () => Promise<void>
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
    logout: () => client.logout(),
    logoutAll: () => client.logoutAll(),
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
