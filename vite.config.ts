import { resolve } from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  build: {
    // Only truly tiny files are inlined into the JavaScript (the map's blur
    // placeholder); building pictures stay separate, cacheable files.
    assetsInlineLimit: 1024,
    rollupOptions: {
      input: {
        // The app, and the website shown to anyone not signed in. They share
        // the pictures, so the map and the rooms are emitted once.
        app: resolve(__dirname, 'index.html'),
        site: resolve(__dirname, 'site/index.html'),
      },
    },
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
