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

const VERSION = 'questly-v3'
const SHELL = `${VERSION}-shell`
const ASSETS = `${VERSION}-assets`

// Enough to render something useful on a cold, offline start. The app's own
// page, not `/`: signed out, `/` is the website, which is no use offline to
// someone who has the app installed.
const PRECACHE = ['/index.html', '/theme-init.js', '/manifest.webmanifest', '/icons/icon-64.png', '/icons/icon-192.png']

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
    // The Draco decoder. Without it cached, the models would download offline
    // and then be undecodable, which looks exactly like the models failing.
    url.pathname.startsWith('/draco/') ||
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

  // The theme script has no fingerprint, so it is fetched fresh when online and
  // served from the cache when not.
  if (url.pathname === '/theme-init.js') {
    event.respondWith(
      fetch(request)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone()
            caches.open(SHELL).then((c) => c.put('/theme-init.js', copy))
          }
          return res
        })
        .catch(() => caches.match('/theme-init.js').then((hit) => hit ?? Response.error())),
    )
    return
  }

  // Navigations: try the network so deploys land, fall back to the cached shell.
  // Only the app's own page is kept — the server marks it — so the offline
  // fallback is never the website.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((res) => {
          if (res.ok && res.headers.get('x-questly-shell') === 'app') {
            const copy = res.clone()
            caches.open(SHELL).then((c) => c.put('/index.html', copy))
          }
          return res
        })
        .catch(() => caches.match('/index.html').then((hit) => hit ?? Response.error())),
    )
  }
})
