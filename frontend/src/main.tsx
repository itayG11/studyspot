import '@fontsource/ibm-plex-sans-hebrew/400.css'
import '@fontsource/ibm-plex-sans-hebrew/600.css'
import '@fontsource/ibm-plex-mono/500.css'
import '@fontsource/ibm-plex-mono/600.css'
import '@fontsource-variable/frank-ruhl-libre/wght.css'
import './design/tokens.css'
import './styles/base.css'

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from 'react-router/dom'
import { AuthProvider } from './auth/AuthContext'
import { MotionProvider } from './design/MotionProvider'
import { InstitutionProvider } from './institution'
import { router } from './router'
import { ToastProvider } from './ui/Toast'
import { applyTheme, readTheme } from './logic/theme'

// The visitor's own light or dark choice. public/theme-init.js already set
// it before the first paint; this also sets the browser bar's colour.
applyTheme(readTheme())

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider>
      <InstitutionProvider>
        <MotionProvider>
          <ToastProvider>
            <RouterProvider router={router} />
          </ToastProvider>
        </MotionProvider>
      </InstitutionProvider>
    </AuthProvider>
  </StrictMode>,
)
