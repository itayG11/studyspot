// Every address of the site and the page it shows.
// "Data mode" (createBrowserRouter) is used for its page-change animations.

import { createBrowserRouter } from 'react-router'
import { LazyAdminPage } from './admin/LazyAdminPage'
import { RequireAdmin, RequireAuth } from './auth/guards'
import { Layout } from './components/Layout'
import { MyPage } from './me/MyPage'
import { LoginPage } from './pages/LoginPage'
import { MapPage } from './pages/MapPage'
import { NotFoundPage } from './pages/NotFoundPage'
import { PlacePage } from './pages/PlacePage'
import { PlacesPage } from './pages/PlacesPage'
import { SignedInPage } from './pages/SignedInPage'
import { ScanPage } from './scan/ScanPage'

export const routes = [
  {
    path: '/',
    Component: Layout,
    children: [
      { index: true, Component: MapPage },
      { path: 'places', Component: PlacesPage },
      { path: 'places/:placeId', Component: PlacePage },
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
      { path: '*', Component: NotFoundPage },
    ],
  },
]

export const router = createBrowserRouter(routes)
