// Every address of the site and the page it shows.
// "Data mode" (createBrowserRouter) is used for its page-change animations.

import { createBrowserRouter } from 'react-router'
import { Layout } from './components/Layout'
import { LoginPage } from './pages/LoginPage'
import { MapPage } from './pages/MapPage'
import { NotFoundPage } from './pages/NotFoundPage'
import { PlacePage } from './pages/PlacePage'
import { PlacesPage } from './pages/PlacesPage'
import { SignedInPage } from './pages/SignedInPage'

export const routes = [
  {
    path: '/',
    Component: Layout,
    children: [
      { index: true, Component: MapPage },
      { path: 'places', Component: PlacesPage },
      { path: 'places/:placeId', Component: PlacePage },
      { path: 'login', Component: LoginPage },
      { path: 'signed-in', Component: SignedInPage },
      { path: '*', Component: NotFoundPage },
    ],
  },
]

export const router = createBrowserRouter(routes)
