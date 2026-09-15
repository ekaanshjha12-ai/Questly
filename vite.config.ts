import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  build: {
    // Only truly tiny files are inlined into the JavaScript (the map's blur
    // placeholder); building pictures stay separate, cacheable files.
    assetsInlineLimit: 1024,
  },
  server: {
    port: 5174,
    strictPort: true,
    // Same-origin /api during dev so the session cookie is sent without CORS.
    proxy: {
      '/api': {
        target: 'http://localhost:5175',
        changeOrigin: true,
      },
    },
  },
})
