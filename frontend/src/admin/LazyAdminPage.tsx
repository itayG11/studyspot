// The admin page (and the QR library it uses) is loaded only when an admin
// opens it, so students never download it.

import { lazy, Suspense } from 'react'

const AdminPage = lazy(() => import('./AdminPage').then((module) => ({ default: module.AdminPage })))

export function LazyAdminPage() {
  return (
    <Suspense fallback={<p className="page-message">טוען…</p>}>
      <AdminPage />
    </Suspense>
  )
}
