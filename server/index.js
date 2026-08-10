import 'dotenv/config'
import express from 'express'
import cookieParser from 'cookie-parser'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { isConfigured, verifyPhoto, verifyVoice, MIN_CONFIDENCE } from './verify.js'
import { perceptualHash, hammingDistance, DUPLICATE_THRESHOLD } from './imagehash.js'
import {
  SESSION_COOKIE,
  clearCookieOptions,
  cookieOptions,
  createUser,
  endSession,
  requireAuth,
  startSession,
  validateCredentials,
  verifyUser,
} from './auth.js'
import {
  countVerifications,
  findUserByEmail,
  getState,
  listPhotoHashes,
  purgeExpiredSessions,
  putState,
  recordPhotoHash,
  recordVerification,
} from './db.js'

const app = express()
const IS_PRODUCTION = process.env.NODE_ENV === 'production'

// In production the host assigns PORT and this process serves everything. In
// development PORT often belongs to the Vite dev server — some launchers export
// it — and inheriting it would make the API fight Vite for the same port. So
// dev ignores PORT unless API_PORT names one explicitly.
const PORT = Number(process.env.API_PORT ?? (IS_PRODUCTION ? process.env.PORT : null) ?? 5175)

// Behind Railway's router, every request appears to come from the proxy. Without
// this, req.ip is the proxy for everyone and one person failing a login would
// rate-limit all of them.
if (IS_PRODUCTION) app.set('trust proxy', 1)

// Photos arrive base64-encoded in the JSON body, so this needs headroom above
// the state payloads. The client downscales before sending.
app.use(express.json({ limit: '12mb' }))
app.use(cookieParser())

purgeExpiredSessions()

// Very small in-memory throttle on auth attempts per IP, enough to blunt
// trivial brute-forcing in a local/dev deployment.
const attempts = new Map()
const WINDOW_MS = 60_000
const MAX_ATTEMPTS = 10

function throttleAuth(req, res, next) {
  const key = req.ip ?? 'unknown'
  const now = Date.now()
  const record = attempts.get(key)
  if (!record || now - record.start > WINDOW_MS) {
    attempts.set(key, { start: now, count: 1 })
    next()
    return
  }
  record.count += 1
  if (record.count > MAX_ATTEMPTS) {
    res.status(429).json({ error: 'Too many attempts. Try again in a minute.' })
    return
  }
  next()
}

/** When INVITE_CODE is set, signup requires it. Left unset locally so dev and
 * the existing test flow are unaffected. */
const INVITE_CODE = process.env.INVITE_CODE?.trim() || null

app.get('/api/health', (_req, res) => {
  res.json({ ok: true })
})

app.get('/api/auth/config', (_req, res) => {
  res.json({ inviteRequired: Boolean(INVITE_CODE) })
})

app.post('/api/auth/signup', throttleAuth, async (req, res) => {
  try {
    const { email, password, inviteCode } = req.body ?? {}

    if (INVITE_CODE) {
      const provided = typeof inviteCode === 'string' ? inviteCode.trim() : ''
      if (provided !== INVITE_CODE) {
        res.status(403).json({ error: 'That invite code is not right.', code: 'bad_invite' })
        return
      }
    }

    const problem = validateCredentials(email, password)
    if (problem) {
      res.status(400).json({ error: problem })
      return
    }
    if (findUserByEmail(email)) {
      res.status(409).json({ error: 'An account with that email already exists.' })
      return
    }
    const user = await createUser(email, password)
    const { token } = startSession(user.id)
    res.cookie(SESSION_COOKIE, token, cookieOptions())
    res.status(201).json({ user })
  } catch (err) {
    console.error('signup failed', err)
    res.status(500).json({ error: 'Could not create the account.' })
  }
})

app.post('/api/auth/login', throttleAuth, async (req, res) => {
  try {
    const { email, password } = req.body ?? {}
    if (typeof email !== 'string' || typeof password !== 'string') {
      res.status(400).json({ error: 'Email and password are required.' })
      return
    }
    const user = await verifyUser(email, password)
    if (!user) {
      // Deliberately vague: don't reveal whether the email exists.
      res.status(401).json({ error: 'Incorrect email or password.' })
      return
    }
    const { token } = startSession(user.id)
    res.cookie(SESSION_COOKIE, token, cookieOptions())
    res.json({ user })
  } catch (err) {
    console.error('login failed', err)
    res.status(500).json({ error: 'Could not sign in.' })
  }
})

app.post('/api/auth/logout', (req, res) => {
  endSession(req.cookies?.[SESSION_COOKIE])
  res.clearCookie(SESSION_COOKIE, clearCookieOptions())
  res.status(204).end()
})

