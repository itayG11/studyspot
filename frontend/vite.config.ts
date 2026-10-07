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
    // The main bundle is about 520 kB (160 kB gzipped): React, the router
    // and Leaflet, which the home page needs at once. The admin page is
    // split off (src/admin/LazyAdminPage.tsx).
    chunkSizeWarningLimit: 600,
  },
})
