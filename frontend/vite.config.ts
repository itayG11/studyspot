import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
const SECURITY_HEADERS = {
  'X-Frame-Options': 'DENY',
  'Content-Security-Policy': "frame-ancestors 'none'",
}

export default defineConfig({
  plugins: [react()],
  // The site may not be shown inside another site's frame (clickjacking:
  // a hidden frame under a fake button). For the dev and preview servers;
  // the production host sets the same headers (stage 7).
  server: { headers: SECURITY_HEADERS },
  preview: { headers: SECURITY_HEADERS },
  build: {
    // The main bundle is about 570 kB (180 kB gzipped): React, the router,
    // Leaflet and the small core of Motion. Split off: the admin page
    // (src/admin/LazyAdminPage.tsx) and Motion's animation features
    // (src/design/MotionProvider.tsx), loaded after the first screen.
    chunkSizeWarningLimit: 600,
  },
})