app.get('/api/me', requireAuth, (req, res) => {
  res.json({ user: req.user })
})

app.get('/api/state', requireAuth, (req, res) => {
  const row = getState(req.user.id)
  if (!row) {
    res.json({ state: null, version: 0 })
    return
  }
  try {
    res.json({ state: JSON.parse(row.data), version: row.version, updatedAt: row.updated_at })
  } catch {
    res.status(500).json({ error: 'Stored state is corrupt.' })
  }
})

app.put('/api/state', requireAuth, (req, res) => {
  const { state } = req.body ?? {}
  if (state === undefined || state === null || typeof state !== 'object') {
    res.status(400).json({ error: 'A state object is required.' })
    return
  }
  try {
    const serialized = JSON.stringify(state)
    const { version, updatedAt } = putState(req.user.id, serialized)
    res.json({ version, updatedAt })
  } catch (err) {
    console.error('state save failed', err)
    res.status(500).json({ error: 'Could not save state.' })
  }
})

const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif'])
const MAX_IMAGE_BYTES = 6 * 1024 * 1024

// Photos must be recent. Only enforced when the file actually carried a capture
// time — screenshots and anything routed through a messaging app have none.
const MAX_PHOTO_AGE_MS = 24 * 60 * 60 * 1000
const CLOCK_SKEW_MS = 60 * 60 * 1000

// Every verification is a paid vision call on the operator's API key, so each
// account gets a daily allowance. 0 disables verification outright.
const VERIFY_DAILY_LIMIT = Number.isFinite(Number(process.env.VERIFY_DAILY_LIMIT))
  ? Number(process.env.VERIFY_DAILY_LIMIT)
  : 10

function utcDay() {
  return new Date().toISOString().slice(0, 10)
}

app.get('/api/verify/status', requireAuth, (req, res) => {
  const used = countVerifications(req.user.id, utcDay())
  res.json({
    configured: isConfigured(),
    limit: VERIFY_DAILY_LIMIT,
    remaining: Math.max(0, VERIFY_DAILY_LIMIT - used),
  })
})

