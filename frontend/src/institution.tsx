// The institution the site shows (name and time zone), loaded once.

import { createContext, useContext, type ReactNode } from 'react'
import { getInstitution } from './api/campus'
import type { Institution } from './api/types'
import { useApi } from './hooks/useApi'
import { errorMessage } from './i18n/errors'

const InstitutionContext = createContext<Institution | null>(null)

export function InstitutionProvider({ children }: { children: ReactNode }) {
  const { data, error } = useApi(getInstitution, 'institution')
  if (error) return <p className="page-message" role="alert">{errorMessage(error.code)}</p>
  if (!data) return <p className="page-message">טוען…</p>
  return <InstitutionContext.Provider value={data}>{children}</InstitutionContext.Provider>
}

// oxlint-disable-next-line react/only-export-components
export function useInstitution(): Institution {
  const value = useContext(InstitutionContext)
  if (value === null) throw new Error('useInstitution must be used inside <InstitutionProvider>')
  return value
}
