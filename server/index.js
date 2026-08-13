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
import { analyseOutlook, isConfigured as outlookConfigured } from './outlook.js'
import {
  ADMIN_MIN_PASSWORD,
  SESSION_COOKIE,
  checkSecondFactor,
  clearCookieOptions,
  completeAdminSetup,
  cookieOptions,
  createPendingAdmin,
  createUser,
  enrolMfa,
  hashSetupToken,
  makeSetupToken,
  mfaRequiredFor,
  resetWithCode,
  endSession,
  requireAdmin,
  requireAuth,
  requireSuperadmin,
  startSession,
  validateCredentials,
  verifyUser,
} from './auth.js'
import { generateSecret, otpauthUrl } from './totp.js'
import { rateLimit, sameOriginOnly, securityHeaders } from './security.js'
import { REFUSAL_MESSAGE, screenInput, screenOutputDeep } from './moderation.js'
import { checkStateWrite } from './statecheck.js'
import { validateDocuments } from './documents.js'
import {
  audit,
  countByRole,
  countPhotoProofs,
  countVerifications,
  consumeSetupToken,
  deleteUser,
  findSetupToken,
  findUserByEmail,
  findUserById,
  getState,
  insertSetupToken,
  listAudit,
  listPhotoHashes,
  listUsers,
  purgeExpiredSessions,
  putState,
  recordPhotoHash,
  recordVerification,
  setMaxXp,
  setUserDisabled,
  setUserRole,
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

app.use(securityHeaders(IS_PRODUCTION))

// Photos arrive base64-encoded in the JSON body, so this needs headroom above
// the state payloads. The client downscales before sending.
app.use(express.json({ limit: '12mb' }))
app.use(cookieParser())
app.use(sameOriginOnly(IS_PRODUCTION))

purgeExpiredSessions()

/**
 * Limits, tightest first.
 *
 * The AI routes are the expensive ones — each is a paid call on the operator's
 * key — so they are capped per account rather than per IP, which a single user
 * behind a changing mobile address would otherwise slip through.
 */
const throttleAuth = rateLimit({ name: 'auth', max: 10, windowMs: 60_000, by: 'ip' })
const throttleSignup = rateLimit({ name: 'signup', max: 5, windowMs: 60 * 60_000, by: 'ip' })
const throttleAi = rateLimit({ name: 'ai', max: 20, windowMs: 60_000, by: 'user' })
const throttleAiDaily = rateLimit({ name: 'ai-daily', max: 200, windowMs: 24 * 60 * 60_000, by: 'user' })
const throttleState = rateLimit({ name: 'state', max: 120, windowMs: 60_000, by: 'user' })
const throttleAdmin = rateLimit({ name: 'admin', max: 60, windowMs: 60_000, by: 'user' })

/** Everything that spends money on the model sits behind both windows. */
const aiGuard = [requireAuth, throttleAi, throttleAiDaily]

/**
 * Screens user text before it reaches the model and logs anything blocked.
 * Returns true when the request has already been answered.
 */
function blockedByModeration(req, res, fields, { allowLength = 6000 } = {}) {
  for (const value of fields) {
    if (typeof value !== 'string' || !value) continue
    const verdict = screenInput(value, { allowLength })
    if (!verdict.ok) {
      audit({
        userId: req.user?.id ?? null,
        email: req.user?.email ?? null,
        event: `moderation.${verdict.category}`,
        outcome: 'blocked',
        ip: req.ip,
        detail: `${req.originalUrl} ${verdict.detail}`,
      })
      const status = verdict.category === 'too_long' ? 413 : 400
      res.status(status).json({ error: REFUSAL_MESSAGE, code: `blocked_${verdict.category}` })
      return true
    }
  }
  return false
}

/** Screens generated content before it is returned and stored. */
function blockedOutput(req, res, payload) {
  const verdict = screenOutputDeep(payload)
  if (verdict.ok) return false
  audit({
    userId: req.user?.id ?? null,
    email: req.user?.email ?? null,
    event: 'moderation.output',
    outcome: 'blocked',
    ip: req.ip,
    detail: `${req.originalUrl} ${verdict.detail}`,
  })
  res.status(502).json({ error: 'The generated content was blocked by the content filter. Try again.' })
  return true
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

app.post('/api/auth/signup', throttleSignup, throttleAuth, async (req, res) => {
  try {
    const { email, password, inviteCode } = req.body ?? {}

    if (INVITE_CODE) {
      const provided = typeof inviteCode === 'string' ? inviteCode.trim() : ''
      if (provided !== INVITE_CODE) {
        audit({ email, event: 'auth.signup', outcome: 'bad_invite', ip: req.ip })
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

    // No role is passed. Registration cannot mint anything but a plain user,
    // whatever else the request body happens to contain.
    const { user, recoveryCode } = await createUser(email, password)
    const { token } = startSession(user.id)
    res.cookie(SESSION_COOKIE, token, cookieOptions())
    audit({ userId: user.id, email: user.email, event: 'auth.signup', outcome: 'success', ip: req.ip })
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
      audit({ email, event: 'auth.login', outcome: 'bad_credentials', ip: req.ip })
      // Deliberately vague: don't reveal whether the email exists.
      res.status(401).json({ error: 'Incorrect email or password.' })
      return
    }
    if (user.disabled) {
      audit({ email, event: 'auth.login', outcome: 'disabled', ip: req.ip })
      res.status(403).json({ error: 'This account has been disabled.', code: 'disabled' })
      return
    }

    // A privileged account without a second factor cannot sign in at all —
    // otherwise a stolen admin password alone would reach every user's data.
    if (mfaRequiredFor(user.role) && !user.mfaEnabled) {
      audit({ userId: user.id, email, event: 'auth.login', outcome: 'mfa_not_enrolled', ip: req.ip })
      res.status(403).json({
        error: 'This account must finish two-factor setup before signing in. Use your setup link.',
        code: 'mfa_setup_required',
      })
      return
    }

    if (user.mfaEnabled) {
      const { mfaCode } = req.body ?? {}
      if (typeof mfaCode !== 'string' || !mfaCode.trim()) {
        // Not an error: the client shows the code field on seeing this.
        res.status(401).json({ error: 'Enter your authentication code.', code: 'mfa_required' })
        return
      }
      const row = findUserById(user.id)
      if (!checkSecondFactor(row, mfaCode)) {
        audit({ userId: user.id, email, event: 'auth.mfa', outcome: 'failed', ip: req.ip })
        res.status(401).json({ error: 'That code is not right.', code: 'mfa_invalid' })
        return
      }
    }

    const { token } = startSession(user.id)
    res.cookie(SESSION_COOKIE, token, cookieOptions())
    audit({ userId: user.id, email: user.email, event: 'auth.login', outcome: 'success', ip: req.ip })
    res.json({ user: { id: user.id, email: user.email, role: user.role } })
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

/**
 * Saves progress, after checking the client is not claiming more than it could
 * have earned.
 *
 * The whole document is authored in the browser, so this endpoint treats it as a
 * claim rather than a fact. `checkStateWrite` re-derives level from XP, bounds
 * the rate XP can arrive at, requires coins to have been minted and unlocks to
 * have been paid for and rank-earned, and caps proofs at the number of photo
 * verifications the server itself recorded.
 */
app.put('/api/state', requireAuth, throttleState, (req, res) => {
  const { state } = req.body ?? {}
  if (state === undefined || state === null || typeof state !== 'object' || Array.isArray(state)) {
    res.status(400).json({ error: 'A state object is required.' })
    return
  }

  try {
    const row = getState(req.user.id)
    let previous = null
    if (row) {
      try {
        previous = JSON.parse(row.data)
      } catch {
        // Corrupt stored state: treat as a first write rather than refusing to
        // let the user save ever again.
      }
    }

    const stored = findUserById(req.user.id)
    const elapsedMs = row?.updated_at ? Date.now() - new Date(row.updated_at).getTime() : Number.MAX_SAFE_INTEGER
    const verdict = checkStateWrite({
      previous,
      next: state,
      maxXpSeen: stored?.max_xp ?? 0,
      elapsedMs,
      verifiedProofs: countPhotoProofs(req.user.id),
      levelBaseline: stored?.level_baseline ?? 1,
      proofBaseline: stored?.proof_baseline ?? 0,
    })

    if (!verdict.ok) {
      audit({
        userId: req.user.id,
        email: req.user.email,
        event: `anticheat.${verdict.reason}`,
        outcome: 'blocked',
        ip: req.ip,
        detail: verdict.detail,
      })
      res.status(409).json({
        error: 'That save was rejected because the progress in it could not have been earned.',
        code: `rejected_${verdict.reason}`,
      })
      return
    }

    if (verdict.maxXp > (stored?.max_xp ?? 0)) setMaxXp(req.user.id, verdict.maxXp)

    const { version, updatedAt } = putState(req.user.id, JSON.stringify(state))
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
app.post('/api/goals/quests', ...aiGuard, async (req, res) => {
  const { title, detail, category } = req.body ?? {}
  if (typeof title !== 'string' || !title.trim()) {
    res.status(400).json({ error: 'A goal title is required.' })
    return
  }

  if (blockedByModeration(req, res, [title, detail], { allowLength: 600 })) return

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
    if (blockedOutput(req, res, pool)) return
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
app.post('/api/flashcards/subtopics', ...aiGuard, async (req, res) => {
  const { topic } = req.body ?? {}
  if (typeof topic !== 'string' || topic.trim().length < 2) {
    res.status(400).json({ error: 'Enter a topic to study.' })
    return
  }
  if (blockedByModeration(req, res, [topic], { allowLength: 300 })) return
  if (!cardsConfigured()) {
    res.status(503).json({ error: 'Flashcards are not set up on this server.', code: 'not_configured' })
    return
  }
  try {
    const subtopics = await suggestSubtopics(topic.trim().slice(0, 200))
    if (blockedOutput(req, res, subtopics)) return
    res.json({ subtopics })
  } catch (err) {
    console.error('subtopic generation failed', err)
    res.status(502).json({ error: 'Could not break that topic down.', detail: String(err?.message ?? err).slice(0, 300) })
  }
})

/** Step two: write cards for only the subtopics the user kept. */
app.post('/api/flashcards/cards', ...aiGuard, async (req, res) => {
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
  if (blockedByModeration(req, res, [topic, ...chosen], { allowLength: 300 })) return
  if (!cardsConfigured()) {
    res.status(503).json({ error: 'Flashcards are not set up on this server.', code: 'not_configured' })
    return
  }
  try {
    const cards = await writeCards(topic.trim().slice(0, 200), chosen)
    if (blockedOutput(req, res, cards)) return
    res.json({ cards })
  } catch (err) {
    console.error('card generation failed', err)
    res.status(502).json({ error: 'Could not write cards for that.', detail: String(err?.message ?? err).slice(0, 300) })
  }
})

/** Reads an explanation and returns questions aimed at its specific weak spots. */
app.post('/api/explain/questions', ...aiGuard, async (req, res) => {
  const { topic, explanation } = req.body ?? {}
  if (typeof topic !== 'string' || !topic.trim()) {
    res.status(400).json({ error: 'A topic is required.' })
    return
  }
  if (typeof explanation !== 'string' || explanation.trim().length < 40) {
    res.status(400).json({ error: 'Explain a bit more first — a couple of sentences at least.' })
    return
  }
  if (blockedByModeration(req, res, [topic, explanation])) return
  if (!coachConfigured()) {
    res.status(503).json({ error: 'The explain coach is not set up on this server.', code: 'not_configured' })
    return
  }
  try {
    const questions = await askQuestions(topic.trim().slice(0, 200), explanation.trim().slice(0, 6000))
    if (blockedOutput(req, res, questions)) return
    res.json({ questions })
  } catch (err) {
    console.error('question generation failed', err)
    res.status(502).json({ error: 'Could not think of questions.', detail: String(err?.message ?? err).slice(0, 300) })
  }
})

/** Marks the explanation and answers together, returning the report. */
app.post('/api/explain/report', ...aiGuard, async (req, res) => {
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
  if (blockedByModeration(req, res, [topic, explanation, ...cleaned.map((a) => a.answer)])) return
  if (!coachConfigured()) {
    res.status(503).json({ error: 'The explain coach is not set up on this server.', code: 'not_configured' })
    return
  }
  try {
    const report = await gradeExplanation(topic.trim().slice(0, 200), explanation.trim().slice(0, 6000), cleaned)
    if (blockedOutput(req, res, report)) return
    res.json({ report })
  } catch (err) {
    console.error('report generation failed', err)
    res.status(502).json({ error: 'Could not mark that.', detail: String(err?.message ?? err).slice(0, 300) })
  }
})

/** Step one of the AI planner: a few clarifying questions about the goal. */
app.post('/api/planner/questions', ...aiGuard, async (req, res) => {
  const { goal, detail } = req.body ?? {}
  if (typeof goal !== 'string' || !goal.trim()) {
    res.status(400).json({ error: 'A goal is required.' })
    return
  }
  if (blockedByModeration(req, res, [goal, detail], { allowLength: 600 })) return

  // Ahead of the configured check on purpose: untrusted input is rejected on
  // its own merits, not only when the service behind it happens to be up.
  const attached = validateDocuments(req.body?.documents)
  if (!attached.ok) {
    audit({
      userId: req.user?.id ?? null,
      email: req.user?.email ?? null,
      event: 'upload.rejected',
      outcome: 'blocked',
      ip: req.ip,
      detail: attached.error,
    })
    res.status(400).json({ error: attached.error, code: 'bad_attachment' })
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
      attached.documents,
    )
    if (blockedOutput(req, res, questions)) return
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
app.post('/api/planner/plan', ...aiGuard, async (req, res) => {
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
  if (blockedByModeration(req, res, [goal, detail, ...cleaned.map((a) => a.answer)], { allowLength: 600 })) return

  const attached = validateDocuments(req.body?.documents)
  if (!attached.ok) {
    audit({
      userId: req.user?.id ?? null,
      email: req.user?.email ?? null,
      event: 'upload.rejected',
      outcome: 'blocked',
      ip: req.ip,
      detail: attached.error,
    })
    res.status(400).json({ error: attached.error, code: 'bad_attachment' })
    return
  }

  if (!plannerConfigured()) {
    res.status(503).json({ error: 'The AI planner is not set up on this server.', code: 'not_configured' })
    return
  }

  try {
    const plan = await generatePlan(
      goal.trim().slice(0, 200),
      typeof detail === 'string' ? detail.trim().slice(0, 400) : '',
      cleaned,
      attached.documents,
    )
    if (blockedOutput(req, res, plan)) return
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

const num = (value) => (Number.isFinite(Number(value)) ? Math.max(0, Math.round(Number(value))) : 0)

/** Estimates whether the player is on track, from how they have actually used
 * the app. The counted stats are computed client-side and passed in; they only
 * feed a motivational readout, so there is nothing to gain by fiddling them. */
app.post('/api/progress/outlook', ...aiGuard, async (req, res) => {
  const { stats, goals } = req.body ?? {}
  if (!stats || typeof stats !== 'object') {
    res.status(400).json({ error: 'Progress stats are required.' })
    return
  }

  const cleanGoals = (Array.isArray(goals) ? goals : [])
    .map((g) => ({
      title: String(g?.title ?? '').trim().slice(0, 200),
      category: String(g?.category ?? '').trim().slice(0, 40),
      detail: String(g?.detail ?? '').trim().slice(0, 400),
      ageDays: num(g?.ageDays),
      questsCompleted: num(g?.questsCompleted),
      questsVerified: num(g?.questsVerified),
      focusMinutes: num(g?.focusMinutes),
    }))
    .filter((g) => g.title)
    .slice(0, 12)

  if (!cleanGoals.length) {
    res.status(400).json({ error: 'Set a goal before asking how it is going.' })
    return
  }

  const cleanStats = {
    accountAgeDays: Math.max(1, num(stats.accountAgeDays)),
    activeDays: num(stats.activeDays),
    activeDaysLast14: num(stats.activeDaysLast14),
    completionsLast7: num(stats.completionsLast7),
    completionsLast30: num(stats.completionsLast30),
    currentStreak: num(stats.currentStreak),
    longestStreak: num(stats.longestStreak),
    questsCompleted: num(stats.questsCompleted),
    questsVerified: num(stats.questsVerified),
    todosCompleted: num(stats.todosCompleted),
    todosOpen: num(stats.todosOpen),
    focusSessions: num(stats.focusSessions),
    totalFocusMs: num(stats.totalFocusMs),
    daysSinceLastActivity:
      stats.daysSinceLastActivity === null || stats.daysSinceLastActivity === undefined
        ? null
        : num(stats.daysSinceLastActivity),
  }

  // Guessing from three data points would produce a confident-looking number
  // with nothing behind it, so refuse instead — the client says what is missing.
  if (cleanStats.activeDays < 3 || cleanStats.questsCompleted + cleanStats.todosCompleted + cleanStats.focusSessions < 5) {
    res.status(422).json({ error: 'Not enough activity yet to judge this fairly.', code: 'insufficient_evidence' })
    return
  }

  if (!outlookConfigured()) {
    res.status(503).json({ error: 'Progress analysis is not set up on this server.', code: 'not_configured' })
    return
  }

  if (blockedByModeration(req, res, cleanGoals.flatMap((g) => [g.title, g.detail]), { allowLength: 600 })) return

  try {
    const outlook = await analyseOutlook(cleanStats, cleanGoals)
    if (blockedOutput(req, res, outlook)) return
    res.json({ outlook })
  } catch (err) {
    if (err?.code === 'not_configured') {
      res.status(503).json({ error: 'Progress analysis is not set up on this server.', code: 'not_configured' })
      return
    }
    console.error('outlook analysis failed', err)
    res.status(502).json({
      error: 'Could not analyse your progress.',
      detail: String(err?.message ?? err).slice(0, 300),
    })
  }
})

// ---------------------------------------------------------------------------
// Admin account setup
//
// A privileged account is created without a password by the CLI, which prints a
// one-time link. The holder opens it and chooses their own password and second
// factor here. No operator password is ever typed into a terminal, stored in an
// environment variable, or written to a deploy log.
// ---------------------------------------------------------------------------

const setupLimiter = rateLimit({ name: 'setup', max: 10, windowMs: 15 * 60_000, by: 'ip' })

app.get('/api/admin/setup/:token', setupLimiter, (req, res) => {
  const row = findSetupToken(hashSetupToken(String(req.params.token ?? '')))
  if (!row) {
    res.status(404).json({ error: 'That setup link is invalid or has expired.' })
    return
  }
  const user = findUserById(row.user_id)
  if (!user) {
    res.status(404).json({ error: 'That setup link is invalid or has expired.' })
    return
  }
  res.json({ email: user.email, role: user.role, minPassword: ADMIN_MIN_PASSWORD })
})

app.post('/api/admin/setup/:token', setupLimiter, async (req, res) => {
  try {
    const tokenHash = hashSetupToken(String(req.params.token ?? ''))
    const row = findSetupToken(tokenHash)
    if (!row) {
      res.status(404).json({ error: 'That setup link is invalid or has expired.' })
      return
    }
    const user = findUserById(row.user_id)
    if (!user) {
      res.status(404).json({ error: 'That setup link is invalid or has expired.' })
      return
    }

    const { password, mfaCode, secret } = req.body ?? {}
    const problem = validateCredentials(user.email, password, { minLength: ADMIN_MIN_PASSWORD })
    if (problem) {
      res.status(400).json({ error: problem })
      return
    }

    // The second factor is proven before the account becomes usable, so a
    // privileged account can never exist in a state where a password alone
    // would open it.
    if (typeof secret !== 'string' || !secret) {
      res.status(400).json({ error: 'Two-factor setup is required.' })
      return
    }
    if (!checkSecondFactor({ ...user, mfa_secret: secret, mfa_enabled: 1, mfa_backup: '[]' }, mfaCode)) {
      res.status(400).json({ error: 'That authentication code is not right. Check your authenticator app.' })
      return
    }

    const recoveryCode = await completeAdminSetup(user.id, password)
    const backupCodes = await enrolMfa(user.id, secret)
    consumeSetupToken(tokenHash)
    audit({ userId: user.id, email: user.email, event: 'admin.setup', outcome: 'success', ip: req.ip })

    // Shown once. Both are stored only as hashes.
    res.json({ ok: true, recoveryCode, backupCodes })
  } catch (err) {
    console.error('admin setup failed', err)
    res.status(500).json({ error: 'Could not complete setup.' })
  }
})

/** A fresh TOTP secret for the enrolment screen. Not yet attached to anything —
 * it only becomes the account's secret once a live code proves it was stored. */
app.get('/api/admin/setup/:token/secret', setupLimiter, (req, res) => {
  const row = findSetupToken(hashSetupToken(String(req.params.token ?? '')))
  if (!row) {
    res.status(404).json({ error: 'That setup link is invalid or has expired.' })
    return
  }
  const user = findUserById(row.user_id)
  const secret = generateSecret()
  res.json({ secret, otpauth: otpauthUrl({ secret, email: user.email }) })
})

// ---------------------------------------------------------------------------
// Admin console. Every route here is 404 to a non-admin, so an ordinary account
// cannot even map what exists.
// ---------------------------------------------------------------------------

app.get('/api/admin/users', requireAuth, requireAdmin, throttleAdmin, (req, res) => {
  res.json({ users: listUsers() })
})

app.get('/api/admin/audit', requireAuth, requireAdmin, throttleAdmin, (req, res) => {
  const event = typeof req.query.event === 'string' ? req.query.event : null
  const limit = Math.min(500, Math.max(1, Number(req.query.limit) || 100))
  res.json({ entries: listAudit({ limit, event }) })
})

app.post('/api/admin/users/:id/disabled', requireAuth, requireAdmin, throttleAdmin, (req, res) => {
  const target = findUserById(req.params.id)
  if (!target) {
    res.status(404).json({ error: 'No such account.' })
    return
  }
  // An admin cannot lock out the superadmin, and nobody can lock out themselves.
  if (target.role === 'superadmin' && req.user.role !== 'superadmin') {
    res.status(403).json({ error: 'Only the superadmin can do that.' })
    return
  }
  if (target.id === req.user.id) {
    res.status(400).json({ error: 'You cannot disable your own account.' })
    return
  }

  const disabled = Boolean(req.body?.disabled)
  setUserDisabled(target.id, disabled)
  audit({
    userId: req.user.id,
    email: req.user.email,
    event: 'admin.set_disabled',
    outcome: 'success',
    ip: req.ip,
    detail: `${target.email} -> ${disabled ? 'disabled' : 'enabled'}`,
  })
  res.json({ ok: true })
})

/** Only the superadmin can change roles, and the last superadmin cannot be
 * demoted — an instance with no route back into the console is unrecoverable. */
app.post('/api/admin/users/:id/role', requireAuth, requireSuperadmin, throttleAdmin, (req, res) => {
  const target = findUserById(req.params.id)
  if (!target) {
    res.status(404).json({ error: 'No such account.' })
    return
  }
  const role = String(req.body?.role ?? '')
  if (!['user', 'admin', 'superadmin'].includes(role)) {
    res.status(400).json({ error: 'Unknown role.' })
    return
  }
  if (target.role === 'superadmin' && role !== 'superadmin' && countByRole('superadmin') <= 1) {
    res.status(400).json({ error: 'This is the only superadmin. Promote another one first.' })
    return
  }
  // Promotion demands a second factor already in place, so raising a password-only
  // account to admin cannot bypass the MFA requirement.
  if (mfaRequiredFor(role) && !target.mfa_enabled) {
    res.status(400).json({ error: 'That account must enrol two-factor authentication before being promoted.' })
    return
  }

  setUserRole(target.id, role)
  audit({
    userId: req.user.id,
    email: req.user.email,
    event: 'admin.set_role',
    outcome: 'success',
    ip: req.ip,
    detail: `${target.email} -> ${role}`,
  })
  res.json({ ok: true })
})

// ---------------------------------------------------------------------------
// Account self-service: everything a user needs to see and remove their own data
// ---------------------------------------------------------------------------

/** Everything held about the signed-in account, for them to keep. */
app.get('/api/account/export', requireAuth, rateLimit({ name: 'export', max: 5, windowMs: 60 * 60_000, by: 'user' }), (req, res) => {
  const row = getState(req.user.id)
  let state = null
  if (row) {
    try {
      state = JSON.parse(row.data)
    } catch {
      state = null
    }
  }
  const stored = findUserById(req.user.id)
  audit({ userId: req.user.id, email: req.user.email, event: 'account.export', outcome: 'success', ip: req.ip })
  res.setHeader('Content-Disposition', 'attachment; filename="questly-export.json"')
  res.json({
    exportedAt: new Date().toISOString(),
    account: { email: stored.email, createdAt: stored.created_at, role: stored.role },
    state,
  })
})

/**
 * Deletes the account and everything belonging to it.
 *
 * Requires the current password: a session cookie alone should not be enough to
 * destroy someone's history if a device is left unlocked. The delete cascades to
 * state, sessions, verification counts and stored photo hashes.
 */
app.post('/api/account/delete', requireAuth, throttleAuth, async (req, res) => {
  const { password } = req.body ?? {}
  if (typeof password !== 'string') {
    res.status(400).json({ error: 'Your password is required to delete the account.' })
    return
  }
  const confirmed = await verifyUser(req.user.email, password)
  if (!confirmed || confirmed.id !== req.user.id) {
    audit({ userId: req.user.id, email: req.user.email, event: 'account.delete', outcome: 'bad_password', ip: req.ip })
    res.status(401).json({ error: 'That password is not right.' })
    return
  }
  // The last superadmin cannot delete themselves and leave nobody in charge.
  if (req.user.role === 'superadmin' && countByRole('superadmin') <= 1) {
    res.status(400).json({ error: 'This is the only superadmin account. Promote another one first.' })
    return
  }

  audit({ userId: req.user.id, email: req.user.email, event: 'account.delete', outcome: 'success', ip: req.ip })
  deleteUser(req.user.id)
  res.clearCookie(SESSION_COOKIE, clearCookieOptions())
  res.status(204).end()
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
