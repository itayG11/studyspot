// Every address of the site and the page it shows.
// "Data mode" (createBrowserRouter) is used for its page-change animations.

import { createBrowserRouter } from 'react-router'
import { LazyAdminPage } from './admin/LazyAdminPage'
import { RequireAdmin, RequireAuth } from './auth/guards'
import { HomeInstitutionRoute, InstitutionRoute, ToHomeInstitution } from './institutionRoutes'
import { MyPage } from './me/MyPage'
import { LoginPage } from './pages/LoginPage'
import { HomePage } from './pages/HomePage'
import { NotFoundPage } from './pages/NotFoundPage'
import { PlaceRedirect, PlacesRedirect } from './pages/PlacesRedirect'
import { SpacePage } from './features/space/SpacePage'
import { SignedInPage } from './pages/SignedInPage'
import { ScanPage } from './scan/ScanPage'
import { PrivacyPage } from './pages/PrivacyPage'

export const routes = [
  // The front page: the visitor's own institution, or the demo campus.
  { path: '/', element: <ToHomeInstitution /> },
  // Pages with one address for every institution. They show the visitor's
  // home institution. A sign's QR code holds /scan, so signs never change.
  {
    Component: HomeInstitutionRoute,
    children: [
      // The scan page asks for sign-in itself, keeping the code out of the address.
      { path: 'scan', Component: ScanPage },
      { path: 'me', element: <RequireAuth><MyPage /></RequireAuth> },
      {
        path: 'admin',
        element: (
          <RequireAdmin>
            <LazyAdminPage />
          </RequireAdmin>
        ),
      },
      { path: 'login', Component: LoginPage },
      { path: 'signed-in', Component: SignedInPage },
      { path: 'privacy', Component: PrivacyPage },
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
  // Each institution's own pages: /demo, /braude/spaces/12. A fixed address
  // above wins over a short name, so no institution may be called "scan".
  {
    path: ':slug',
    Component: InstitutionRoute,
    children: [
      { index: true, Component: HomePage },
      { path: 'spaces/:spaceId', Component: SpacePage },
      // An unknown page: /braude/nope. A single unknown word (/nope) is
      // taken as an institution's name, and says that no such one exists.
      { path: '*', Component: NotFoundPage },
    ],
  },
]

export const router = createBrowserRouter(routes)
