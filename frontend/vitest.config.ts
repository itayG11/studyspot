import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test-setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    // The tests' fixtures are the Braude campus; fixed here so they do not
    // depend on a developer's own .env.local.
    env: { VITE_INSTITUTION: 'braude', VITE_API_URL: 'http://localhost:8000' },
  },
})
