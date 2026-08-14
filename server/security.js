import { audit } from './db.js'

/**
 * Response headers and request throttling.
 *
 * Written by hand rather than pulling in helmet and express-rate-limit: the
 * policy is a dozen headers and one counter, and every dependency added to an
 * auth-bearing server is a supply-chain risk taken on for the life of the app.
 */

/**
 * Content Security Policy.
 *
 * 'unsafe-inline' on styles is load-bearing: the app is Tailwind plus framer
 * motion, which both write inline style attributes, and there is no nonce to
 * hand them. Scripts get no such exemption, which is the half that actually
 * blocks injected code.
 *
 * blob: and data: on img/worker cover the 3D model previews and the canvas the
 * photo verifier draws into before upload.
 */
function contentSecurityPolicy(isProduction) {
  const directives = [
    "default-src 'self'",
    // 'wasm-unsafe-eval' is required to compile WebAssembly at all, and the
    // avatars are Draco-compressed so their decoder is WASM. Despite the name
    // it does not permit eval() or any JavaScript from a string — it is scoped
    // to WebAssembly compilation, which is why it is preferred over the blanket
    // 'unsafe-eval' that would also unlock eval and new Function.
    "script-src 'self' 'wasm-unsafe-eval'",
    // The typeface comes from Google Fonts, which needs its stylesheet host
    // here and its file host under font-src. Self-hosting them would drop both
    // exceptions and make the installed app genuinely offline — worth doing,
    // and the same argument that moved the Draco decoder in-house.
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "img-src 'self' data: blob:",
    "media-src 'self' data: blob:",
    "font-src 'self' data: https://fonts.gstatic.com",
    // blob: is load-bearing: GLTFLoader pulls each texture out of the model
    // file into a blob URL and then *fetches* it, which is governed by
    // connect-src rather than img-src. Without it the meshes decode but render
    // untextured, which looks like a broken avatar rather than a blocked
    // request. A blob URL can only be minted by this page, so allowing it does
    // not widen where data can be sent.
    isProduction
      ? "connect-src 'self' blob:"
      : "connect-src 'self' blob: ws: wss:",
    "worker-src 'self' blob:",
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(isProduction ? ['upgrade-insecure-requests'] : []),
  ]
  return directives.join('; ')
}

export function securityHeaders(isProduction) {
  const csp = contentSecurityPolicy(isProduction)
  return (_req, res, next) => {
    res.setHeader('Content-Security-Policy', csp)
    res.setHeader('X-Content-Type-Options', 'nosniff')
    res.setHeader('X-Frame-Options', 'DENY')
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin')
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin')
    res.setHeader('Cross-Origin-Resource-Policy', 'same-origin')
    res.setHeader(
      'Permissions-Policy',
      // The app asks for camera and microphone at the point of use; everything
      // else is denied outright so a compromised script cannot reach for it.
      'accelerometer=(), autoplay=(), camera=(self), display-capture=(), encrypted-media=(), geolocation=(), gyroscope=(), interest-cohort=(), magnetometer=(), microphone=(self), payment=(), usb=()',
    )
    // Only meaningful over TLS, and only safe to send once HTTPS is certain.
    if (isProduction) {
      res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains')
    }
    res.removeHeader('X-Powered-By')
    next()
  }
}

/**
 * Fixed-window counter held in memory.
 *
 * Good enough for a single-instance deployment, which is what this runs on. It
 * would need to move to shared storage before running more than one process,
 * since each would otherwise keep its own allowance — noted rather than
 * pre-solved.
 */
const buckets = new Map()

// Stops the map growing without bound on a long-lived process.
setInterval(() => {
  const now = Date.now()
  for (const [key, record] of buckets) {
    if (now - record.start > record.windowMs * 2) buckets.delete(key)
  }
}, 60_000).unref?.()

/**
 * @param name    bucket name, so separate limits do not share a counter
 * @param max     requests allowed per window
 * @param windowMs
 * @param by      'ip' | 'user' — user-keyed limits survive an IP change
 */
export function rateLimit({ name, max, windowMs, by = 'ip' }) {
  return (req, res, next) => {
    const identity = by === 'user' ? req.user?.id ?? req.ip : req.ip
    const key = `${name}:${identity ?? 'unknown'}`
    const now = Date.now()
    const record = buckets.get(key)

    if (!record || now - record.start > windowMs) {
      buckets.set(key, { start: now, count: 1, windowMs })
      next()
      return
    }

    record.count += 1
    if (record.count > max) {
      const retryAfter = Math.ceil((record.start + windowMs - now) / 1000)
      res.setHeader('Retry-After', String(Math.max(1, retryAfter)))
      // Logged once per window rather than per request, so a hammering client
      // cannot flood the audit table it is tripping.
      if (record.count === max + 1) {
        audit({
          userId: req.user?.id ?? null,
          email: req.user?.email ?? null,
          event: 'ratelimit.tripped',
          outcome: 'blocked',
          ip: req.ip,
          detail: `${name} ${req.method} ${req.originalUrl}`,
        })
      }
      res.status(429).json({
        error: 'Too many requests. Slow down and try again shortly.',
        code: 'rate_limited',
        retryAfter: Math.max(1, retryAfter),
      })
      return
    }
    next()
  }
}

/**
 * Rejects cross-site state-changing requests.
 *
 * The session cookie is SameSite=Lax, which already blocks cross-site POSTs from
 * a form or link. This is the belt to that braces: an Origin header from
 * somewhere else on a mutating request is refused outright. Requests with no
 * Origin at all are allowed through, since same-origin navigations and
 * non-browser clients legitimately omit it.
 *
 * Production compares the full host. Development compares hostname only,
 * because Vite serves the app on one port and proxies /api to another with
 * `changeOrigin`, so the browser's Origin and the Host this process sees
 * legitimately differ by port. Relaxing that in production would let anything
 * else listening on the same machine through, which is why it is not.
 */
export function sameOriginOnly(isProduction) {
  return (req, res, next) => {
    if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') {
      next()
      return
    }

    const origin = req.get('origin')
    if (!origin) {
      next()
      return
    }

    const host = req.get('host') ?? ''
    let originUrl
    try {
      originUrl = new URL(origin)
    } catch {
      res.status(403).json({ error: 'Bad origin.' })
      return
    }

    const matches = isProduction
      ? originUrl.host === host
      : originUrl.hostname === host.split(':')[0]

    if (!matches) {
      audit({
        event: 'csrf.blocked',
        outcome: 'blocked',
        ip: req.ip,
        detail: `origin ${originUrl.host} != host ${host}`,
      })
      res.status(403).json({ error: 'Cross-origin requests are not allowed.' })
      return
    }
    next()
  }
}
