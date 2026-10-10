// The institution a page belongs to (name, time zone, booking rules).
//
// One site serves every institution, each at its own address: /demo,
// /braude. Pages under that address read it from here. Pages with one
// address for everyone (/scan, /me, /login) show the visitor's home
// institution: their own when signed in, otherwise the last one visited.

import { MapPinOff } from 'lucide-react'
import { createContext, useContext, useEffect, type ReactNode } from 'react'
import { getInstitution } from './api/campus'
import type { Institution } from './api/types'
import { useAuth } from './auth/AuthContext'
import { DEFAULT_INSTITUTION } from './config'
import { useApi } from './hooks/useApi'
import { ButtonLink, EmptyState, ErrorState, PageLoading } from './ui'

const InstitutionContext = createContext<Institution | null>(null)

// The last institution visited in this tab, so the sign-in page opened from
// /braude still says "Braude". In memory only: nothing to keep or clear.
let lastVisited: string | null = null

// oxlint-disable-next-line react/only-export-components
export function forgetVisitForTests() {
  lastVisited = null
  loaded.clear()
}

// The server's format for an institution's short name.
const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/

// Institutions already loaded in this tab. Going from /braude to /me
// changes the route branch, which mounts a new provider: it starts from here
// instead of a loading screen.
const loaded = new Map<string, Institution>()

export function InstitutionProvider({ slug, children }: { slug: string; children: ReactNode }) {
  const valid = SLUG.test(slug) // anything else is not an institution: no need to ask
  const { data, error, reload } = useApi(() => getInstitution(slug), valid ? `institution-${slug}` : null)
  const value = data ?? loaded.get(slug) ?? null
  useEffect(() => {
    if (!data) return
    loaded.set(data.slug, data)
    lastVisited = data.slug // only one that exists, or "/" would lead back to an error
  }, [data])
  if (!valid || (!value && error?.code === 'institution_not_found')) {
    return (
      <EmptyState icon={<MapPinOff />} title="המוסד לא נמצא" action={<ButtonLink to="/">לדף הראשי</ButtonLink>}>
        אולי הכתובת לא מדויקת.
      </EmptyState>
    )
  }
  if (!value && error) return <ErrorState error={error} onRetry={reload} />
  if (!value) return <PageLoading />
  return <InstitutionContext.Provider value={value}>{children}</InstitutionContext.Provider>
}

// oxlint-disable-next-line react/only-export-components
export function useInstitution(): Institution {
  const value = useContext(InstitutionContext)
  if (value === null) throw new Error('useInstitution must be used inside <InstitutionProvider>')
  return value
}

// oxlint-disable-next-line react/only-export-components
export function useHomeSlug(): string | null {
  const { status, user } = useAuth()
  if (status === 'loading') return null // not known yet
  return user?.institution_slug ?? lastVisited ?? DEFAULT_INSTITUTION
}
