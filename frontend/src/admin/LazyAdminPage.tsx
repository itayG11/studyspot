// The admin page (and the QR library it uses) is loaded only when an admin
// opens it, so students never download it.

import { lazy, Suspense } from 'react'
import { PageLoading } from '../ui'

const AdminPage = lazy(() => import('./AdminPage').then((module) => ({ default: module.AdminPage })))

export function LazyAdminPage() {
  return (
    <Suspense fallback={<PageLoading />}>
      <AdminPage />
    </Suspense>
  )
}
