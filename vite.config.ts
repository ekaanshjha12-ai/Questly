import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
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
