import 'dotenv/config'
import express from 'express'
import cookieParser from 'cookie-parser'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { isConfigured, verifyPhoto, verifyVoice, MIN_CONFIDENCE } from './verify.js'
import { perceptualHash, hammingDistance, DUPLICATE_THRESHOLD } from './imagehash.js'
import { generateQuestPool, isConfigured as questGenConfigured } from './questgen.js'
import { isConfigured as cardsConfigured, suggestSubtopics, writeCards } from './flashcards.js'
import { askQuestions, gradeExplanation, isConfigured as coachConfigured } from './explain.js'
import { askPlannerQuestions, generatePlan, isConfigured as plannerConfigured } from './planner.js'
import {
  SESSION_COOKIE,
  clearCookieOptions,
  cookieOptions,
  createUser,
  resetWithCode,
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
    const { user, recoveryCode } = await createUser(email, password)
    const { token } = startSession(user.id)
    res.cookie(SESSION_COOKIE, token, cookieOptions())
    // The only time this code is ever readable. It is stored hashed.
    res.status(201).json({ user, recoveryCode })
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

app.post('/api/auth/reset', throttleAuth, async (req, res) => {
  try {
    const { email, code, password } = req.body ?? {}
    if (typeof email !== 'string' || typeof code !== 'string') {
      res.status(400).json({ error: 'Email and recovery code are required.' })
      return
    }
    const problem = validateCredentials(email, password)
    if (problem) {
      res.status(400).json({ error: problem })
      return
    }
    const ok = await resetWithCode(email, code, password)
    if (!ok) {
      // Deliberately vague: this must not reveal which accounts exist.
      res.status(401).json({ error: 'That email and recovery code do not match.' })
      return
    }
    res.json({ ok: true })
  } catch (err) {
    console.error('password reset failed', err)
    res.status(500).json({ error: 'Could not reset the password.' })
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

/**
 * Writes a bespoke quest set for one goal. Called once when a goal is created,
 * so the cost is one request per goal for its entire life.
 */
app.post('/api/goals/quests', requireAuth, async (req, res) => {
  const { title, detail, category } = req.body ?? {}
  if (typeof title !== 'string' || !title.trim()) {
    res.status(400).json({ error: 'A goal title is required.' })
    return
  }

  if (!questGenConfigured()) {
    res.status(503).json({ error: 'Quest generation is not set up on this server.', code: 'not_configured' })
    return
  }

  try {
    const pool = await generateQuestPool({
      title: title.trim().slice(0, 200),
      detail: typeof detail === 'string' ? detail.trim().slice(0, 500) : '',
      category: typeof category === 'string' ? category : '',
    })
    res.json({ pool })
  } catch (err) {
    if (err?.code === 'not_configured') {
      res.status(503).json({ error: 'Quest generation is not set up on this server.', code: 'not_configured' })
      return
    }
    console.error('quest generation failed', err)
    res.status(502).json({
      error: 'Could not write quests for that goal.',
      // Surfaced so a failure can be diagnosed without shell access to the
      // container. This endpoint requires a session, so it is not public.
      detail: String(err?.message ?? err).slice(0, 300),
      status: err?.status ?? null,
    })
  }
})

/** Step one of deck building: break a topic into areas the user can choose from. */
app.post('/api/flashcards/subtopics', requireAuth, async (req, res) => {
  const { topic } = req.body ?? {}
  if (typeof topic !== 'string' || topic.trim().length < 2) {
    res.status(400).json({ error: 'Enter a topic to study.' })
    return
  }
  if (!cardsConfigured()) {
    res.status(503).json({ error: 'Flashcards are not set up on this server.', code: 'not_configured' })
    return
  }
  try {
    res.json({ subtopics: await suggestSubtopics(topic.trim().slice(0, 200)) })
  } catch (err) {
    console.error('subtopic generation failed', err)
    res.status(502).json({ error: 'Could not break that topic down.', detail: String(err?.message ?? err).slice(0, 300) })
  }
})

/** Step two: write cards for only the subtopics the user kept. */
app.post('/api/flashcards/cards', requireAuth, async (req, res) => {
  const { topic, subtopics } = req.body ?? {}
  if (typeof topic !== 'string' || !topic.trim()) {
    res.status(400).json({ error: 'A topic is required.' })
    return
  }
  const chosen = Array.isArray(subtopics)
    ? subtopics.map((s) => String(s ?? '').trim().slice(0, 120)).filter(Boolean).slice(0, 20)
    : []
  if (!chosen.length) {
    res.status(400).json({ error: 'Pick at least one subtopic.' })
    return
  }
  if (!cardsConfigured()) {
    res.status(503).json({ error: 'Flashcards are not set up on this server.', code: 'not_configured' })
    return
  }
  try {
    res.json({ cards: await writeCards(topic.trim().slice(0, 200), chosen) })
  } catch (err) {
    console.error('card generation failed', err)
    res.status(502).json({ error: 'Could not write cards for that.', detail: String(err?.message ?? err).slice(0, 300) })
  }
})

/** Reads an explanation and returns questions aimed at its specific weak spots. */
app.post('/api/explain/questions', requireAuth, async (req, res) => {
  const { topic, explanation } = req.body ?? {}
  if (typeof topic !== 'string' || !topic.trim()) {
    res.status(400).json({ error: 'A topic is required.' })
    return
  }
  if (typeof explanation !== 'string' || explanation.trim().length < 40) {
    res.status(400).json({ error: 'Explain a bit more first — a couple of sentences at least.' })
    return
  }
  if (!coachConfigured()) {
    res.status(503).json({ error: 'The explain coach is not set up on this server.', code: 'not_configured' })
    return
  }
  try {
    const questions = await askQuestions(topic.trim().slice(0, 200), explanation.trim().slice(0, 6000))
    res.json({ questions })
  } catch (err) {
    console.error('question generation failed', err)
    res.status(502).json({ error: 'Could not think of questions.', detail: String(err?.message ?? err).slice(0, 300) })
  }
})

/** Marks the explanation and answers together, returning the report. */
app.post('/api/explain/report', requireAuth, async (req, res) => {
  const { topic, explanation, answers } = req.body ?? {}
  if (typeof topic !== 'string' || typeof explanation !== 'string' || !Array.isArray(answers)) {
    res.status(400).json({ error: 'Topic, explanation and answers are required.' })
    return
  }
  const cleaned = answers
    .map((a) => ({
      question: String(a?.question ?? '').trim().slice(0, 400),
      answer: String(a?.answer ?? '').trim().slice(0, 3000),
    }))
    .filter((a) => a.question)
    .slice(0, 6)
  if (!cleaned.length) {
    res.status(400).json({ error: 'No questions to mark.' })
    return
  }
  if (!coachConfigured()) {
    res.status(503).json({ error: 'The explain coach is not set up on this server.', code: 'not_configured' })
    return
  }
  try {
    const report = await gradeExplanation(topic.trim().slice(0, 200), explanation.trim().slice(0, 6000), cleaned)
    res.json({ report })
  } catch (err) {
    console.error('report generation failed', err)
    res.status(502).json({ error: 'Could not mark that.', detail: String(err?.message ?? err).slice(0, 300) })
  }
})

/** Step one of the AI planner: a few clarifying questions about the goal. */
app.post('/api/planner/questions', requireAuth, async (req, res) => {
  const { goal, detail } = req.body ?? {}
  if (typeof goal !== 'string' || !goal.trim()) {
    res.status(400).json({ error: 'A goal is required.' })
    return
  }
  if (!plannerConfigured()) {
    res.status(503).json({ error: 'The AI planner is not set up on this server.', code: 'not_configured' })
    return
  }
  try {
    const questions = await askPlannerQuestions(
      goal.trim().slice(0, 200),
      typeof detail === 'string' ? detail.trim().slice(0, 400) : '',
    )
    res.json({ questions })
  } catch (err) {
    if (err?.code === 'not_configured') {
      res.status(503).json({ error: 'The AI planner is not set up on this server.', code: 'not_configured' })
      return
    }
    console.error('planner question generation failed', err)
    res.status(502).json({
      error: 'Could not think of questions for that goal.',
      detail: String(err?.message ?? err).slice(0, 300),
    })
  }
})

/** Step two: the actual daily/weekly/monthly plan plus a prep to-do list. */
app.post('/api/planner/plan', requireAuth, async (req, res) => {
  const { goal, detail, answers } = req.body ?? {}
  if (typeof goal !== 'string' || !goal.trim()) {
    res.status(400).json({ error: 'A goal is required.' })
    return
  }
  const cleaned = Array.isArray(answers)
    ? answers
        .map((a) => ({
          question: String(a?.question ?? '').trim().slice(0, 200),
          answer: String(a?.answer ?? '').trim().slice(0, 500),
        }))
        .filter((a) => a.question)
        .slice(0, 8)
    : []
  if (!plannerConfigured()) {
    res.status(503).json({ error: 'The AI planner is not set up on this server.', code: 'not_configured' })
    return
  }
  try {
    const plan = await generatePlan(
      goal.trim().slice(0, 200),
      typeof detail === 'string' ? detail.trim().slice(0, 400) : '',
      cleaned,
    )
    res.json({ plan })
  } catch (err) {
    if (err?.code === 'not_configured') {
      res.status(503).json({ error: 'The AI planner is not set up on this server.', code: 'not_configured' })
      return
    }
    console.error('plan generation failed', err)
    res.status(502).json({ error: 'Could not write a plan for that.', detail: String(err?.message ?? err).slice(0, 300) })
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
