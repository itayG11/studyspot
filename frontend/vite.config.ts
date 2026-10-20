import react from '@vitejs/plugin-react'
import { defineConfig, type Connect, type Plugin } from 'vite'

// https://vite.dev/config/
const SECURITY_HEADERS = {
  'X-Frame-Options': 'DENY',
  'Content-Security-Policy': "frame-ancestors 'none'",
}

// The same headers on the dev and preview servers, except for the occupancy
// widget (wave 14.4): other sites may frame it, as in production (app/site.py).
// It also serves embed.html for /embed/<slug>, as the production server does.
function headers(): Plugin {
  const apply = (server: { middlewares: Connect.Server }) => {
    server.middlewares.use((request, response, next) => {
      const path = request.url ?? '/'
      if (path.startsWith('/embed/')) {
        response.setHeader('Content-Security-Policy', 'frame-ancestors *')
        request.url = '/embed.html'
      } else {
        for (const [name, value] of Object.entries(SECURITY_HEADERS)) response.setHeader(name, value)
      }
      next()
    })
  }
  return { name: 'studyspot-headers', configureServer: apply, configurePreviewServer: apply }
}

export default defineConfig({
  // headers(): the site may not be shown inside another site's frame
  // (clickjacking: a hidden frame under a fake button), the widget apart.
  plugins: [react(), headers()],
  build: {
    // The main bundle is about 450 kB (147 kB gzipped): React, the router,
    // the small core of Motion, and the site's own code (about 10%). Split off, loaded only
    // when needed: the map with Leaflet (src/features/finder/FinderMap.tsx),
    // Motion's animation features (src/design/MotionProvider.tsx) and the
    // admin page (src/admin/LazyAdminPage.tsx).
    chunkSizeWarningLimit: 600,
    // Two pages: the web app, and the small occupancy widget (embed.html).
    rollupOptions: { input: { main: 'index.html', embed: 'embed.html' } },
    // Fonts stay files, never inlined as data: addresses. The production
    // policy allows fonts from this site only (font-src 'self', see
    // backend/app/site.py), and files are cached across pages anyway.
    assetsInlineLimit: (file) => (/\.(woff2?|ttf|otf)$/.test(file) ? false : undefined),
  },
})
