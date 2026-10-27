// Every address of the site and the page it shows.
// "Data mode" (createBrowserRouter) is used for its page-change animations.

import type { ComponentType } from 'react'
import { createBrowserRouter } from 'react-router'
import { LazyAdminPage } from './admin/LazyAdminPage'
import { RequireAdmin, RequireAuth, RequireSystemAdmin } from './auth/guards'
import { HomeInstitutionRoute, InstitutionRoute, ToHomeInstitution } from './institutionRoutes'
import { LoginPage } from './pages/LoginPage'
import { HomePage } from './pages/HomePage'
import { NotFoundPage } from './pages/NotFoundPage'
import { PlaceRedirect, PlacesRedirect } from './pages/PlacesRedirect'
import { RouteErrorPage } from './pages/RouteErrorPage'
import { SpacePage } from './features/space/SpacePage'

// Pages few visitors open first load when asked for (wave 7.3): the home
// page, a place's page and sign-in stay in the main file; the rest, and
// each one's code, arrive on the way there. A guard stays in front.
const page = (load: () => Promise<ComponentType>) => ({ lazy: async () => ({ Component: await load() }) })

const pageRoutes = [
  // The front page: the visitor's own institution, or the demo campus.
  { path: '/', element: <ToHomeInstitution /> },
  // Pages with one address for every institution. They show the visitor's
  // home institution. A sign's QR code holds /scan, so signs never change.
  {
    Component: HomeInstitutionRoute,
    children: [
      // The scan page asks for sign-in itself, keeping the code out of the address.
      { path: 'scan', ...page(() => import('./scan/ScanPage').then((m) => m.ScanPage)) },
      {
        path: 'me',
        ...page(() => import('./me/MyPage').then(({ MyPage }) => () => <RequireAuth><MyPage /></RequireAuth>)),
      },
      // The system admin's page, and the link a new institution's admin gets.
      {
        path: 'system',
        ...page(() => import('./system/SystemPage').then(({ SystemPage }) => () => <RequireSystemAdmin><SystemPage /></RequireSystemAdmin>)),
      },
      // "I'm studying here" (wave 14): a friend's link. Its preview for chat
      // apps is made by the server (backend app/site.py).
      { path: 's/:token', ...page(() => import('./share/SharePage').then((m) => m.SharePage)) },
      { path: 'invite', ...page(() => import('./pages/InvitePage').then((m) => m.InvitePage)) },
      { path: 'institutions', ...page(() => import('./pages/InstitutionsPage').then((m) => m.InstitutionsPage)) },
      { path: 'login', Component: LoginPage },
      { path: 'signed-in', ...page(() => import('./pages/SignedInPage').then((m) => m.SignedInPage)) },
      { path: 'unsubscribe', ...page(() => import('./pages/UnsubscribePage').then((m) => m.UnsubscribePage)) },
      { path: 'terms', ...page(() => import('./pages/TermsPage').then((m) => m.TermsPage)) },
      { path: 'privacy', ...page(() => import('./pages/PrivacyPage').then((m) => m.PrivacyPage)) },
      { path: 'accessibility', ...page(() => import('./pages/AccessibilityPage').then((m) => m.AccessibilityPage)) },
      { path: 'developers', ...page(() => import('./pages/DevelopersPage').then((m) => m.DevelopersPage)) },
      { path: 'licenses', ...page(() => import('./pages/LicensesPage').then((m) => m.LicensesPage)) },
      // The living style guide, in development only; the build leaves it out.
      ...(import.meta.env.DEV
        ? [{ path: 'design', lazy: () => import('./design/Showcase').then((module) => ({ Component: module.Showcase })) }]
        : []),
    ],
  },
  // Old addresses from before every institution had its own, kept working.
  // The place page then moves to the place's own institution.
  { path: 'places', Component: PlacesRedirect },
  { path: 'places/:placeId', Component: PlaceRedirect },
  { path: 'spaces/:placeId', Component: PlaceRedirect },
  // The screen by the door (wave 13): a page of its own, without the site's
  // header, which a tablet shows all day. Its link is after "#".
  { path: 'screen', ...page(() => import('./screen/ScreenPage').then((m) => m.ScreenPage)) },
  // The admin page is at the institution's address now: /braude/admin.
  { path: 'admin', element: <ToHomeInstitution path="/admin" /> },
  // Each institution's own pages: /demo, /braude/spaces/12. A fixed address
  // above wins over a short name, so no institution may be called "scan".
  {
    path: ':slug',
    Component: InstitutionRoute,
    children: [
      { index: true, Component: HomePage },
      { path: 'spaces/:spaceId', Component: SpacePage },
      {
        path: 'admin',
        element: (
          <RequireAdmin>
            <LazyAdminPage />
          </RequireAdmin>
        ),
      },
      // An unknown page: /braude/nope. A single unknown word (/nope) is
      // taken as an institution's name, and says that no such one exists.
      { path: '*', Component: NotFoundPage },
    ],
  },
]

// A crash in any page lands on RouteErrorPage (reported, in Hebrew), not on
// the router's own English page.
export const routes = [{ ErrorBoundary: RouteErrorPage, children: pageRoutes }]

export const router = createBrowserRouter(routes)
