// The route components that pick the institution of a page: from the
// address (/braude/...), or the visitor's home institution.

import { Navigate, useLocation, useParams } from 'react-router'
import { Layout } from './components/Layout'
import { InstitutionProvider, useHomeSlug } from './institution'
import { PageLoading } from './ui'

// The pages under /:slug.
export function InstitutionRoute() {
  const { slug = '' } = useParams()
  return (
    <InstitutionProvider slug={slug}>
      <Layout />
    </InstitutionProvider>
  )
}

// The pages with one address for every institution.
export function HomeInstitutionRoute() {
  const slug = useHomeSlug()
  if (slug === null) return <PageLoading />
  return (
    <InstitutionProvider slug={slug}>
      <Layout />
    </InstitutionProvider>
  )
}

// "/" and the old addresses without an institution: the same page at the
// visitor's home institution.
export function ToHomeInstitution({ path = '', hash }: { path?: string; hash?: string }) {
  const slug = useHomeSlug()
  const location = useLocation()
  if (slug === null) return <PageLoading />
  return <Navigate to={{ pathname: `/${slug}${path}`, search: location.search, hash: hash ?? location.hash }} replace />
}