app.post('/api/verify', requireAuth, async (req, res) => {
  const { kind, taskTitle, imageBase64, mediaType, transcript, capturedAt } = req.body ?? {}

  if (typeof taskTitle !== 'string' || !taskTitle.trim()) {
    res.status(400).json({ error: 'A task title is required.' })
    return
  }

  // A spoken claim has nothing that can be checked without the model, so voice
  // needs the API key. Photos still get duplicate and freshness checks locally,
  // so they keep working on a server with no key at all.
  if (kind === 'voice' && !isConfigured()) {
    res.status(503).json({ error: 'Voice confirmation is not set up on this server.', code: 'not_configured' })
    return
  }

  const day = utcDay()
  if (countVerifications(req.user.id, day) >= VERIFY_DAILY_LIMIT) {
    res.status(429).json({
      error: `You've used all ${VERIFY_DAILY_LIMIT} proof checks for today. They reset tomorrow.`,
      code: 'daily_limit',
    })
    return
  }

  try {
    let verdict
    if (kind === 'photo') {
      if (typeof imageBase64 !== 'string' || !imageBase64) {
        res.status(400).json({ error: 'A photo is required.' })
        return
      }
      if (!ALLOWED_IMAGE_TYPES.has(mediaType)) {
        res.status(400).json({ error: 'Unsupported image type. Use JPEG, PNG, WebP or GIF.' })
        return
      }
      // base64 inflates by ~4/3; check the decoded size.
      if ((imageBase64.length * 3) / 4 > MAX_IMAGE_BYTES) {
        res.status(413).json({ error: 'That image is too large. Try a smaller photo.' })
        return
      }
      const bytes = Buffer.from(imageBase64, 'base64')

      // Cheap local checks first — no reason to pay for a vision call on a photo
      // that is already disqualified.
      let hash = null
      try {
        hash = perceptualHash(bytes)
      } catch {
        res.status(400).json({ error: 'That image could not be read. Try a normal JPEG photo.' })
        return
      }

      const seen = listPhotoHashes(req.user.id)
      if (seen.some((prior) => hammingDistance(hash, prior) <= DUPLICATE_THRESHOLD)) {
        res.status(409).json({
          error: 'You have already used this photo as proof. Take a new one.',
          code: 'duplicate_photo',
        })
        return
      }

      if (typeof capturedAt === 'number' && Number.isFinite(capturedAt)) {
        const age = Date.now() - capturedAt
        if (age > MAX_PHOTO_AGE_MS) {
          res.status(422).json({
            error: 'That photo was taken too long ago. Snap a fresh one for this task.',
            code: 'stale_photo',
          })
          return
        }
        // A capture time in the future means a wrong device clock or tampering.
        if (age < -CLOCK_SKEW_MS) {
          res.status(422).json({
            error: 'That photo has an invalid capture time. Check your device clock.',
            code: 'stale_photo',
          })
          return
        }
      }

      if (!isConfigured()) {
        // No model available, so the photo cannot be judged on content. It has
        // already passed the checks that do not need one — it decodes, it is not
        // a photo this account has used before, and it was taken recently. That
        // is a real bar, so accept rather than blocking progress entirely.
        recordPhotoHash(req.user.id, hash)
        res.json({
          verified: true,
          confidence: 1,
          reason: 'Photo accepted. This server does not check what is in the picture.',
          unchecked: true,
        })
        return
      }

      // Charged before the call, not after: a failed request may still bill, and
      // a retry loop on errors must not be free.
      recordVerification(req.user.id, day)
      verdict = await verifyPhoto({ taskTitle: taskTitle.trim(), mediaType, imageBase64 })

      if (verdict.verified && !verdict.firstPerson) {
        verdict = {
          ...verdict,
          verified: false,
          reason: verdict.concern
            ? `This does not look like your own photo (${verdict.concern}). Take one yourself.`
            : 'This does not look like a photo you took yourself. Take one yourself.',
        }
      }

      if (verdict.verified && verdict.confidence < MIN_CONFIDENCE) {
        verdict = {
          ...verdict,
          verified: false,
          reason: 'Not clear enough to accept. Try a sharper photo that shows the task.',
        }
      }

      // Only bank the hash once it counts, so a rejected photo can be retaken
      // and resubmitted without being flagged as a duplicate of itself.
      if (verdict.verified) recordPhotoHash(req.user.id, hash)
    } else if (kind === 'voice') {
      if (typeof transcript !== 'string' || transcript.trim().length < 2) {
        res.status(400).json({ error: 'Nothing was heard — try again.' })
        return
      }
      recordVerification(req.user.id, day)
      verdict = await verifyVoice({ taskTitle: taskTitle.trim(), transcript: transcript.trim().slice(0, 2000) })
    } else {
      res.status(400).json({ error: 'kind must be "photo" or "voice".' })
      return
    }

    res.json(verdict)
  } catch (err) {
    if (err?.code === 'not_configured') {
      res.status(503).json({ error: 'Verification is not set up on this server yet.', code: 'not_configured' })
      return
    }
    if (err?.code === 'refused') {
      res.status(422).json({ error: err.message })
      return
    }
    console.error('verification failed', err)
    res.status(502).json({ error: 'Could not reach the verification service. Try again.' })
  }
})

// Unmatched API routes must answer in JSON — the client parses every response
// body as JSON, and Express's default HTML error page would blow up there.
app.use('/api', (_req, res) => {
  res.status(404).json({ error: 'Not found.' })
})

// In dev, Vite serves the app and proxies /api here. In production there is no
// Vite, so this process serves the built frontend too.
const here = dirname(fileURLToPath(import.meta.url))
const distDir = join(here, '..', 'dist')
const hasBuild = existsSync(join(distDir, 'index.html'))

if (hasBuild) {
  app.use(
    express.static(distDir, {
      index: false,
      setHeaders(res, filePath) {
        // Vite fingerprints everything in /assets, so those can be cached hard.
        // Models keep their names across builds, so they get a modest TTL.
        const isFingerprinted = filePath.replace(/\\/g, '/').includes('/assets/')
        res.setHeader(
          'Cache-Control',
          isFingerprinted ? 'public, max-age=31536000, immutable' : 'public, max-age=3600',
        )
      },
    }),
  )

  // SPA fallback. Anything that is not an API route and not a real file returns
  // index.html so client-side navigation survives a refresh. Checked explicitly
  // rather than with a wildcard route so unknown /api paths still 404 as JSON.
  app.use((req, res, next) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return next()
    if (req.path.startsWith('/api/')) return next()
    res.setHeader('Cache-Control', 'no-cache')
    res.sendFile(join(distDir, 'index.html'))
  })
}

app.listen(PORT, () => {
  const mode = IS_PRODUCTION ? 'production' : 'development'
  console.log(`Questly listening on http://localhost:${PORT} (${mode})`)
  if (hasBuild) console.log('Serving built frontend from dist/')
  if (INVITE_CODE) console.log('Signup requires an invite code')
})
