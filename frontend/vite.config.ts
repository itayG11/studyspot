import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    // The main bundle is about 520 kB (160 kB gzipped): React, the router
    // and Leaflet, which the home page needs at once. The admin page is
    // split off (src/admin/LazyAdminPage.tsx).
    chunkSizeWarningLimit: 600,
  },
})
