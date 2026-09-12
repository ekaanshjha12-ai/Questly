import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
// Imported before the render so its listener is attached when Chrome fires the
// install offer, which happens well before the signed-in app mounts.
import './lib/install'
import { applyCursorPrefs, loadCursorPrefs } from './lib/cursors'
import App from './App.tsx'

// Before the first render, so the sign-in screen already has the chosen cursor.
applyCursorPrefs(loadCursorPrefs())

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// Registered only in a real build: in dev the worker would serve stale bundles
// and fight Vite's hot reload. Waiting for `load` keeps it off the critical path.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // Registration fails on insecure origins and in private windows. The app
      // works fine without it — only offline support is lost.
    })
  })
}
