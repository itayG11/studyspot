// Every address of the site and the page it shows.
// "Data mode" (createBrowserRouter) is used for its page-change animations.

import { createBrowserRouter } from 'react-router'
import { LazyAdminPage } from './admin/LazyAdminPage'
import { RequireAdmin, RequireAuth } from './auth/guards'
import { Layout } from './components/Layout'
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
  {
    path: '/',
    Component: Layout,
    children: [
      { index: true, Component: HomePage },
      // The old list of places is now the finder; its ?kind= links still work.
      { path: 'places', Component: PlacesRedirect },
      { path: 'spaces/:spaceId', Component: SpacePage },
      // Old addresses, kept working: the signs and links that point at them.
      { path: 'places/:placeId', Component: PlaceRedirect },
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
      { path: '*', Component: NotFoundPage },
    ],
  },
]

export const router = createBrowserRouter(routes)
