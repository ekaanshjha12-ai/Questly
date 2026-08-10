/**
 * Service worker for Questly.
 *
 * Two caching rules, chosen by what the request is:
 *
 *   Assets  — cache-first. Vite fingerprints its bundles and the models and
 *             audio never change under a given name, so once cached they can be
 *             served straight from disk. This is what makes the app open
 *             instantly and work with no signal.
 *   Pages   — network-first, falling back to the cached shell. The HTML must be
 *             fresh or a deploy would never reach anyone.
 *
 * API calls are deliberately never cached: quests, XP and purchases must come
 * from the server, and a stale reply would show wrong progress.
 */

const VERSION = 'questly-v1'
const SHELL = `${VERSION}-shell`
const ASSETS = `${VERSION}-assets`

// Enough to render something useful on a cold, offline start.
const PRECACHE = ['/', '/manifest.webmanifest', '/icons/icon-192.png', '/icons/icon-512.png']

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL)
      .then((cache) => cache.addAll(PRECACHE))
      // A missing file must not wedge the whole install.
      .catch(() => undefined)
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k))),
      )
      .then(() => self.clients.claim()),
  )
})

function isAsset(url) {
  return (
    url.pathname.startsWith('/assets/') ||
    url.pathname.startsWith('/models/') ||
    url.pathname.startsWith('/audio/') ||
    url.pathname.startsWith('/icons/')
  )
}

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return

  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return

  // Never cache the API. Serving a stale quest list or XP total would be worse
  // than showing an error.
  if (url.pathname.startsWith('/api/')) return

  if (isAsset(url)) {
    event.respondWith(
      caches.match(request).then(
        (hit) =>
          hit ??
          fetch(request).then((res) => {
            if (res.ok) {
              const copy = res.clone()
              caches.open(ASSETS).then((c) => c.put(request, copy))
            }
            return res
          }),
      ),
    )
    return
  }

  // Navigations: try the network so deploys land, fall back to the cached shell.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((res) => {
          const copy = res.clone()
          caches.open(SHELL).then((c) => c.put('/', copy))
          return res
        })
        .catch(() => caches.match('/').then((hit) => hit ?? Response.error())),
    )
  }
})
