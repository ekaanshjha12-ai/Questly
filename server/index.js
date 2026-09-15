import 'dotenv/config'
import express from 'express'
import cookieParser from 'cookie-parser'
import { createWriteStream, existsSync, mkdirSync, readdirSync, rmSync, statSync } from 'node:fs'
import { rm, writeFile } from 'node:fs/promises'
import { dirname, extname, join, normalize, sep } from 'node:path'
import { gzipSync } from 'node:zlib'
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
  normalizeSetupToken,
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
import { stripImageMetadata } from './imagemeta.js'
import { normalizeCard } from './card.js'
import { closeReport, fileReport, getReport, listReports, openReportCount, REPORT_STATUSES } from './reports.js'
import { clearLoginFailures, lockedMessage, loginRetryAfter, purgeLoginFailures, recordLoginFailure } from './loginguard.js'
import { rateLimit, sameOriginOnly, securityHeaders } from './security.js'
import { REFUSAL_MESSAGE, screenInput, screenOutputDeep } from './moderation.js'
import { levelFromXp } from './game/levels.js'
import { gameRoutes } from './routes/game.js'
import { clubRoutes } from './routes/clubs.js'
import { legalRoutes } from './routes/legal.js'
import { adminRoutes } from './routes/admin.js'
import { requestMetrics } from './adminmetrics.js'
import { acceptPolicies, pendingAcceptances } from './policies.js'
import { purgeExpiredRecords, RETENTION } from './retention.js'
import { clubPostRights, isClubLeader as clubLeaderOf, isClubMember, notifyAnnouncement } from './game/clubs.js'
import {
  appreciationFor,
  COMMENT_MAX,
  commentCount,
  countRecentAppreciations,
  countRecentComments,
  findPostWithRef,
  getComment,
  insertComment,
  listComments,
  setAppreciation,
  setPostRef,
  softDeleteComment,
} from './engagement.js'
import { ACHIEVEMENTS } from './game/achievements.js'
import { ensureGame, stripServerOwned } from './game/migrate.js'
import { rewardProof } from './game/quests.js'
import { getProgressRow, startRewards, transaction } from './game/rewards.js'
import { notify } from './game/notify.js'
import { track } from './game/analytics.js'
import { publicLook } from './game/inventory.js'
import { GameError } from './game/errors.js'
import { validateDocuments } from './documents.js'
import { meter } from './meter.js'
import { computeAdminStats, invalidateAdminStats } from './adminstats.js'
import { fallbackTour, writeTour, isConfigured as tourConfigured } from './tour.js'
import {
  ageOn,
  checkAvatar,
  checkBirthdate,
  checkImage,
  normalizeUsername,
  parseBirthdate,
  validateBio,
  validateDisplayName,
  validateUsername,
} from './profile.js'
import {
  DAY_MS,
  MAX_PENDING_SENT,
  MAX_RUNNING,
  TERMS_TEXT,
  ageBand,
  dayIndex,
  deriveStatus,
  progressFor,
  validateCheckinNote,
  validateMessage,
  validateTerms,
} from './challenges.js'
import { POST_IMAGE_MAX_BYTES, validatePost } from './social.js'
import { screenImage, screenVideoFrames, isConfigured as imageSafetyConfigured } from './imagesafety.js'
import { contactDetails, riskyAcrossAges } from './chatsafety.js'
import {
  VIDEO_MAX_BYTES,
  VIDEO_MAX_SECONDS,
  looksLikeVideo,
  oneAtATime,
  probe,
  sampleFrames,
  transcode,
  videoConfigured,
} from './media.js'
import { randomUUID } from 'node:crypto'
import {
  db,
  audit,
  countByRole,
  countPhotoProofs,
  countVerifications,
  consumeSetupToken,
  deleteUser,
  findSetupToken,
  findUserByEmail,
  findUserById,
  findUserByUsername,
  avatarVersion,
  getAvatar,
  putAvatar,
  setProfile,
  blockUser,
  cancelOpenBetween,
  challengeRecord,
  countPendingSent,
  countRunning,
  findOpenBetween,
  findUserRowByUsername,
  getChallenge,
  insertChallenge,
  insertChallengeMessage,
  insertCheckin,
  isBlockedEitherWay,
  listChallengeMessages,
  listChallengesFor,
  focusSessionsBetween,
  listCheckins,
  rankName,
  findPlayers,
  setChallengesOpen,
  transitionChallenge,
  countRecentPosts,
  getPost,
  getPostImage,
  insertPost,
  insertPostImage,
  listFeed,
  softDeletePost,
  birthdatesMessagedSince,
  setAdultMessages,
  MEDIA_DIR,
  countRecentVideos,
  deletePostVideo,
  getPostVideo,
  insertPostVideo,
  listOrphanVideos,
  countConversationsStartedSince,
  createConversation,
  findConversationBetween,
  getConversation,
  insertDirectMessage,
  listConversationsFor,
  listDirectMessages,
  markConversationRead,
  setConversationStatus,
  getState,
  insertSetupToken,

  listPhotoHashes,
  leaderboard,
  listUsers,
  purgeExpiredSessions,
  setLeaderboardVisibility,
  putState,
  recordPhotoHash,
  recordVerification,
  adminRemovePost,
  setSuspendedUntil,
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
// Counts API requests by route and outcome for the console's health panel — never who made them.
app.use(requestMetrics)

// Larger JSON answers — feeds, the world, the console — go out gzipped when the
// browser accepts it. Small ones are not worth the header.
app.use((req, res, next) => {
  if (!req.path.startsWith('/api/') || !/\bgzip\b/.test(String(req.headers['accept-encoding'] ?? ''))) return next()
  const json = res.json.bind(res)
  res.json = (body) => {
    const text = JSON.stringify(body)
    if (text === undefined || text.length < 8192 || res.headersSent) return json(body)
    const zipped = gzipSync(text, { level: 5 })
    res.setHeader('Content-Type', 'application/json; charset=utf-8')
    res.setHeader('Content-Encoding', 'gzip')
    res.setHeader('Vary', 'Accept-Encoding')
    res.setHeader('Content-Length', zipped.length)
    return res.end(zipped)
  }
  next()
})

// Most requests are a few hundred bytes of JSON. Only the routes that carry a
// photo, attached documents or the notebook document get room for megabytes,
// so nothing else can be made to parse a 12 MB body.
const jsonSmall = express.json({ limit: '256kb' })
const jsonLarge = express.json({ limit: '12mb' })
const LARGE_JSON_ROUTES = [
  /^\/api\/state$/,
  /^\/api\/verify$/,
  /^\/api\/posts$/,
  /^\/api\/me\/avatar$/,
  /^\/api\/planner\//,
  /^\/api\/explain\//,
  /^\/api\/flashcards\//,
]
app.use((req, res, next) => (LARGE_JSON_ROUTES.some((re) => re.test(req.path)) ? jsonLarge : jsonSmall)(req, res, next))
// A body that is too big or not JSON gets a JSON answer, not Express's HTML page.
app.use((err, req, res, next) => {
  if (!err || !req.path.startsWith('/api/')) return next(err)
  if (err.type === 'entity.too.large') {
    res.status(413).json({ error: 'That request is too large.' })
    return
  }
  if (err.type === 'entity.parse.failed') {
    res.status(400).json({ error: 'That request could not be read.' })
    return
  }
  next(err)
})
app.use(cookieParser())
app.use(sameOriginOnly(IS_PRODUCTION))

let lastRetentionSweep = null

function purgeOldRecords() {
  try {
    const removed = purgeExpiredRecords()
    lastRetentionSweep = { at: new Date().toISOString(), removed }
    if (Object.values(removed).some(Boolean)) console.log('retention sweep', removed)
  } catch (err) {
    console.error('retention sweep failed', err)
  }
}

purgeExpiredSessions()
purgeLoginFailures()
purgeOldRecords()
setInterval(() => {
  purgeExpiredSessions()
  purgeLoginFailures()
  purgeOldRecords()
}, 6 * 60 * 60_000).unref?.()

/** Answers a locked account's attempt; true when it has been answered. */
function refuseIfLocked(email, res) {
  const retryAfter = loginRetryAfter(email)
  if (!retryAfter) return false
  res.setHeader('Retry-After', String(retryAfter))
  res.status(429).json({ error: lockedMessage(retryAfter), code: 'login_locked', retryAfter })
  return true
}

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

/**
 * The account as the client sees it: identity plus profile.
 *
 * One shape for sign-up, sign-in and /api/me, so the app never has to guess
 * which fields a given response carries. `profileComplete` decides whether an
 * account made before profiles existed is asked to finish one.
 */
function publicUser(userId) {
  const row = findUserById(userId)
  if (!row) return null
  return {
    id: row.id,
    email: row.email,
    role: row.role ?? 'user',
    username: row.username ?? null,
    displayName: row.display_name ?? null,
    birthdate: row.birthdate ?? null,
    bio: row.bio ?? null,
    avatarVersion: avatarVersion(row.id),
    profileComplete: Boolean(row.username && row.birthdate),
    challengesOpen: Boolean(row.challenges_open),
    adultMessages: Boolean(row.adult_messages),
    // Terms or privacy versions this account has not accepted yet.
    policyUpdates: pendingAcceptances(row.id),
  }
}

/**
 * Validates the profile half of a sign-up or a profile completion.
 * @returns {{ ok: true, value: object } | { ok: false, status: number, error: string, code?: string }}
 */
function checkProfileInput({ name, username, birthdate, bio }, { selfId = null } = {}) {
  const nameProblem = validateDisplayName(name)
  if (nameProblem) return { ok: false, status: 400, error: nameProblem, code: 'bad_name' }

  const usernameProblem = validateUsername(username)
  if (usernameProblem) return { ok: false, status: 400, error: usernameProblem, code: 'bad_username' }
  const normalized = normalizeUsername(username)
  const holder = findUserByUsername(normalized)
  if (holder && holder.id !== selfId) {
    return { ok: false, status: 409, error: 'That username is taken.', code: 'username_taken' }
  }

  const born = checkBirthdate(birthdate)
  if (!born.ok) {
    return { ok: false, status: born.code === 'underage' ? 403 : 400, error: born.error, code: born.code }
  }

  const bioProblem = validateBio(bio)
  if (bioProblem) return { ok: false, status: 400, error: bioProblem, code: 'bad_bio' }

  return {
    ok: true,
    value: {
      displayName: String(name).trim(),
      username: normalized,
      birthdate: born.value,
      bio: String(bio ?? '').trim() || null,
    },
  }
}

/** A unique-index violation means someone claimed the username between the
 * check and the write. */
function isUsernameCollision(err) {
  return /UNIQUE constraint failed: users\.username/i.test(String(err?.message ?? ''))
}

const throttleUsername = rateLimit({ name: 'username', max: 40, windowMs: 60_000, by: 'ip' })

/**
 * Whether a username can be had, so the sign-up screen can answer as you type.
 *
 * It does reveal that a handle exists — that is what a username check is — but
 * a handle is chosen to be seen, and nothing else about the account comes back.
 */
app.get('/api/auth/username', throttleUsername, (req, res) => {
  const username = String(req.query.u ?? '')
  const problem = validateUsername(username)
  if (problem) {
    res.json({ available: false, error: problem })
    return
  }
  const taken = Boolean(findUserByUsername(normalizeUsername(username)))
  res.json({ available: !taken, error: taken ? 'That username is taken.' : null })
})

app.post('/api/auth/signup', throttleSignup, throttleAuth, async (req, res) => {
  try {
    const { email, password, inviteCode, acceptTerms } = req.body ?? {}

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
      res.status(409).json({ error: 'An account with that email already exists.', code: 'email_taken' })
      return
    }

    if (acceptTerms !== true) {
      res.status(400).json({ error: 'Agree to the Terms of Service to create an account.', code: 'terms_required' })
      return
    }

    // The whole profile is checked before anything is written, so a failure
    // never leaves an account behind with half a profile.
    const profile = checkProfileInput(req.body ?? {})
    if (!profile.ok) {
      if (profile.code === 'underage') {
        // Logged without the birthdate itself — the refusal is the only fact
        // worth keeping about someone who was not allowed to sign up.
        audit({ email, event: 'auth.signup', outcome: 'underage', ip: req.ip })
      }
      res.status(profile.status).json({ error: profile.error, code: profile.code })
      return
    }

    // No role is passed. Registration cannot mint anything but a plain user,
    // whatever else the request body happens to contain.
    const { user, recoveryCode } = await createUser(email, password)
    try {
      setProfile(user.id, profile.value)
    } catch (err) {
      // Lost a race for the username after the check above. Undo the account
      // rather than leave one without a profile.
      deleteUser(user.id)
      if (isUsernameCollision(err)) {
        res.status(409).json({ error: 'That username is taken.', code: 'username_taken' })
        return
      }
      throw err
    }
    // What they agreed to, and which version of it.
    acceptPolicies(user.id)
    const { token } = startSession(user.id)
    res.cookie(SESSION_COOKIE, token, cookieOptions())
    audit({ userId: user.id, email: user.email, event: 'auth.signup', outcome: 'success', ip: req.ip })
    try {
      ensureGame(user.id, req.get('x-timezone'))
    } catch (err) {
      // The game rows are created on first use anyway; a failure here must not
      // fail a sign-up that has already succeeded.
      console.error('game setup at signup failed', err)
    }
    track(user.id, 'signup')
    // The only time this code is ever readable. It is stored hashed.
    res.status(201).json({ user: publicUser(user.id), recoveryCode })
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
    // Checked before the password, so a locked account's guesses are not tried.
    if (refuseIfLocked(email, res)) {
      audit({ email, event: 'auth.login', outcome: 'locked', ip: req.ip })
      return
    }
    const user = await verifyUser(email, password)
    if (!user) {
      recordLoginFailure(email)
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
    if (user.suspendedUntil) {
      audit({ email, event: 'auth.login', outcome: 'suspended', ip: req.ip })
      res.status(403).json({
        error: `This account is suspended until ${new Date(user.suspendedUntil).toLocaleDateString()}.`,
        code: 'suspended',
      })
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
        recordLoginFailure(email)
        audit({ userId: user.id, email, event: 'auth.mfa', outcome: 'failed', ip: req.ip })
        res.status(401).json({ error: 'That code is not right.', code: 'mfa_invalid' })
        return
      }
    }

    clearLoginFailures(email)
    const { token } = startSession(user.id)
    res.cookie(SESSION_COOKIE, token, cookieOptions())
    audit({ userId: user.id, email: user.email, event: 'auth.login', outcome: 'success', ip: req.ip })
    res.json({ user: publicUser(user.id) })
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
    if (refuseIfLocked(email, res)) return
    const reset = await resetWithCode(email, code, password)
    if (!reset) {
      recordLoginFailure(email)
      audit({ email, event: 'auth.reset', outcome: 'bad_code', ip: req.ip })
      // Deliberately vague: this must not reveal which accounts exist.
      res.status(401).json({ error: 'That email and recovery code do not match.' })
      return
    }
    clearLoginFailures(email)
    audit({ email, event: 'auth.reset', outcome: 'success', ip: req.ip })
    // The old code is spent. This one is readable only now, like the first.
    res.json({ ok: true, recoveryCode: reset.recoveryCode })
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
  res.json({ user: { ...publicUser(req.user.id), mfaEnabled: req.user.mfaEnabled } })
})

/**
 * Completes or edits the signed-in account's profile.
 *
 * Accounts made before profiles existed come through here once to finish one.
 * The birthdate can be set once and never changed afterwards: an age check
 * that can be retaken with a different year is not a check.
 */
app.put('/api/me/profile', requireAuth, throttleState, (req, res) => {
  try {
    const row = findUserById(req.user.id)
    const body = req.body ?? {}

    if (row.birthdate && body.birthdate !== undefined && body.birthdate !== row.birthdate) {
      res.status(400).json({ error: 'Your date of birth cannot be changed.', code: 'birthdate_locked' })
      return
    }

    // Fields not sent keep their current value.
    const merged = {
      name: body.name ?? row.display_name,
      username: body.username ?? row.username,
      birthdate: row.birthdate ?? body.birthdate,
      bio: body.bio === undefined ? row.bio : body.bio,
    }

    const profile = checkProfileInput(merged, { selfId: row.id })
    if (!profile.ok) {
      if (profile.code === 'underage') {
        audit({ userId: row.id, email: row.email, event: 'profile.complete', outcome: 'underage', ip: req.ip })
      }
      res.status(profile.status).json({ error: profile.error, code: profile.code })
      return
    }

    try {
      setProfile(row.id, profile.value)
    } catch (err) {
      if (isUsernameCollision(err)) {
        res.status(409).json({ error: 'That username is taken.', code: 'username_taken' })
        return
      }
      throw err
    }
    res.json({ user: publicUser(row.id) })
  } catch (err) {
    console.error('profile update failed', err)
    res.status(500).json({ error: 'Could not save your profile.' })
  }
})

const throttleAvatar = rateLimit({ name: 'avatar', max: 12, windowMs: 10 * 60_000, by: 'user' })

app.put('/api/me/avatar', requireAuth, throttleAvatar, (req, res) => {
  const { imageBase64, mediaType } = req.body ?? {}
  const checked = checkAvatar(imageBase64, mediaType)
  if (!checked.ok) {
    res.status(400).json({ error: checked.error })
    return
  }
  const version = putAvatar(req.user.id, checked.mime, checked.bytes.toString('base64'))
  res.json({ avatarVersion: version })
})

/**
 * Your own picture, and only your own: there is no id in the path to change.
 * Served with the type it was checked as, never the one it was uploaded with.
 */
app.get('/api/me/avatar', requireAuth, (req, res) => {
  const row = getAvatar(req.user.id)
  if (!row) {
    res.status(404).end()
    return
  }
  res.setHeader('Content-Type', row.mime)
  // The URL carries the version, so a new picture is a new URL and this one can
  // be kept — but only by this browser, since it sits behind a session.
  res.setHeader('Cache-Control', 'private, max-age=31536000, immutable')
  res.send(Buffer.from(row.data, 'base64'))
})

app.get('/api/state', requireAuth, (req, res) => {
  try {
    ensureGame(req.user.id, req.get('x-timezone'))
  } catch (err) {
    console.error('game setup failed', err)
  }
  const row = getState(req.user.id)
  if (!row) {
    res.json({ state: null, version: 0 })
    return
  }
  try {
    res.json({ state: stripServerOwned(JSON.parse(row.data)), version: row.version, updatedAt: row.updated_at })
  } catch {
    res.status(500).json({ error: 'Stored state is corrupt.' })
  }
})

/**
 * Saves the player's notebook: goals, habits, moods, schedule, decks, reports,
 * outlook and card design.
 *
 * Progress is not part of it any more. XP, coins, level, streak, achievements,
 * unlocks, quests and focus sessions are kept by the server (see game/), so
 * any of those a save still carries — an older cached copy of the app — are
 * dropped before storing, and nothing in the document can move a reward.
 */
app.put('/api/state', requireAuth, throttleState, (req, res) => {
  const { state } = req.body ?? {}
  if (state === undefined || state === null || typeof state !== 'object' || Array.isArray(state)) {
    res.status(400).json({ error: 'A state object is required.' })
    return
  }

  try {
    ensureGame(req.user.id, req.get('x-timezone'))
    const notebook = stripServerOwned(state)
    for (const [key, cap] of [['goals', 200], ['schedule', 20000], ['decks', 500], ['reports', 200], ['habits', 500]]) {
      const value = notebook[key]
      if (value !== undefined && !Array.isArray(value)) {
        res.status(400).json({ error: `${key} must be a list.` })
        return
      }
      if (Array.isArray(value) && value.length > cap) {
        res.status(413).json({ error: `Too many ${key} to save.` })
        return
      }
    }

    if ('card' in notebook) notebook.card = normalizeCard(notebook.card, { forOwner: true })

    const { version, updatedAt } = putState(req.user.id, JSON.stringify(notebook))
    // A first goal or a designed card can unlock an achievement.
    const summary = transaction(() => startRewards(req.user.id).finish())
    res.json({ version, updatedAt, rewards: summary.achievements.length || summary.items.length ? summary : null })
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

/**
 * With a `questId`, accepted proof completes that quest on the server and pays
 * its bonus there. The verdict is the same either way.
 */
function withQuestReward(req, verdict) {
  const questId = typeof req.body?.questId === 'string' ? req.body.questId : null
  if (!verdict?.verified || !questId) return verdict
  try {
    ensureGame(req.user.id, req.get('x-timezone'))
    const kind = req.body?.kind === 'voice' ? 'voice' : 'photo'
    const result = rewardProof(req.user.id, questId, kind, verdict.reason)
    return { ...verdict, quest: result.quest, rewards: result.rewards }
  } catch (err) {
    if (err instanceof GameError) return { ...verdict, questError: err.message }
    console.error('proof reward failed', err)
    return { ...verdict, questError: 'The proof was accepted, but the quest could not be updated. Try again.' }
  }
}

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
      // The model sees the picture, not where or when it was taken. GIFs carry
      // no location data and pass as they are.
      const raw = Buffer.from(imageBase64, 'base64')
      const bytes = mediaType === 'image/gif' ? raw : stripImageMetadata(raw, mediaType)
      if (!bytes) {
        res.status(400).json({ error: 'That image could not be read. Try a normal JPEG photo.' })
        return
      }
      const cleanBase64 = bytes === raw ? imageBase64 : bytes.toString('base64')

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
        recordPhotoHash(req.user.id, hash, 'photo')
        res.json(
          withQuestReward(req, {
            verified: true,
            confidence: 1,
            reason: 'Photo accepted. This server does not check what is in the picture.',
            unchecked: true,
          }),
        )
        return
      }

      // Charged before the call, not after: a failed request may still bill, and
      // a retry loop on errors must not be free.
      recordVerification(req.user.id, day)
      verdict = await meter({ userId: req.user.id, endpoint: 'verify.photo' }, () =>
        verifyPhoto({ taskTitle: taskTitle.trim(), mediaType, imageBase64: cleanBase64 }),
      )

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
      if (verdict.verified) recordPhotoHash(req.user.id, hash, 'photo')
    } else if (kind === 'voice') {
      if (typeof transcript !== 'string' || transcript.trim().length < 2) {
        res.status(400).json({ error: 'Nothing was heard — try again.' })
        return
      }
      recordVerification(req.user.id, day)
      verdict = await meter({ userId: req.user.id, endpoint: 'verify.voice' }, () =>
        verifyVoice({ taskTitle: taskTitle.trim(), transcript: transcript.trim().slice(0, 2000) }),
      )
    } else {
      res.status(400).json({ error: 'kind must be "photo" or "voice".' })
      return
    }

    res.json(withQuestReward(req, verdict))
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
    const pool = await meter({ userId: req.user.id, endpoint: 'goals.quests' }, () => generateQuestPool({
      title: title.trim().slice(0, 200),
      detail: typeof detail === 'string' ? detail.trim().slice(0, 500) : '',
      category: typeof category === 'string' ? category : '',
    }))
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
    const subtopics = await meter({ userId: req.user.id, endpoint: 'flashcards.subtopics' }, () => suggestSubtopics(topic.trim().slice(0, 200)))
    if (blockedOutput(req, res, subtopics)) return
    res.json({ subtopics })
  } catch (err) {
    console.error('subtopic generation failed', err)
    res.status(502).json({ error: 'Could not break that topic down.' })
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
    const cards = await meter({ userId: req.user.id, endpoint: 'flashcards.cards' }, () => writeCards(topic.trim().slice(0, 200), chosen))
    if (blockedOutput(req, res, cards)) return
    res.json({ cards })
  } catch (err) {
    console.error('card generation failed', err)
    res.status(502).json({ error: 'Could not write cards for that.' })
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
    const questions = await meter({ userId: req.user.id, endpoint: 'explain.questions' }, () => askQuestions(topic.trim().slice(0, 200), explanation.trim().slice(0, 6000)))
    if (blockedOutput(req, res, questions)) return
    res.json({ questions })
  } catch (err) {
    console.error('question generation failed', err)
    res.status(502).json({ error: 'Could not think of questions.' })
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
    const report = await meter({ userId: req.user.id, endpoint: 'explain.report' }, () => gradeExplanation(topic.trim().slice(0, 200), explanation.trim().slice(0, 6000), cleaned))
    if (blockedOutput(req, res, report)) return
    res.json({ report })
  } catch (err) {
    console.error('report generation failed', err)
    res.status(502).json({ error: 'Could not mark that.' })
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
    const questions = await meter({ userId: req.user.id, endpoint: 'planner.questions' }, () =>
      askPlannerQuestions(
        goal.trim().slice(0, 200),
        typeof detail === 'string' ? detail.trim().slice(0, 400) : '',
        attached.documents,
      ),
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
    const plan = await meter({ userId: req.user.id, endpoint: 'planner.plan' }, () =>
      generatePlan(
        goal.trim().slice(0, 200),
        typeof detail === 'string' ? detail.trim().slice(0, 400) : '',
        cleaned,
        attached.documents,
      ),
    )
    if (blockedOutput(req, res, plan)) return
    res.json({ plan })
  } catch (err) {
    if (err?.code === 'not_configured') {
      res.status(503).json({ error: 'The AI planner is not set up on this server.', code: 'not_configured' })
      return
    }
    console.error('plan generation failed', err)
    res.status(502).json({ error: 'Could not write a plan for that.' })
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
    const outlook = await meter({ userId: req.user.id, endpoint: 'progress.outlook' }, () => analyseOutlook(cleanStats, cleanGoals))
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
    })
  }
})

/**
 * Suspends an account until a date, or lifts a suspension with `until: null`.
 *
 * Separate from disabling because it ends on its own — nothing has to remember
 * to switch it back, and an expired suspension simply stops applying.
 */
app.post('/api/admin/users/:id/suspend', requireAuth, requireAdmin, throttleAdmin, (req, res) => {
  const target = findUserById(req.params.id)
  if (!target) {
    res.status(404).json({ error: 'No such account.' })
    return
  }
  if (target.id === req.user.id) {
    res.status(400).json({ error: 'You cannot suspend your own account.' })
    return
  }
  if (target.role === 'superadmin' && req.user.role !== 'superadmin') {
    res.status(403).json({ error: 'Only the superadmin can do that.' })
    return
  }

  const days = Number(req.body?.days)
  const until = req.body?.until === null || !Number.isFinite(days) || days <= 0
    ? null
    : new Date(Date.now() + Math.min(365, days) * 86400000).toISOString()

  setSuspendedUntil(target.id, until)
  invalidateAdminStats()
  audit({
    userId: req.user.id, email: req.user.email, event: 'admin.suspend', outcome: 'success', ip: req.ip,
    detail: `${target.email} -> ${until ?? 'lifted'}`,
  })
  res.json({ ok: true, until })
})

/**
 * The moderation queue: open reports oldest first, with what was reported as
 * it looked when it was reported.
 */
app.get('/api/admin/reports', requireAuth, requireAdmin, throttleAdmin, (req, res) => {
  const status = REPORT_STATUSES.includes(req.query.status) ? req.query.status : 'open'
  const page = listReports({ status, before: typeof req.query.before === 'string' ? req.query.before : null })
  res.json({ ...page, open: openReportCount() })
})

/**
 * Closes a report: dismissed, or actioned by taking the post down and/or
 * suspending the account. The reporter hears that it was reviewed — not what
 * happened to the other person, which is theirs.
 */
app.post('/api/admin/reports/:id/resolve', requireAuth, requireAdmin, throttleAdmin, (req, res) => {
  const report = getReport(req.params.id)
  if (!report) {
    res.status(404).json({ error: 'No such report.' })
    return
  }
  if (report.status !== 'open') {
    res.status(409).json({ error: 'That report has already been handled.' })
    return
  }
  const outcome = req.body?.outcome === 'dismissed' ? 'dismissed' : req.body?.outcome === 'actioned' ? 'actioned' : null
  if (!outcome) {
    res.status(400).json({ error: 'Choose to dismiss the report or act on it.' })
    return
  }
  const removePost = outcome === 'actioned' && req.body?.removePost === true
  const removeComment = outcome === 'actioned' && req.body?.removeComment === true
  const days = outcome === 'actioned' ? Number(req.body?.suspendDays) : 0
  const suspend = Number.isFinite(days) && days > 0
  const note = typeof req.body?.note === 'string' ? req.body.note.trim().slice(0, 500) : ''
  if (outcome === 'actioned' && !removePost && !removeComment && !suspend) {
    res.status(400).json({ error: 'Pick an action: take the content down, suspend the account, or both.' })
    return
  }
  if (removeComment && report.kind !== 'comment') {
    res.status(400).json({ error: 'Only a reported comment can be removed that way.' })
    return
  }
  if (removePost && report.kind !== 'post') {
    res.status(400).json({ error: 'Only a reported post can be taken down.' })
    return
  }
  const target = report.target ? findUserById(report.target.id) : null
  if (suspend) {
    if (!target) {
      res.status(400).json({ error: 'That account no longer exists.' })
      return
    }
    if (target.id === req.user.id) {
      res.status(400).json({ error: 'You cannot suspend your own account.' })
      return
    }
    if (target.role === 'superadmin' || (target.role === 'admin' && req.user.role !== 'superadmin')) {
      res.status(403).json({ error: 'Only the superadmin can suspend another admin.' })
      return
    }
  }

  const actions = []
  if (removePost && adminRemovePost(report.targetId)) actions.push('post_removed')
  if (removeComment && softDeleteComment(report.targetId)) actions.push('comment_removed')
  if (suspend) {
    const until = new Date(Date.now() + Math.min(365, days) * 86_400_000).toISOString()
    setSuspendedUntil(target.id, until)
    invalidateAdminStats()
    actions.push(`suspended_${Math.min(365, Math.round(days))}d`)
  }
  if (!closeReport(report.id, { status: outcome, action: actions.join(',') || null, note, adminId: req.user.id })) {
    res.status(409).json({ error: 'That report has already been handled.' })
    return
  }
  audit({
    userId: req.user.id, email: req.user.email, event: 'admin.report', outcome, ip: req.ip,
    detail: `report ${report.id} (${report.kind} ${report.targetId})${actions.length ? ` -> ${actions.join(', ')}` : ''}`,
  })
  if (report.reporter) {
    try {
      notify(report.reporter.id, {
        kind: 'system',
        title: 'Your report was reviewed',
        body: outcome === 'actioned'
          ? 'Thank you. A moderator looked at what you reported and took action.'
          : 'Thank you. A moderator looked at what you reported and did not find a rule broken this time.',
      })
    } catch (err) {
      console.error('report notification failed', err)
    }
  }
  res.json({ report: getReport(report.id), open: openReportCount() })
})

/**
 * Adjusts a player's XP, as a ledger entry like any other reward — so it is on
 * the record, shows in the player's history, and moves level and coins the
 * same way earned XP does.
 */
app.post('/api/admin/users/:id/xp', requireAuth, requireAdmin, throttleAdmin, (req, res) => {
  const target = findUserById(req.params.id)
  if (!target) {
    res.status(404).json({ error: 'No such account.' })
    return
  }
  const delta = Math.round(Number(req.body?.delta))
  if (!Number.isFinite(delta) || delta === 0 || Math.abs(delta) > 1_000_000) {
    res.status(400).json({ error: 'Give an XP amount between -1,000,000 and 1,000,000.' })
    return
  }

  ensureGame(target.id)
  const before = getProgressRow(target.id)?.xp ?? 0
  const summary = transaction(() => {
    const rewards = startRewards(target.id, { quiet: true })
    rewards.pay({ source: 'admin', sourceId: randomUUID(), xp: delta, coins: Math.round(delta / 3), label: 'Adjusted by the Questly team' })
    return rewards.finish()
  })
  invalidateAdminStats()

  audit({
    userId: req.user.id, email: req.user.email, event: 'admin.grant_xp', outcome: 'success', ip: req.ip,
    detail: `${target.email} ${delta > 0 ? '+' : ''}${delta} XP (${before} -> ${summary.progress.xp})`,
  })
  res.json({ ok: true, xp: summary.progress.xp, coins: summary.progress.coins })
})

/**
 * Issues a one-time link for a user to set a new password themselves.
 *
 * An admin never sets someone else's password — knowing it would let them sign
 * in as that person, and every action after that would be indistinguishable
 * from the real user's.
 */
app.post('/api/admin/users/:id/reset-link', requireAuth, requireAdmin, throttleAdmin, (req, res) => {
  const target = findUserById(req.params.id)
  if (!target) {
    res.status(404).json({ error: 'No such account.' })
    return
  }
  if (target.role === 'superadmin' && req.user.role !== 'superadmin') {
    res.status(403).json({ error: 'Only the superadmin can do that.' })
    return
  }

  const token = makeSetupToken()
  insertSetupToken({
    tokenHash: hashSetupToken(token),
    userId: target.id,
    expiresAt: new Date(Date.now() + 30 * 60_000).toISOString(),
  })
  audit({
    userId: req.user.id, email: req.user.email, event: 'admin.reset_link', outcome: 'success', ip: req.ip,
    detail: target.email,
  })
  // Returned once, to be handed over out of band. Anyone holding it can claim
  // the account until it is used or expires.
  res.json({ ok: true, path: `/admin-setup#${token}`, expiresInMinutes: 30 })
})

app.delete('/api/admin/users/:id', requireAuth, requireSuperadmin, throttleAdmin, (req, res) => {
  const target = findUserById(req.params.id)
  if (!target) {
    res.status(404).json({ error: 'No such account.' })
    return
  }
  if (target.id === req.user.id) {
    res.status(400).json({ error: 'Use the account screen to delete your own account.' })
    return
  }
  audit({
    userId: req.user.id, email: req.user.email, event: 'admin.delete_user', outcome: 'success', ip: req.ip,
    detail: target.email,
  })
  deleteUser(target.id)
  invalidateAdminStats()
  res.status(204).end()
})


// ---------------------------------------------------------------------------
// Players and challenges
//
// The part of the app where accounts meet. Social is open across every age
// group and every level. Every route re-checks, on every request, that the two
// people involved may still reach each other: both have finished a profile,
// neither has blocked the other, the other account is not disabled, and an
// under-18 has not turned off contact from adults. Nothing is trusted from an
// earlier screen.
// ---------------------------------------------------------------------------

const throttleChallengeWrite = rateLimit({ name: 'challenge-write', max: 20, windowMs: 60 * 60_000, by: 'user' })
// Two a second, all minute: more than anyone types, so it only ever stops a
// script flooding a chat.
const throttleChat = rateLimit({ name: 'challenge-chat', max: 120, windowMs: 60_000, by: 'user' })
const throttleSocialRead = rateLimit({ name: 'social-read', max: 120, windowMs: 60_000, by: 'user' })

/**
 * Whether two people may reach each other directly: message, challenge, open
 * each other's card. Any age, any level. What stops it: a missing or disabled
 * account, an unfinished profile, a block either way, and an under-18 who has
 * turned off contact from adults.
 *
 * @returns {string | null} why these two may not, or null if they may
 */
function contactBlocker(viewer, target) {
  if (!target || target.disabled) return 'That player is not available.'
  if (viewer.id === target.id) return 'That is you.'
  if (!viewer.username || !viewer.birthdate) return 'Finish your profile first.'
  if (!target.username || !target.birthdate) return 'That player is not available.'
  if (isBlockedEitherWay(viewer.id, target.id)) return 'That player is not available.'
  if (acrossAges(viewer, target)) {
    const young = ageBand(viewer.birthdate) === 'under18' ? viewer : target
    if (!young.adult_messages) {
      // Said plainly to the young person; to the adult it is the same answer
      // as a block.
      return young.id === viewer.id
        ? 'You have turned off contact with adults. You can turn it back on in Personalise.'
        : 'That player is not available.'
    }
  }
  return null
}

/** Whether one person may see another's posts, photos and videos. Only a
 * block either way, or a disabled account, hides them. */
function visibilityBlocker(viewer, target) {
  if (!target || target.disabled) return 'That player is not available.'
  if (viewer.id !== target.id && isBlockedEitherWay(viewer.id, target.id)) return 'That player is not available.'
  return null
}

function acrossAges(a, b) {
  return ageBand(a.birthdate) !== ageBand(b.birthdate)
}

function stateOf(userId) {
  try {
    const row = getState(userId)
    return row ? JSON.parse(row.data) : null
  } catch {
    return null
  }
}

/**
 * Name, rank, level and look as other players see them. The name is the one
 * held on the account, screened exactly as the leaderboard screens it; XP and
 * level are the server's own figures.
 */
function playerSummary(row) {
  let name = String(row.display_name ?? row.username ?? '').trim().slice(0, 40)
  if (!name || !screenInput(name, { allowLength: 40 }).ok) name = 'Adventurer'
  const xp = getProgressRow(row.id)?.xp ?? 0
  const level = levelFromXp(xp)
  return {
    username: row.username,
    name,
    xp,
    level,
    rank: rankName(level),
    avatarVersion: avatarVersion(row.id),
    look: publicLook(row.id),
  }
}

/** A card design as someone else may see it: rebuilt from known parts, with
 * no email or birthday and no text the content filter would not let through. */
function publicCard(state) {
  return normalizeCard(state?.card, { forOwner: false })
}

/**
 * Finding people. With a search, players whose username or name contains it;
 * without one, the most recently active — so there is someone to see before
 * you know who to look for. Only people you could actually interact with are
 * returned. You show up too when you search your own name, marked as you, so
 * searching for yourself does not look like search is broken.
 */
app.get('/api/users/search', requireAuth, throttleSocialRead, (req, res) => {
  const viewer = findUserById(req.user.id)
  const blocker = contactBlocker
  const q = String(req.query.q ?? '').trim().replace(/^@+/, '').toLowerCase().slice(0, 40)
  if (q && !/^[\p{L}\p{N}_. '-]+$/u.test(q)) {
    res.json({ results: [] })
    return
  }
  const max = q ? 20 : 30
  const results = []
  for (const row of findPlayers(q)) {
    if (row.id === viewer.id) {
      if (q) results.push({ ...playerSummary(row), you: true })
      continue
    }
    if (blocker(viewer, row)) continue
    results.push(playerSummary(row))
    if (results.length >= max) break
  }
  res.json({ results })
})

app.get('/api/users/:username', requireAuth, throttleSocialRead, (req, res) => {
  const viewer = findUserById(req.user.id)
  const target = findUserRowByUsername(String(req.params.username ?? '').toLowerCase())
  if (contactBlocker(viewer, target)) {
    // The same answer for "does not exist", "blocked" and "not taking contact
    // from adults", so this cannot be used to find out which one it is.
    res.status(404).json({ error: 'That player is not available.' })
    return
  }
  const state = stateOf(target.id)
  const now = new Date().toISOString()
  const bio = target.bio && screenInput(target.bio, { allowLength: 160 }).ok ? target.bio : null
  let canChallenge = true
  let challengeNote = null
  if (!target.challenges_open) {
    canChallenge = false
    challengeNote = 'Not taking challenges right now.'
  } else if (findOpenBetween(viewer.id, target.id, now)) {
    canChallenge = false
    challengeNote = 'You already have a challenge going with them.'
  }
  const birth = parseBirthdate(target.birthdate)
  res.json({
    player: {
      ...playerSummary(target),
      // Always on the card, and not something its owner can take off.
      age: birth ? ageOn(birth) : null,
      bio,
      joined: state?.player?.createdAt ?? target.created_at,
      card: publicCard(state),
      record: challengeRecord(target.id),
      canChallenge,
      challengeNote,
    },
  })
})

app.get('/api/users/:username/avatar', requireAuth, throttleSocialRead, (req, res) => {
  const viewer = findUserById(req.user.id)
  const target = findUserRowByUsername(String(req.params.username ?? '').toLowerCase())
  if (contactBlocker(viewer, target)) {
    res.status(404).end()
    return
  }
  const row = getAvatar(target.id)
  if (!row) {
    res.status(404).end()
    return
  }
  res.setHeader('Content-Type', row.mime)
  res.setHeader('Cache-Control', 'private, max-age=31536000, immutable')
  res.send(Buffer.from(row.data, 'base64'))
})

app.post('/api/users/:username/block', requireAuth, throttleChallengeWrite, (req, res) => {
  const target = findUserRowByUsername(String(req.params.username ?? '').toLowerCase())
  if (!target || target.id === req.user.id) {
    res.status(404).json({ error: 'That player is not available.' })
    return
  }
  blockUser(req.user.id, target.id)
  // A block also ends anything live between them, so it never leaves the two
  // sharing a chat.
  cancelOpenBetween(req.user.id, target.id)
  audit({ userId: req.user.id, email: req.user.email, event: 'social.block', outcome: 'success', ip: req.ip, detail: target.id })
  res.json({ ok: true })
})

app.post('/api/users/:username/report', requireAuth, throttleChallengeWrite, (req, res) => {
  const target = findUserRowByUsername(String(req.params.username ?? '').toLowerCase())
  if (!target || target.id === req.user.id) {
    res.status(404).json({ error: 'That player is not available.' })
    return
  }
  const reason = String(req.body?.reason ?? '').trim().slice(0, 300)
  const challengeId = typeof req.body?.challengeId === 'string' ? req.body.challengeId.slice(0, 60) : ''
  fileReport({
    reporterId: req.user.id,
    kind: 'player',
    targetId: target.id,
    targetUserId: target.id,
    reason,
    snapshot: { username: target.username, displayName: target.display_name, bio: target.bio, ...(challengeId ? { challengeId } : {}) },
  })
  audit({
    userId: req.user.id,
    email: req.user.email,
    event: 'social.report',
    outcome: 'filed',
    ip: req.ip,
    detail: `against ${target.id} (@${target.username})${challengeId ? ` in challenge ${challengeId}` : ''}: ${reason || 'no reason given'}`,
  })
  res.json({ ok: true })
})

app.put('/api/me/settings', requireAuth, throttleState, (req, res) => {
  if (typeof req.body?.challengesOpen === 'boolean') setChallengesOpen(req.user.id, req.body.challengesOpen)
  if (typeof req.body?.adultMessages === 'boolean') {
    const me = findUserById(req.user.id)
    // Only an under-18 account has anything to switch.
    if (me?.birthdate && ageBand(me.birthdate) === 'under18') setAdultMessages(req.user.id, req.body.adultMessages)
  }
  res.json({ user: publicUser(req.user.id) })
})

/**
 * Settles a challenge whose time is up: counts each side's check-ins against
 * the completion requirement, and pays the reward to whoever met it.
 *
 * Runs whenever a finished challenge is read. The status transition is
 * conditional, so if two reads arrive together only one of them settles it and
 * the reward is paid once.
 */
function duelProgress(row) {
  if (!row.starts_at || !row.ends_at) return null
  const focus = row.mode === 'focus'
  return progressFor(row, {
    creatorSessions: focus ? focusSessionsBetween(row.creator_id, row.starts_at, row.ends_at) : [],
    opponentSessions: focus ? focusSessionsBetween(row.opponent_id, row.starts_at, row.ends_at) : [],
    checkins: focus ? [] : listCheckins(row.id),
  })
}

function settleIfDue(row, now = Date.now()) {
  if (deriveStatus(row, now) !== 'due') return row
  const progress = duelProgress(row)
  const creatorReward = (progress?.creator.met ?? 0) >= row.min_checkins ? row.reward_xp : 0
  const opponentReward = (progress?.opponent.met ?? 0) >= row.min_checkins ? row.reward_xp : 0
  const settled = transitionChallenge(row.id, 'accepted', {
    status: 'completed',
    completed_at: new Date(now).toISOString(),
    creator_reward: creatorReward,
    opponent_reward: opponentReward,
  })
  if (settled) {
    for (const [userId, xp] of [
      [row.creator_id, creatorReward],
      [row.opponent_id, opponentReward],
    ]) {
      try {
        ensureGame(userId)
        transaction(() => {
          const rewards = startRewards(userId)
          if (xp) rewards.pay({ source: 'challenge', sourceId: row.id, xp, label: `Duel: ${row.name}` })
          rewards.finish()
        })
        notify(userId, {
          kind: 'challenge_completed',
          title: xp ? `Duel complete: ${row.name}` : `Duel over: ${row.name}`,
          body: xp ? `You met the objective. +${xp} XP` : 'The objective was not met this time.',
          link: `/challenges/${row.id}`,
          data: { challengeId: row.id },
        })
        track(userId, 'challenge_completed', { met: Boolean(xp) })
      } catch (err) {
        console.error('challenge reward failed', err)
      }
    }
  }
  return getChallenge(row.id)
}

/**
 * A challenge as one of its two participants sees it.
 *
 * States are named as the product names them: an offer waiting is `sent`, and
 * a finished duel is `completed` or `failed` for whoever is looking, by
 * whether they met the objective.
 */
function challengeView(row, viewerId, { detail = false } = {}) {
  const now = Date.now()
  const settled = settleIfDue(row, now)
  const creator = findUserById(settled.creator_id)
  const opponent = findUserById(settled.opponent_id)
  const derived = deriveStatus(settled, now)
  const role = settled.creator_id === viewerId ? 'creator' : 'opponent'
  const myReward = role === 'creator' ? settled.creator_reward : settled.opponent_reward
  const status = derived === 'pending' ? 'sent' : derived === 'completed' ? (myReward > 0 ? 'completed' : 'failed') : derived
  const view = {
    id: settled.id,
    role,
    status,
    mode: settled.mode ?? 'checkin',
    dailyMinutes: settled.daily_minutes ?? null,
    serverNow: new Date(now).toISOString(),
    name: settled.name,
    objective: settled.objective,
    rules: settled.rules,
    terms: TERMS_TEXT,
    durationDays: settled.duration_days,
    rewardXp: settled.reward_xp,
    proof: settled.proof,
    minCheckins: settled.min_checkins,
    startMode: settled.start_mode,
    createdAt: settled.created_at,
    expiresAt: settled.expires_at,
    respondedAt: settled.responded_at,
    startsAt: settled.starts_at,
    endsAt: settled.ends_at,
    completedAt: settled.completed_at,
    creator: creator ? playerSummary(creator) : null,
    opponent: opponent ? playerSummary(opponent) : null,
    // The other side's age group when it differs, for the chat's safety note.
    otherAge: (() => {
      const me = settled.creator_id === viewerId ? creator : opponent
      const them = settled.creator_id === viewerId ? opponent : creator
      return me?.birthdate && them?.birthdate && acrossAges(me, them) ? ageBand(them.birthdate) : null
    })(),
    today: dayIndex(settled, now),
    rewards:
      settled.status === 'completed'
        ? { creator: settled.creator_reward ?? 0, opponent: settled.opponent_reward ?? 0 }
        : null,
    progress: ['accepted', 'active', 'due', 'completed'].includes(derived) ? duelProgress(settled) : null,
  }
  if (detail) {
    view.checkins = listCheckins(settled.id).map((c) => ({
      side: c.user_id === settled.creator_id ? 'creator' : 'opponent',
      day: c.day,
      note: c.note,
      at: c.created_at,
    }))
  }
  return view
}

function loadParticipantChallenge(req, res) {
  const row = getChallenge(String(req.params.id ?? ''))
  if (!row || (row.creator_id !== req.user.id && row.opponent_id !== req.user.id)) {
    res.status(404).json({ error: 'No such challenge.' })
    return null
  }
  return row
}

app.get('/api/challenges', requireAuth, throttleSocialRead, (req, res) => {
  const rows = listChallengesFor(req.user.id)
  res.json({ challenges: rows.map((row) => challengeView(row, req.user.id)) })
})

app.post('/api/challenges', requireAuth, throttleChallengeWrite, (req, res) => {
  try {
    const viewer = findUserById(req.user.id)
    const target = findUserRowByUsername(String(req.body?.opponent ?? '').replace(/^@+/, '').toLowerCase())
    const blocker = contactBlocker(viewer, target)
    if (blocker) {
      res.status(404).json({ error: blocker })
      return
    }
    if (!target.challenges_open) {
      res.status(403).json({ error: 'They are not taking challenges right now.', code: 'closed' })
      return
    }

    const now = Date.now()
    const nowIso = new Date(now).toISOString()
    const terms = validateTerms(req.body ?? {}, now)
    if (!terms.ok) {
      res.status(400).json({ error: terms.error, code: 'bad_terms', field: terms.field })
      return
    }
    if (findOpenBetween(viewer.id, target.id, nowIso)) {
      res.status(409).json({ error: 'You already have a challenge going with them.', code: 'already_open' })
      return
    }
    if (countPendingSent(viewer.id, nowIso) >= MAX_PENDING_SENT) {
      res.status(429).json({ error: `You have ${MAX_PENDING_SENT} offers waiting already. Give them time to answer.`, code: 'too_many_pending' })
      return
    }
    if (countRunning(viewer.id, nowIso) >= MAX_RUNNING) {
      res.status(429).json({ error: `You are already in ${MAX_RUNNING} challenges. Finish one first.`, code: 'too_many_running' })
      return
    }

    const id = randomUUID()
    insertChallenge({ id, creatorId: viewer.id, opponentId: target.id, createdAt: nowIso, ...terms.value })
    audit({ userId: viewer.id, email: viewer.email, event: 'challenge.create', outcome: 'success', ip: req.ip, detail: `${id} -> ${target.id}` })
    notify(target.id, {
      kind: 'challenge_received',
      title: `${playerSummary(viewer).name} challenged you`,
      body: `${terms.value.name} · ${terms.value.durationDays} days · +${terms.value.rewardXp} XP`,
      link: `/challenges/${id}`,
      data: { challengeId: id },
    })
    track(viewer.id, 'challenge_created', { days: terms.value.durationDays, mode: terms.value.mode })
    res.status(201).json({ challenge: challengeView(getChallenge(id), viewer.id, { detail: true }) })
  } catch (err) {
    console.error('challenge create failed', err)
    res.status(500).json({ error: 'Could not send the challenge.' })
  }
})

app.get('/api/challenges/:id', requireAuth, throttleSocialRead, (req, res) => {
  const row = loadParticipantChallenge(req, res)
  if (!row) return
  res.json({ challenge: challengeView(row, req.user.id, { detail: true }) })
})

app.post('/api/challenges/:id/respond', requireAuth, throttleChallengeWrite, (req, res) => {
  const row = loadParticipantChallenge(req, res)
  if (!row) return
  if (row.opponent_id !== req.user.id) {
    res.status(403).json({ error: 'Only the person challenged can answer.' })
    return
  }
  const now = Date.now()
  const nowIso = new Date(now).toISOString()
  if (deriveStatus(row, now) !== 'pending') {
    res.status(409).json({ error: 'This offer is no longer open.', code: 'not_pending' })
    return
  }

  if (req.body?.accept !== true) {
    if (transitionChallenge(row.id, 'pending', { status: 'rejected', responded_at: nowIso })) {
      notify(row.creator_id, {
        kind: 'challenge_rejected',
        title: `Challenge declined: ${row.name}`,
        body: 'No duel was started and no XP is at stake.',
        link: `/challenges/${row.id}`,
        data: { challengeId: row.id },
      })
    }
    res.json({ challenge: challengeView(getChallenge(row.id), req.user.id, { detail: true }) })
    return
  }

  // Everything is checked again at acceptance: either side may have blocked
  // the other, closed challenges, or filled their slots since it was sent.
  const viewer = findUserById(req.user.id)
  const creator = findUserById(row.creator_id)
  if (contactBlocker(viewer, creator)) {
    res.status(409).json({ error: 'This challenge can no longer be accepted.', code: 'unavailable' })
    return
  }
  if (countRunning(viewer.id, nowIso) >= MAX_RUNNING || countRunning(creator.id, nowIso) >= MAX_RUNNING) {
    res.status(429).json({ error: `One of you is already in ${MAX_RUNNING} challenges. Finish one first.`, code: 'too_many_running' })
    return
  }

  const startsAt = row.start_mode === 'date' ? row.starts_at : nowIso
  const endsAt = new Date(Date.parse(startsAt) + row.duration_days * DAY_MS).toISOString()
  const ok = transitionChallenge(row.id, 'pending', {
    status: 'accepted',
    responded_at: nowIso,
    starts_at: startsAt,
    ends_at: endsAt,
  })
  if (!ok) {
    res.status(409).json({ error: 'This offer is no longer open.', code: 'not_pending' })
    return
  }
  audit({ userId: viewer.id, email: viewer.email, event: 'challenge.accept', outcome: 'success', ip: req.ip, detail: row.id })
  notify(row.creator_id, {
    kind: 'challenge_accepted',
    title: `${playerSummary(viewer).name} accepted your challenge`,
    body: `${row.name} is on.`,
    link: `/challenges/${row.id}`,
    data: { challengeId: row.id },
  })
  track(viewer.id, 'challenge_accepted')
  res.json({ challenge: challengeView(getChallenge(row.id), req.user.id, { detail: true }) })
})

app.post('/api/challenges/:id/cancel', requireAuth, throttleChallengeWrite, (req, res) => {
  const row = loadParticipantChallenge(req, res)
  if (!row) return
  if (row.creator_id !== req.user.id || deriveStatus(row) !== 'pending') {
    res.status(409).json({ error: 'Only an offer you sent that is still waiting can be withdrawn.' })
    return
  }
  transitionChallenge(row.id, 'pending', { status: 'cancelled', completed_at: new Date().toISOString() })
  res.json({ challenge: challengeView(getChallenge(row.id), req.user.id, { detail: true }) })
})

app.post('/api/challenges/:id/checkin', requireAuth, throttleChallengeWrite, (req, res) => {
  const row = loadParticipantChallenge(req, res)
  if (!row) return
  const now = Date.now()
  if (deriveStatus(row, now) !== 'active') {
    res.status(409).json({ error: 'Check-ins are only open while the challenge is running.' })
    return
  }
  if (row.mode === 'focus') {
    res.status(409).json({ error: 'This duel counts the focus time Questly times. Start a focus session instead.', code: 'focus_duel' })
    return
  }
  const note = validateCheckinNote(req.body?.note, row.proof)
  if (!note.ok) {
    res.status(400).json({ error: note.error })
    return
  }
  const day = dayIndex(row, now)
  if (!insertCheckin(row.id, req.user.id, day, note.value)) {
    res.status(409).json({ error: 'You have already checked in today.', code: 'already_checked_in' })
    return
  }
  res.json({ challenge: challengeView(getChallenge(row.id), req.user.id, { detail: true }) })
})

/**
 * The challenge's own chat.
 *
 * Opens when the offer is accepted and belongs to that challenge alone. Writing
 * is allowed while it is accepted or running; afterwards it stays readable.
 * Every message goes through the same checks as private messages — the word
 * filter, no contact details, and the stricter rules between an adult and an
 * under-18 — and a per-person rate limit. A block ends the challenge and with
 * it the chat.
 */
app.get('/api/challenges/:id/messages', requireAuth, throttleSocialRead, (req, res) => {
  const row = loadParticipantChallenge(req, res)
  if (!row) return
  if (!['accepted', 'active', 'due', 'completed'].includes(deriveStatus(row))) {
    res.json({ messages: [], open: false })
    return
  }
  const after = Math.max(0, Number(req.query.after) || 0)
  const messages = listChallengeMessages(row.id, after).map((m) => ({
    id: m.id,
    side: m.user_id === row.creator_id ? 'creator' : 'opponent',
    mine: m.user_id === req.user.id,
    body: m.body,
    at: m.created_at,
  }))
  res.json({ messages, open: ['accepted', 'active'].includes(deriveStatus(row)) })
})

app.post('/api/challenges/:id/messages', requireAuth, throttleChat, (req, res) => {
  const row = loadParticipantChallenge(req, res)
  if (!row) return
  if (!['accepted', 'active'].includes(deriveStatus(row))) {
    res.status(409).json({ error: 'This chat is closed.' })
    return
  }
  const otherId = row.creator_id === req.user.id ? row.opponent_id : row.creator_id
  const viewer = findUserById(req.user.id)
  const target = findUserById(otherId)
  // The full contact check, not just blocks: if either account has been
  // disabled or contact has been turned off since, the chat closes.
  if (contactBlocker(viewer, target)) {
    res.status(409).json({ error: 'This chat is closed.' })
    return
  }
  const body = readMessage(req, res, `challenge ${row.id}`, { viewer, target })
  if (body === null) return
  const id = insertChallengeMessage(row.id, req.user.id, body)
  res.status(201).json({ message: { id, side: row.creator_id === req.user.id ? 'creator' : 'opponent', mine: true, body, at: new Date().toISOString() } })
})


// ---------------------------------------------------------------------------
// The feed
//
// One feed for everyone, of every age, from the first day. Posts are never
// shown from someone either side has blocked. Photos and videos are checked by
// the image safety model before they are stored; text goes through the word
// filter.
// ---------------------------------------------------------------------------

/** Whether this server can check pictures and videos, and so accept them. */
app.get('/api/social/media', requireAuth, throttleSocialRead, (req, res) => {
  res.json({
    imagesChecked: imageSafetyConfigured(),
    videosAvailable: imageSafetyConfigured() && videoConfigured(),
  })
})

function videoView(video) {
  return {
    id: video.id,
    url: `/api/posts/videos/${video.id}`,
    poster: `/api/posts/videos/${video.id}/poster`,
    durationMs: video.duration_ms,
    width: video.width,
    height: video.height,
  }
}

function postView(row, viewerId) {
  const author = findUserById(row.user_id)
  const video = row.video_id ? getPostVideo(row.video_id) : null
  let ref = null
  if (row.ref_kind && row.ref_data) {
    try {
      ref = { kind: row.ref_kind, id: row.ref_id, ...JSON.parse(row.ref_data) }
    } catch {
      ref = null
    }
  }
  return {
    id: row.id,
    kind: row.kind,
    body: row.body,
    createdAt: row.created_at,
    image: row.image_id ? `/api/posts/images/${row.image_id}` : null,
    video: video ? videoView(video) : null,
    author: author ? playerSummary(author) : null,
    mine: row.user_id === viewerId,
    ref,
    appreciations: appreciationFor(row.id, viewerId),
    comments: commentCount(row.id),
    clubId: row.club_id ?? null,
    // Club posts are answered by club members only.
    canRespond: !row.club_id || isClubMember(viewerId, row.club_id),
  }
}

/**
 * What a post can be about, checked against the author's own record and kept
 * as a snapshot so the post keeps saying what was true when it was shared.
 * Returns null when there is nothing attached; throws a status-carrying error
 * when the attachment is not the author's to share.
 */
function postRefFor(userId, input) {
  if (!input || typeof input !== 'object') return null
  const kind = String(input.kind ?? '')
  const id = String(input.id ?? '').slice(0, 120)
  const refuse = (message) => {
    const err = new Error(message)
    err.status = 400
    throw err
  }
  if (!id) refuse('Nothing to attach.')
  if (kind === 'quest') {
    const q = db.get("SELECT id, title, xp_reward, rarity, verified_by, completed_at, type FROM quests WHERE id = ? AND user_id = ? AND status = 'completed'", [id, userId])
    if (!q) refuse('Only a quest you have completed can be shared.')
    return { kind, id, data: { title: q.title, xp: q.xp_reward, rarity: q.rarity, questType: q.type, verifiedBy: q.verified_by, completedAt: q.completed_at } }
  }
  if (kind === 'duel') {
    const c = db.get("SELECT * FROM challenges WHERE id = ? AND status = 'completed' AND (creator_id = ? OR opponent_id = ?)", [id, userId, userId])
    if (!c) refuse('Only a finished duel you took part in can be shared.')
    const mine = c.creator_id === userId ? c.creator_reward : c.opponent_reward
    const other = findUserById(c.creator_id === userId ? c.opponent_id : c.creator_id)
    return { kind, id, data: { title: c.name, objective: c.objective, result: mine > 0 ? 'completed' : 'failed', xp: mine ?? 0, opponent: other ? playerSummary(other).name : null, days: c.duration_days } }
  }
  if (kind === 'achievement') {
    const unlocked = db.get('SELECT unlocked_at FROM user_achievements WHERE user_id = ? AND achievement_id = ?', [userId, id])
    const a = ACHIEVEMENTS.find((x) => x.id === id)
    if (!unlocked || !a) refuse('Only an achievement you have unlocked can be shared.')
    return { kind, id, data: { title: a.title, description: a.description, icon: a.icon, unlockedAt: unlocked.unlocked_at } }
  }
  if (kind === 'focus') {
    const s = db.get("SELECT id, label, active_ms, status, ended_at FROM focus_sessions WHERE id = ? AND user_id = ? AND status IN ('completed', 'ended') AND active_ms >= 300000", [id, userId])
    if (!s) refuse('Only a focus session of five minutes or more can be shared.')
    return { kind, id, data: { title: s.label, minutes: Math.floor(s.active_ms / 60_000), completed: s.status === 'completed', endedAt: s.ended_at } }
  }
  refuse('That cannot be attached to a post.')
  return null
}

/** A post this viewer may see: not deleted, not from someone either has blocked, not in a closed club. */
function visiblePost(viewer, postId) {
  const post = getPost(String(postId ?? ''))
  if (!post) return null
  const author = findUserById(post.user_id)
  if (!author || author.disabled) return null
  if (post.user_id !== viewer.id && isBlockedEitherWay(viewer.id, post.user_id)) return null
  if (post.club_id && db.get('SELECT archived_at FROM clubs WHERE id = ?', [post.club_id])?.archived_at) return null
  return post
}

/** Club posts are answered by club members; everything else by any signed-in player who can see it. */
function mayEngage(viewer, post) {
  if (!viewer.username || !viewer.birthdate) return 'Finish your profile first.'
  if (post.club_id && !isClubMember(viewer.id, post.club_id)) return 'Only club members can respond to club posts.'
  return null
}

function commentView(row, viewerId, post, leader = false) {
  return {
    id: row.id,
    body: row.body,
    createdAt: row.created_at,
    mine: row.user_id === viewerId,
    author: { username: row.username, name: String(row.display_name ?? row.username ?? 'Adventurer').slice(0, 40) },
    // The post's author may tidy their own thread, and a club's leaders its club's.
    canDelete: row.user_id === viewerId || post.user_id === viewerId || leader,
  }
}

const throttleEngage = rateLimit({ name: 'engage', max: 90, windowMs: 10 * 60_000, by: 'user' })

app.get('/api/posts/:id', requireAuth, throttleSocialRead, (req, res) => {
  const viewer = findUserById(req.user.id)
  const post = visiblePost(viewer, req.params.id)
  if (!post) {
    res.status(404).json({ error: 'That post is not available.' })
    return
  }
  res.json({ post: postView(post, viewer.id) })
})

app.post('/api/posts/:id/appreciate', requireAuth, throttleEngage, (req, res) => {
  const viewer = findUserById(req.user.id)
  const post = visiblePost(viewer, req.params.id)
  if (!post) {
    res.status(404).json({ error: 'That post is not available.' })
    return
  }
  const problem = mayEngage(viewer, post)
  if (problem) {
    res.status(403).json({ error: problem })
    return
  }
  if (post.user_id === viewer.id) {
    res.status(400).json({ error: 'Appreciation is for other people’s posts.' })
    return
  }
  const on = req.body?.on !== false
  if (on && countRecentAppreciations(viewer.id, new Date(Date.now() - 60 * 60_000).toISOString()) >= 200) {
    res.status(429).json({ error: 'That is a lot of appreciation for one hour. Try again soon.' })
    return
  }
  const before = appreciationFor(post.id, viewer.id)
  const after = setAppreciation(post.id, viewer.id, on)
  if (on && !before.mine) {
    const name = playerSummary(viewer).name
    notify(post.user_id, {
      kind: 'post_appreciated',
      title: after.count > 1 ? `${name} and ${after.count - 1} other${after.count === 2 ? '' : 's'} appreciated your post` : `${name} appreciated your post`,
      body: post.body.length > 90 ? `${post.body.slice(0, 90)}…` : post.body,
      link: `/social/post/${post.id}`,
      dedupeKey: `appreciate:${post.id}`,
    })
  }
  res.json({ appreciations: after })
})

app.get('/api/posts/:id/comments', requireAuth, throttleSocialRead, (req, res) => {
  const viewer = findUserById(req.user.id)
  const post = visiblePost(viewer, req.params.id)
  if (!post) {
    res.status(404).json({ error: 'That post is not available.' })
    return
  }
  const after = typeof req.query.after === 'string' ? req.query.after : null
  const { rows, more } = listComments(post.id, { after })
  const visible = rows.filter((c) => !c.disabled && (c.user_id === viewer.id || !isBlockedEitherWay(viewer.id, c.user_id)))
  const leader = post.club_id ? clubLeaderOf(viewer.id, post.club_id) : false
  res.json({ comments: visible.map((c) => commentView(c, viewer.id, post, leader)), more })
})

app.post('/api/posts/:id/comments', requireAuth, throttleEngage, (req, res) => {
  const viewer = findUserById(req.user.id)
  const post = visiblePost(viewer, req.params.id)
  if (!post) {
    res.status(404).json({ error: 'That post is not available.' })
    return
  }
  const problem = mayEngage(viewer, post)
  if (problem) {
    res.status(403).json({ error: problem })
    return
  }
  const body = String(req.body?.body ?? '').trim().replace(/\n{3,}/g, '\n\n')
  if (!body) {
    res.status(400).json({ error: 'Write something first.' })
    return
  }
  if (body.length > COMMENT_MAX) {
    res.status(400).json({ error: `Comments can be at most ${COMMENT_MAX} characters.` })
    return
  }
  if (!screenInput(body, { allowLength: COMMENT_MAX }).ok) {
    audit({ userId: viewer.id, email: viewer.email, event: 'moderation.comment', outcome: 'blocked', ip: req.ip, detail: post.id })
    res.status(400).json({ error: 'That comment was blocked by the content filter.' })
    return
  }
  // Comments are public to everyone who can see the post, of every age.
  const contact = contactDetails(body)
  const risk = riskyAcrossAges(body)
  if (contact || risk) {
    audit({ userId: viewer.id, email: viewer.email, event: 'moderation.comment_unsafe', outcome: 'blocked', ip: req.ip, detail: `${post.id} (${contact ?? risk})` })
    res.status(400).json({ error: "To keep everyone safe, contact details and personal requests can't go in comments.", code: 'unsafe' })
    return
  }
  if (countRecentComments(viewer.id, new Date(Date.now() - 10 * 60_000).toISOString()) >= 20) {
    res.status(429).json({ error: 'That is a lot of commenting in a few minutes. Take a breather.' })
    return
  }
  const id = randomUUID()
  insertComment({ id, postId: post.id, userId: viewer.id, body })
  if (post.user_id !== viewer.id) {
    notify(post.user_id, {
      kind: 'post_comment',
      title: `${playerSummary(viewer).name} commented on your post`,
      body: body.length > 90 ? `${body.slice(0, 90)}…` : body,
      link: `/social/post/${post.id}`,
      dedupeKey: `comment:${post.id}`,
    })
  }
  const row = { ...getComment(id), username: viewer.username, display_name: viewer.display_name }
  const leader = post.club_id ? clubLeaderOf(viewer.id, post.club_id) : false
  res.status(201).json({ comment: commentView(row, viewer.id, post, leader), comments: commentCount(post.id) })
})

app.delete('/api/posts/:postId/comments/:id', requireAuth, throttleEngage, (req, res) => {
  const viewer = findUserById(req.user.id)
  const post = visiblePost(viewer, req.params.postId)
  const comment = post ? getComment(req.params.id) : null
  if (!post || !comment || comment.post_id !== post.id) {
    res.status(404).json({ error: 'That comment is not available.' })
    return
  }
  const leader = post.club_id ? clubLeaderOf(viewer.id, post.club_id) : false
  if (comment.user_id !== viewer.id && post.user_id !== viewer.id && !leader) {
    res.status(403).json({ error: 'You can remove your own comments, and comments on your own posts.' })
    return
  }
  softDeleteComment(comment.id)
  res.status(204).end()
})

app.post('/api/comments/:id/report', requireAuth, throttleChallengeWrite, (req, res) => {
  const viewer = findUserById(req.user.id)
  const comment = getComment(req.params.id)
  const post = comment ? visiblePost(viewer, comment.post_id) : null
  if (!comment || !post || comment.user_id === viewer.id) {
    res.status(404).json({ error: 'That comment is not available.' })
    return
  }
  const reason = String(req.body?.reason ?? '').trim().slice(0, 300)
  const author = findUserById(comment.user_id)
  fileReport({ reporterId: viewer.id, kind: 'comment', targetId: comment.id, targetUserId: comment.user_id, reason, snapshot: { body: comment.body, postId: post.id, author: author?.username ?? null } })
  audit({ userId: viewer.id, email: viewer.email, event: 'social.report_comment', outcome: 'filed', ip: req.ip, detail: `comment ${comment.id}: ${reason || 'no reason given'}` })
  res.json({ ok: true })
})

app.get('/api/feed', requireAuth, throttleSocialRead, (req, res) => {
  const viewer = findUserById(req.user.id)
  if (!viewer.username || !viewer.birthdate) {
    res.status(403).json({ error: 'Finish your profile first.', code: 'profile_incomplete' })
    return
  }
  const before = typeof req.query.before === 'string' ? req.query.before : null
  let userId = null
  if (typeof req.query.user === 'string' && req.query.user) {
    const target = findUserRowByUsername(req.query.user.toLowerCase())
    if (visibilityBlocker(viewer, target)) {
      res.json({ posts: [], more: false })
      return
    }
    userId = target.id
  }
  const rows = listFeed({ before, limit: 20, userId })
  const visible = rows
    .filter((row) => row.user_id === viewer.id || !isBlockedEitherWay(viewer.id, row.user_id))
    .slice(0, 20)
  // What this player has shared lately, so today's work already posted is not offered again.
  const shared =
    !before && !userId
      ? db
          .all("SELECT ref_kind, ref_id FROM posts WHERE user_id = ? AND ref_kind IS NOT NULL AND deleted_at IS NULL AND created_at > ? LIMIT 200", [
            viewer.id,
            new Date(Date.now() - 8 * 86_400_000).toISOString(),
          ])
          .map((r) => `${r.ref_kind}:${r.ref_id}`)
      : undefined
  res.json({ posts: visible.map((row) => postView(row, viewer.id)), more: rows.length >= 20, shared })
})

app.post('/api/posts', requireAuth, throttleChallengeWrite, async (req, res) => {
  try {
    const viewer = findUserById(req.user.id)
    if (!viewer.username || !viewer.birthdate) {
      res.status(403).json({ error: 'Finish your profile first.', code: 'profile_incomplete' })
      return
    }
    // A club post goes to that club's feed only, from a member; an announcement
    // only from its leaders.
    let club = null
    const announcement = req.body?.kind === 'announcement'
    if (typeof req.body?.club === 'string' && req.body.club) {
      try {
        const rights = clubPostRights(viewer.id, req.body.club)
        if (!rights.post) {
          res.status(403).json({ error: 'Only members can post in this club.', code: 'members_only' })
          return
        }
        if (announcement && !rights.announce) {
          res.status(403).json({ error: 'Only club leaders can post announcements.', code: 'forbidden' })
          return
        }
        club = rights.club
      } catch (err) {
        if (err instanceof GameError) {
          res.status(err.status).json({ error: err.message, code: err.code })
          return
        }
        throw err
      }
    } else if (announcement) {
      res.status(400).json({ error: 'Announcements belong to a club.' })
      return
    }
    const post = validatePost(announcement ? { ...req.body, kind: 'update' } : req.body ?? {})
    if (!post.ok) {
      res.status(400).json({ error: post.error })
      return
    }
    if (announcement) post.value.kind = 'announcement'
    let ref = null
    try {
      ref = postRefFor(viewer.id, req.body?.ref)
    } catch (err) {
      res.status(err.status ?? 400).json({ error: err.message })
      return
    }
    if (ref && findPostWithRef(viewer.id, ref.kind, ref.id)) {
      res.status(409).json({ error: 'You have already shared that.', code: 'already_shared' })
      return
    }
    const hourAgo = new Date(Date.now() - 60 * 60_000).toISOString()
    if (countRecentPosts(viewer.id, hourAgo) >= 10) {
      res.status(429).json({ error: 'That is a lot of posting for one hour. Take a breather and try again soon.' })
      return
    }

    if (req.body?.imageBase64 && req.body?.videoId) {
      res.status(400).json({ error: 'A post can have a photo or a video, not both.' })
      return
    }

    // The video was uploaded and checked already; it only has to be this
    // person's, and not already part of another post.
    let videoId = null
    if (req.body?.videoId) {
      const video = typeof req.body.videoId === 'string' ? getPostVideo(req.body.videoId) : null
      if (!video || video.user_id !== viewer.id || video.post_id) {
        res.status(400).json({ error: 'That video is not available any more. Add it again.' })
        return
      }
      videoId = video.id
    }

    let imageId = null
    if (req.body?.imageBase64) {
      if (countRecentPosts(viewer.id, hourAgo, true) >= 5) {
        res.status(429).json({ error: 'You have posted a lot of photos this hour. Try again soon.' })
        return
      }
      const image = checkImage(req.body.imageBase64, req.body.mediaType, POST_IMAGE_MAX_BYTES)
      if (!image.ok) {
        res.status(400).json({ error: image.error })
        return
      }
      let verdict
      try {
        verdict = await meter({ userId: viewer.id, endpoint: 'feed.image' }, () =>
          screenImage({ mediaType: image.mime, imageBase64: image.bytes.toString('base64') }),
        )
      } catch (err) {
        if (err?.code === 'not_configured') {
          res.status(503).json({ error: err.message, code: 'not_configured' })
          return
        }
        throw err
      }
      if (!verdict.allowed) {
        audit({ userId: viewer.id, email: viewer.email, event: 'moderation.image', outcome: 'blocked', ip: req.ip, detail: verdict.category })
        res.status(422).json({ error: verdict.reason || 'That picture cannot be posted.', code: 'image_blocked' })
        return
      }
      imageId = randomUUID()
      insertPostImage(imageId, viewer.id, image.mime, image.bytes.toString('base64'))
    }

    const id = randomUUID()
    insertPost({ id, userId: viewer.id, kind: post.value.kind, body: post.value.body, imageId, videoId, clubId: club?.id ?? null })
    if (ref) setPostRef(id, ref)
    track(viewer.id, 'post_created', { kind: post.value.kind, media: imageId ? 'image' : videoId ? 'video' : 'none', club: Boolean(club) })
    if (club && announcement) notifyAnnouncement(club, viewer.id, post.value.body)
    let rewards = null
    try {
      ensureGame(viewer.id)
      const summary = transaction(() => startRewards(viewer.id).finish())
      if (summary.achievements.length || summary.items.length) rewards = summary
    } catch (err) {
      console.error('post achievement check failed', err)
    }
    res.status(201).json({ post: postView(getPost(id), viewer.id), rewards })
  } catch (err) {
    console.error('post failed', err)
    res.status(500).json({ error: 'Could not post that.' })
  }
})

app.delete('/api/posts/:id', requireAuth, throttleChallengeWrite, (req, res) => {
  if (!softDeletePost(String(req.params.id ?? ''), req.user.id)) {
    res.status(404).json({ error: 'No such post of yours.' })
    return
  }
  res.status(204).end()
})

app.get('/api/posts/images/:id', requireAuth, throttleSocialRead, (req, res) => {
  const viewer = findUserById(req.user.id)
  const image = getPostImage(String(req.params.id ?? ''))
  if (!image || image.deleted_at) {
    res.status(404).end()
    return
  }
  if (visibilityBlocker(viewer, findUserById(image.user_id))) {
    res.status(404).end()
    return
  }
  res.setHeader('Content-Type', image.mime)
  res.setHeader('Cache-Control', 'private, max-age=86400')
  res.send(Buffer.from(image.data, 'base64'))
})


// ---------------------------------------------------------------------------
// Feed videos
//
// Uploaded on their own, before the post: the file streams to disk, is checked
// to be a video no longer than a minute, has frames sampled through it for the
// image safety check, and is re-encoded to a plain mp4 with its metadata —
// location included — left behind. Only then does the post that uses it get
// written. Served only to people who could see that post.
// ---------------------------------------------------------------------------

const throttleVideoUpload = rateLimit({ name: 'video-upload', max: 8, windowMs: 60 * 60_000, by: 'user' })
// A playing video fetches itself in ranges, so this allows far more than a
// page of requests would need.
const throttleMedia = rateLimit({ name: 'media', max: 600, windowMs: 60_000, by: 'user' })
const MEDIA_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
const VIDEOS_PER_HOUR = 4

/** Streams a request body to a file, giving up past `maxBytes`. */
function receiveUpload(req, dest, maxBytes) {
  return new Promise((resolve, reject) => {
    let bytes = 0
    let failed = false
    const out = createWriteStream(dest)
    const fail = (err) => {
      if (failed) return
      failed = true
      req.unpipe(out)
      out.destroy()
      req.resume()
      reject(err)
    }
    req.on('data', (chunk) => {
      bytes += chunk.length
      if (bytes > maxBytes) fail(Object.assign(new Error('too large'), { code: 'too_large' }))
    })
    req.on('aborted', () => fail(Object.assign(new Error('aborted'), { code: 'aborted' })))
    req.on('error', fail)
    out.on('error', fail)
    out.on('finish', () => !failed && resolve(bytes))
    req.pipe(out)
  })
}

/** How many frames to look at: one every few seconds, within bounds. */
function framesToCheck(durationMs) {
  return Math.max(4, Math.min(12, Math.ceil(durationMs / 4000)))
}

app.post('/api/posts/videos', requireAuth, throttleVideoUpload, async (req, res) => {
  const viewer = findUserById(req.user.id)
  if (!viewer.username || !viewer.birthdate) {
    res.status(403).json({ error: 'Finish your profile first.', code: 'profile_incomplete' })
    return
  }
  if (!videoConfigured() || !imageSafetyConfigured()) {
    res.status(503).json({ error: 'Video posts are not available on this server.', code: 'not_configured' })
    return
  }
  if (!/^video\//i.test(String(req.headers['content-type'] ?? ''))) {
    res.status(415).json({ error: 'Choose a video file.' })
    return
  }
  const tooLarge = `Videos can be at most ${Math.round(VIDEO_MAX_BYTES / 1024 / 1024)}MB.`
  if (Number(req.headers['content-length']) > VIDEO_MAX_BYTES) {
    res.status(413).json({ error: tooLarge })
    return
  }
  if (countRecentVideos(viewer.id, new Date(Date.now() - 60 * 60_000).toISOString()) >= VIDEOS_PER_HOUR) {
    res.status(429).json({ error: 'You have added a lot of videos this hour. Try again soon.' })
    return
  }

  const id = randomUUID()
  const tmpDir = join(MEDIA_DIR, 'tmp')
  mkdirSync(tmpDir, { recursive: true })
  const upload = join(tmpDir, `${id}.upload`)
  const output = join(MEDIA_DIR, `${id}.mp4`)
  const poster = join(MEDIA_DIR, `${id}.jpg`)
  let kept = false

  try {
    await receiveUpload(req, upload, VIDEO_MAX_BYTES)
    if (!(await looksLikeVideo(upload))) {
      res.status(400).json({ error: 'That file is not a video.' })
      return
    }
    const info = await probe(upload)
    if (!info) {
      res.status(400).json({ error: 'That video could not be read. Try an MP4 or MOV file.' })
      return
    }
    if (info.durationMs > (VIDEO_MAX_SECONDS + 0.5) * 1000) {
      res.status(400).json({ error: `Videos can be at most ${VIDEO_MAX_SECONDS} seconds long.` })
      return
    }
    if (info.durationMs < 300) {
      res.status(400).json({ error: 'That video is too short.' })
      return
    }

    const outcome = await oneAtATime(async () => {
      const frames = await sampleFrames(upload, info.durationMs, framesToCheck(info.durationMs))
      const verdict = await meter({ userId: viewer.id, endpoint: 'feed.video' }, () => screenVideoFrames(frames))
      if (!verdict.allowed) return { verdict }
      await transcode(upload, output)
      await writeFile(poster, frames[0])
      return { verdict }
    })

    if (!outcome.verdict.allowed) {
      audit({ userId: viewer.id, email: viewer.email, event: 'moderation.video', outcome: 'blocked', ip: req.ip, detail: outcome.verdict.category })
      res.status(422).json({ error: outcome.verdict.reason || 'That video cannot be posted.', code: 'video_blocked' })
      return
    }

    const final = (await probe(output)) ?? info
    insertPostVideo({
      id,
      userId: viewer.id,
      durationMs: final.durationMs,
      width: final.width,
      height: final.height,
      bytes: statSync(output).size,
    })
    kept = true
    res.status(201).json({ video: videoView(getPostVideo(id)) })
  } catch (err) {
    if (res.headersSent) return
    if (err?.code === 'too_large') res.status(413).json({ error: tooLarge })
    else if (err?.code === 'aborted') res.status(400).end()
    else if (err?.code === 'not_configured') res.status(503).json({ error: err.message, code: 'not_configured' })
    else if (err?.code === 'unreadable') res.status(400).json({ error: err.message })
    else if (err?.code === 'timeout') res.status(400).json({ error: 'That video took too long to process. Try a shorter one.' })
    else {
      console.error('video upload failed', err)
      res.status(500).json({ error: 'Could not add that video.' })
    }
  } finally {
    await rm(upload, { force: true }).catch(() => {})
    if (!kept) {
      await rm(output, { force: true }).catch(() => {})
      await rm(poster, { force: true }).catch(() => {})
    }
  }
})

/** The video if this viewer may see it: their own, or part of a post they
 * could see. Everything else is a plain 404. */
function videoFor(req, res) {
  const id = String(req.params.id ?? '')
  const video = MEDIA_ID.test(id) ? getPostVideo(id) : null
  const viewer = findUserById(req.user.id)
  const visible =
    video &&
    !video.deleted_at &&
    (video.user_id === viewer.id || (video.post_id && !visibilityBlocker(viewer, findUserById(video.user_id))))
  if (!visible) {
    res.status(404).end()
    return null
  }
  return video
}

app.get('/api/posts/videos/:id', requireAuth, throttleMedia, (req, res) => {
  const video = videoFor(req, res)
  if (!video) return
  res.sendFile(
    join(MEDIA_DIR, `${video.id}.mp4`),
    { headers: { 'Content-Type': 'video/mp4', 'Cache-Control': 'private, max-age=86400' } },
    (err) => err && !res.headersSent && res.status(404).end(),
  )
})

app.get('/api/posts/videos/:id/poster', requireAuth, throttleMedia, (req, res) => {
  const video = videoFor(req, res)
  if (!video) return
  res.sendFile(
    join(MEDIA_DIR, `${video.id}.jpg`),
    { headers: { 'Content-Type': 'image/jpeg', 'Cache-Control': 'private, max-age=86400' } },
    (err) => err && !res.headersSent && res.status(404).end(),
  )
})

/** Videos uploaded but never posted, and uploads a crash left half-written. */
function sweepVideos() {
  try {
    const cutoff = new Date(Date.now() - 6 * 60 * 60_000).toISOString()
    for (const { id } of listOrphanVideos(cutoff)) {
      rmSync(join(MEDIA_DIR, `${id}.mp4`), { force: true })
      rmSync(join(MEDIA_DIR, `${id}.jpg`), { force: true })
      deletePostVideo(id)
    }
    // Files whose video row is gone — a deleted account takes its rows with
    // it, and this is where their files follow.
    if (existsSync(MEDIA_DIR)) {
      for (const name of readdirSync(MEDIA_DIR)) {
        const match = /^([0-9a-f-]{36})\.(mp4|jpg)$/i.exec(name)
        if (!match || getPostVideo(match[1])) continue
        const path = join(MEDIA_DIR, name)
        if (Date.now() - statSync(path).mtimeMs > 6 * 60 * 60_000) rmSync(path, { force: true })
      }
    }
    const tmpDir = join(MEDIA_DIR, 'tmp')
    if (existsSync(tmpDir)) {
      for (const name of readdirSync(tmpDir)) {
        const path = join(tmpDir, name)
        if (Date.now() - statSync(path).mtimeMs > 60 * 60_000) rmSync(path, { force: true })
      }
    }
  } catch (err) {
    console.error('video sweep failed', err)
  }
}
setInterval(sweepVideos, 60 * 60_000).unref()
setTimeout(sweepVideos, 60_000).unref()

app.post('/api/posts/:id/report', requireAuth, throttleChallengeWrite, (req, res) => {
  const post = getPost(String(req.params.id ?? ''))
  if (!post) {
    res.status(404).json({ error: 'That post is gone.' })
    return
  }
  const reason = String(req.body?.reason ?? '').trim().slice(0, 300)
  const author = findUserById(post.user_id)
  fileReport({
    reporterId: req.user.id,
    kind: 'post',
    targetId: post.id,
    targetUserId: post.user_id,
    reason,
    snapshot: { body: post.body, kind: post.kind, imageId: post.image_id ?? null, createdAt: post.created_at, author: author?.username ?? null },
  })
  audit({
    userId: req.user.id,
    email: req.user.email,
    event: 'social.report_post',
    outcome: 'filed',
    ip: req.ip,
    detail: `post ${post.id} by ${post.user_id}: ${reason || 'no reason given'}`,
  })
  res.json({ ok: true })
})

// ---------------------------------------------------------------------------
// Messages
//
// One conversation per pair, and people can write as much as they like. A
// conversation someone new starts sits in the other person's requests rather
// than their chats until they accept or reply, so strangers never land among
// the people they actually talk to. Every read and write re-checks that the
// two may still interact.
//
// Declining hides the request from the person who declined, and to the one who
// sent it, it still looks like it is waiting; anything more they write stays
// out of sight. Nobody is told they were turned down, so declining never
// invites a "why?". The person who declined can still change their mind:
// writing back opens the chat.
//
// Messages and challenges cross age groups, so an adult can write to someone
// of 15. What stands in the way of that going wrong (the message rules apply
// to challenge chats too):
// - a conversation from someone new waits in the young person's requests,
//   out of their chats, until they accept or reply — or decline or block it;
// - no chat can carry contact details, links or other apps, so nobody can be
//   drawn off Questly to somewhere unfiltered (see chatsafety.js);
// - between an adult and an under-18, asking to meet, where they live or go to
//   school, for pictures, their age, or for secrecy is refused and logged;
// - an adult can open only a few new conversations with under-18s a day;
// - in a chat across age groups, the young person is reminded they are
//   talking to an adult and what never to share, and the adult is reminded
//   the other person is under 18 and that the chat is held to stricter rules;
// - an under-18 can turn off contact from adults altogether.
// ---------------------------------------------------------------------------

/** How many conversations one person may open with new people in a day: a
 * ceiling for spam bots, far past what anyone does by hand. */
const MAX_NEW_CONVERSATIONS_PER_DAY = 100
/** Of those, how many an adult may open with under-18s. */
const MAX_NEW_UNDER18_CONVERSATIONS_PER_DAY = 3

/** The person a request was sent to, while it is unanswered (or declined). */
function isAnswering(row, userId) {
  return row.status !== 'open' && row.created_by !== userId
}

function conversationView(row, viewerId, { unread = 0, lastBody = null, lastUser = null } = {}) {
  const other = findUserById(row.user_a === viewerId ? row.user_b : row.user_a)
  const viewer = findUserById(viewerId)
  return {
    id: row.id,
    status: row.status === 'open' ? 'open' : 'request',
    requestForMe: isAnswering(row, viewerId),
    other: other ? playerSummary(other) : null,
    // Which safety note this side of the chat sees, if the two are in
    // different age groups: 'adult' when talking to an adult, 'under18' when
    // talking to someone under 18.
    otherAge: other && viewer?.birthdate && acrossAges(viewer, other) ? ageBand(other.birthdate) : null,
    lastMessage: lastBody ? { body: lastBody, mine: lastUser === viewerId } : null,
    lastMessageAt: row.last_message_at,
    unread,
  }
}

function loadConversation(req, res) {
  const row = getConversation(String(req.params.id ?? ''))
  if (!row || (row.user_a !== req.user.id && row.user_b !== req.user.id)) {
    res.status(404).json({ error: 'No such conversation.' })
    return null
  }
  const otherId = row.user_a === req.user.id ? row.user_b : row.user_a
  if (contactBlocker(findUserById(req.user.id), findUserById(otherId))) {
    res.status(404).json({ error: 'This conversation is no longer available.' })
    return null
  }
  return row
}

/**
 * The message text, if it may be sent: through the word filter, free of
 * contact details, and — between an adult and an under-18 — free of the
 * patterns grooming starts with.
 */
function readMessage(req, res, conversationId, { viewer, target }) {
  const message = validateMessage(req.body?.body)
  if (!message.ok) {
    if (/content filter/.test(message.error)) {
      audit({ userId: req.user.id, email: req.user.email, event: 'moderation.dm', outcome: 'blocked', ip: req.ip, detail: conversationId })
    }
    res.status(400).json({ error: message.error })
    return null
  }
  const contact = contactDetails(message.value)
  if (contact) {
    audit({ userId: req.user.id, email: req.user.email, event: 'moderation.dm_contact', outcome: 'blocked', ip: req.ip, detail: `${conversationId ?? 'new'}: ${contact}` })
    res.status(400).json({
      error: "To keep everyone safe, phone numbers, emails, links and other apps can't be shared in messages.",
      code: 'contact_details',
    })
    return null
  }
  if (acrossAges(viewer, target)) {
    const risk = riskyAcrossAges(message.value)
    if (risk) {
      audit({
        userId: req.user.id,
        email: req.user.email,
        event: 'moderation.dm_across_ages',
        outcome: 'blocked',
        ip: req.ip,
        detail: `${conversationId ?? 'new'} to ${target.id} (${risk}): ${message.value.slice(0, 160)}`,
      })
      res.status(400).json({ error: "That message can't be sent.", code: 'unsafe' })
      return null
    }
  }
  return message.value
}

/**
 * Tells the other person about a message — folded into one unread line per
 * conversation. A declined request stays silent, as it does everywhere else.
 */
function notifyMessage(row, sender, recipient, body) {
  if (!row || !recipient) return
  if (row.status === 'declined' && row.created_by === sender.id) return
  const request = row.status !== 'open' && row.created_by === sender.id
  const name = playerSummary(sender).name
  notify(recipient.id, {
    kind: 'message',
    title: request ? `Message request from ${name}` : `New message from ${name}`,
    body: body.length > 90 ? `${body.slice(0, 90)}…` : body,
    link: `/social/messages/${row.id}`,
    data: { conversationId: row.id },
    dedupeKey: `conversation:${row.id}`,
  })
}

app.get('/api/messages', requireAuth, throttleSocialRead, (req, res) => {
  const viewer = findUserById(req.user.id)
  const conversations = listConversationsFor(viewer.id)
    .filter((row) => {
      if (row.status === 'declined' && row.created_by !== viewer.id) return false
      return !contactBlocker(viewer, findUserById(row.user_a === viewer.id ? row.user_b : row.user_a))
    })
    .map((row) => conversationView(row, viewer.id, { unread: row.unread, lastBody: row.last_body, lastUser: row.last_user }))
  res.json({
    conversations,
    unread: conversations.filter((c) => !c.requestForMe).reduce((sum, c) => sum + c.unread, 0),
    requests: conversations.filter((c) => c.requestForMe).length,
  })
})

/** Whether there is already a conversation with this player — what a card's
 * Message button needs to know. */
app.get('/api/messages/with/:username', requireAuth, throttleSocialRead, (req, res) => {
  const viewer = findUserById(req.user.id)
  const target = findUserRowByUsername(String(req.params.username ?? '').replace(/^@+/, '').toLowerCase())
  const blocker = contactBlocker(viewer, target)
  if (blocker) {
    res.status(404).json({ error: blocker })
    return
  }
  const row = findConversationBetween(viewer.id, target.id)
  res.json({ conversationId: row?.id ?? null, player: playerSummary(target) })
})

app.post('/api/messages/start', requireAuth, throttleChat, (req, res) => {
  const viewer = findUserById(req.user.id)
  const target = findUserRowByUsername(String(req.body?.username ?? '').replace(/^@+/, '').toLowerCase())
  const blocker = contactBlocker(viewer, target)
  if (blocker) {
    res.status(404).json({ error: blocker })
    return
  }

  let row = findConversationBetween(viewer.id, target.id)
  const body = readMessage(req, res, row?.id ?? null, { viewer, target })
  if (body === null) return

  if (!row) {
    const dayAgo = new Date(Date.now() - 24 * 60 * 60_000).toISOString()
    // One answer for both caps, so hitting the smaller one says nothing about
    // who was being written to.
    const capped =
      countConversationsStartedSince(viewer.id, dayAgo) >= MAX_NEW_CONVERSATIONS_PER_DAY ||
      (ageBand(viewer.birthdate) === 'adult' &&
        ageBand(target.birthdate) === 'under18' &&
        birthdatesMessagedSince(viewer.id, dayAgo).filter((b) => b && ageBand(b) === 'under18').length >= MAX_NEW_UNDER18_CONVERSATIONS_PER_DAY)
    if (capped) {
      res.status(429).json({ error: 'You have started a lot of new conversations today. Try again tomorrow.' })
      return
    }
    const id = randomUUID()
    createConversation(id, viewer.id, target.id)
    row = getConversation(id)
  } else if (isAnswering(row, viewer.id)) {
    // Writing back to someone who asked to talk opens the chat.
    setConversationStatus(row.id, 'open')
  }

  const messageId = insertDirectMessage(row.id, viewer.id, body)
  markConversationRead(row.id, viewer.id, messageId)
  notifyMessage(getConversation(row.id), viewer, target, body)
  res.status(201).json({ conversation: conversationView(getConversation(row.id), viewer.id, { lastBody: body, lastUser: viewer.id }) })
})

app.get('/api/messages/:id', requireAuth, throttleSocialRead, (req, res) => {
  const row = loadConversation(req, res)
  if (!row) return
  const after = Math.max(0, Number(req.query.after) || 0)
  const messages = listDirectMessages(row.id, after).map((m) => ({
    id: m.id,
    mine: m.user_id === req.user.id,
    body: m.body,
    at: m.created_at,
  }))
  if (messages.length) markConversationRead(row.id, req.user.id, messages[messages.length - 1].id)
  res.json({ conversation: conversationView(row, req.user.id), messages })
})

app.post('/api/messages/:id', requireAuth, throttleChat, (req, res) => {
  const row = loadConversation(req, res)
  if (!row) return
  const viewer = findUserById(req.user.id)
  const target = findUserById(row.user_a === viewer.id ? row.user_b : row.user_a)
  const body = readMessage(req, res, row.id, { viewer, target })
  if (body === null) return
  // Replying to a request is accepting it.
  if (isAnswering(row, req.user.id)) setConversationStatus(row.id, 'open')
  const id = insertDirectMessage(row.id, req.user.id, body)
  markConversationRead(row.id, req.user.id, id)
  notifyMessage(getConversation(row.id), viewer, target, body)
  res.status(201).json({ message: { id, mine: true, body, at: new Date().toISOString() } })
})

/**
 * Reporting a conversation keeps what the other person wrote — the last
 * twenty of their messages — so a moderator sees the conversation as it was.
 * It works after a block too: people often block first and report second.
 */
app.post('/api/messages/:id/report', requireAuth, throttleChallengeWrite, (req, res) => {
  const row = getConversation(String(req.params.id ?? ''))
  if (!row || (row.user_a !== req.user.id && row.user_b !== req.user.id)) {
    res.status(404).json({ error: 'No such conversation.' })
    return
  }
  const otherId = row.user_a === req.user.id ? row.user_b : row.user_a
  const other = findUserById(otherId)
  const theirs = listDirectMessages(row.id, 0, 200)
    .filter((m) => m.user_id === otherId)
    .slice(-20)
    .map((m) => ({ body: m.body.slice(0, 600), at: m.created_at }))
  const reason = String(req.body?.reason ?? '').trim().slice(0, 300)
  fileReport({ reporterId: req.user.id, kind: 'message', targetId: row.id, targetUserId: otherId, reason, snapshot: { username: other?.username ?? null, messages: theirs } })
  audit({ userId: req.user.id, email: req.user.email, event: 'social.report_conversation', outcome: 'filed', ip: req.ip, detail: `${row.id} against ${otherId}` })
  res.json({ ok: true })
})

app.post('/api/messages/:id/accept', requireAuth, throttleChat, (req, res) => {
  const row = loadConversation(req, res)
  if (!row) return
  if (!isAnswering(row, req.user.id)) {
    res.status(409).json({ error: 'There is no request to accept here.' })
    return
  }
  setConversationStatus(row.id, 'open')
  res.json({ conversation: conversationView(getConversation(row.id), req.user.id) })
})

app.post('/api/messages/:id/decline', requireAuth, throttleChat, (req, res) => {
  const row = loadConversation(req, res)
  if (!row) return
  if (!isAnswering(row, req.user.id)) {
    res.status(409).json({ error: 'There is no request to decline here.' })
    return
  }
  setConversationStatus(row.id, 'declined')
  res.json({ ok: true })
})

/**
 * The leaderboard.
 *
 * Name and XP only. This is the one place an account can see another, so the
 * shape is deliberately thin: no email, no level, no streak, no goals. Anyone
 * who would rather not appear is simply absent from the list.
 *
 * The viewer's own row is returned separately as well, so someone in 400th
 * place still sees where they stand instead of an anonymous wall of strangers.
 */
app.get('/api/leaderboard', requireAuth, rateLimit({ name: 'board', max: 30, windowMs: 60_000, by: 'user' }), (req, res) => {
  const full = leaderboard(500)
  const mineIndex = full.findIndex((r) => r.id === req.user.id)
  const me = mineIndex >= 0 ? full[mineIndex] : null
  const stored = findUserById(req.user.id)

  // A row carries its username only when the viewer is allowed to open that
  // card. Everyone else stays a name and a number.
  const handleFor = (r) => (r.id !== req.user.id && r.username && !contactBlocker(stored, findUserById(r.id)) ? r.username : null)

  res.json({
    top: full.slice(0, 50).map((r) => ({
      position: r.position,
      name: r.name,
      xp: r.xp,
      rank: r.rank,
      you: r.id === req.user.id,
      username: handleFor(r),
    })),
    me: me ? { position: me.position, name: me.name, xp: me.xp, rank: me.rank } : null,
    total: full.length,
    hidden: Boolean(stored?.hide_from_leaderboard),
  })
})

app.post('/api/leaderboard/visibility', requireAuth, throttleState, (req, res) => {
  setLeaderboardVisibility(req.user.id, Boolean(req.body?.hidden))
  res.json({ ok: true, hidden: Boolean(req.body?.hidden) })
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

    // A second factor is offered, not demanded. When one is supplied it is
    // proven before being stored, so an account can never end up holding a
    // secret its owner did not actually save.
    const wantsMfa = typeof secret === 'string' && secret && typeof mfaCode === 'string' && mfaCode.trim()
    if (wantsMfa && !checkSecondFactor({ ...user, mfa_secret: secret, mfa_enabled: 1, mfa_backup: '[]' }, mfaCode)) {
      res.status(400).json({ error: 'That authentication code is not right. Check your authenticator.' })
      return
    }

    const recoveryCode = await completeAdminSetup(user.id, password)
    const backupCodes = wantsMfa ? await enrolMfa(user.id, secret) : []
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

/** Everything the console renders, in one call. Cached briefly server-side
 * because it parses every account's state document. */
app.get('/api/admin/stats', requireAuth, requireAdmin, throttleAdmin, (req, res) => {
  try {
    res.json(computeAdminStats({ force: req.query.force === '1' }))
  } catch (err) {
    console.error('admin stats failed', err)
    res.status(500).json({ error: 'Could not build the dashboard.' })
  }
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
  const mine = (sql, limit = 10000) => db.all(`${sql} LIMIT ${limit}`, [req.user.id])
  res.json({
    exportedAt: new Date().toISOString(),
    account: {
      email: stored.email,
      createdAt: stored.created_at,
      role: stored.role,
      username: stored.username,
      displayName: stored.display_name,
      birthdate: stored.birthdate,
      bio: stored.bio,
    },
    notebook: state ? stripServerOwned(state) : null,
    progress: getProgressRow(req.user.id),
    xpHistory: mine('SELECT source, source_id, xp, coins, label, day, created_at FROM xp_ledger WHERE user_id = ? ORDER BY id'),
    quests: mine('SELECT * FROM quests WHERE user_id = ? ORDER BY created_at'),
    focusSessions: mine('SELECT * FROM focus_sessions WHERE user_id = ? ORDER BY started_at'),
    achievements: mine('SELECT achievement_id, unlocked_at FROM user_achievements WHERE user_id = ?'),
    items: mine('SELECT item_id, source, acquired_at FROM user_items WHERE user_id = ?'),
    equipment: mine('SELECT slot, item_id FROM user_equipment WHERE user_id = ?'),
    posts: mine('SELECT id, kind, body, ref_kind, ref_data, created_at, deleted_at FROM posts WHERE user_id = ? ORDER BY created_at'),
    comments: mine('SELECT post_id, body, created_at, deleted_at FROM post_comments WHERE user_id = ? ORDER BY created_at'),
    appreciated: mine('SELECT post_id, created_at FROM post_appreciations WHERE user_id = ? ORDER BY created_at'),
    clubs: mine('SELECT c.name, m.role, m.status, m.club_xp, m.warnings, m.joined_at, m.left_at FROM club_members m JOIN clubs c ON c.id = m.club_id WHERE m.user_id = ?'),
    clubMessages: mine('SELECT c.name AS club, x.body, x.created_at, x.deleted_at FROM club_messages x JOIN clubs c ON c.id = x.club_id WHERE x.user_id = ? ORDER BY x.id'),
    challenges: db.all('SELECT * FROM challenges WHERE creator_id = ? OR opponent_id = ? ORDER BY created_at LIMIT 5000', [req.user.id, req.user.id]),
    notifications: mine('SELECT kind, title, body, created_at, read_at FROM notifications WHERE user_id = ? ORDER BY id DESC', 500),
    // What they wrote to others. The other side's messages are that person's to download.
    messages: mine(
      `SELECT u.username AS with_username, m.body, m.created_at FROM direct_messages m
       JOIN conversations c ON c.id = m.conversation_id
       LEFT JOIN users u ON u.id = CASE WHEN c.user_a = m.user_id THEN c.user_b ELSE c.user_a END
       WHERE m.user_id = ? ORDER BY m.id`,
    ),
    duelMessages: mine('SELECT challenge_id, body, created_at FROM challenge_messages WHERE user_id = ? ORDER BY id'),
    duelCheckins: mine('SELECT challenge_id, day, note, created_at FROM challenge_checkins WHERE user_id = ? ORDER BY created_at'),
    clubChallenges: mine('SELECT challenge_id, status, checkins, joined_at, finished_at FROM club_challenge_entries WHERE user_id = ? ORDER BY joined_at'),
    clubXp: mine('SELECT c.name AS club, x.source, x.xp, x.created_at FROM club_xp_ledger x JOIN clubs c ON c.id = x.club_id WHERE x.user_id = ? ORDER BY x.id'),
    supportRequests: mine('SELECT kind, body, page, status, reply, created_at, closed_at FROM support_requests WHERE user_id = ? ORDER BY created_at'),
    policiesAccepted: mine('SELECT slug, version, accepted_at FROM policy_acceptances WHERE user_id = ? ORDER BY accepted_at'),
    blocked: mine('SELECT u.username, b.created_at FROM user_blocks b LEFT JOIN users u ON u.id = b.blocked_id WHERE b.blocker_id = ? ORDER BY b.created_at'),
    // Reports they made. Reports about them are moderation records, kept only as long as the privacy policy says.
    reportsFiled: mine('SELECT target_kind, reason, status, created_at, resolved_at FROM reports WHERE reporter_id = ? ORDER BY created_at'),
    productEvents: mine('SELECT at, event, props FROM analytics_events WHERE user_id = ? ORDER BY id'),
    daysActive: mine('SELECT day FROM daily_active WHERE user_id = ? ORDER BY day').map((r) => r.day),
    // When each signed-in device started and lapses. Never the tokens.
    sessions: mine('SELECT created_at, expires_at FROM sessions WHERE user_id = ? ORDER BY created_at'),
    photoChecks: mine('SELECT created_at FROM photo_proofs WHERE user_id = ? ORDER BY created_at').map((r) => r.created_at),
    notebookBackups: mine('SELECT created_at FROM state_backups WHERE user_id = ? ORDER BY created_at').map((r) => r.created_at),
    avatar: (() => {
      const picture = getAvatar(req.user.id)
      return picture ? { mime: picture.mime, base64: picture.data } : null
    })(),
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
  // A signed-in device must not become a way to guess the password.
  if (refuseIfLocked(req.user.email, res)) return
  const confirmed = await verifyUser(req.user.email, password)
  if (!confirmed || confirmed.id !== req.user.id) {
    recordLoginFailure(req.user.email)
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

/**
 * The guide's walkthrough, written for the goals just set.
 *
 * Always answers with a usable tour. This is the first thing a new account
 * sees, so a missing key degrades the writing rather than the experience —
 * `fallbackTour` is plainer, not empty.
 */
app.post('/api/tour', requireAuth, throttleAi, async (req, res) => {
  const name = String(req.body?.name ?? '').trim().slice(0, 60)
  const goals = (Array.isArray(req.body?.goals) ? req.body.goals : [])
    .map((g) => ({
      title: String(g?.title ?? '').trim().slice(0, 200),
      category: String(g?.category ?? 'general').trim().slice(0, 40),
      detail: String(g?.detail ?? '').trim().slice(0, 400),
    }))
    .filter((g) => g.title)
    .slice(0, 8)

  if (blockedByModeration(req, res, [name, ...goals.flatMap((g) => [g.title, g.detail])], { allowLength: 600 })) return

  if (!tourConfigured()) {
    res.json({ tour: fallbackTour(name, goals) })
    return
  }

  try {
    const tour = await meter({ userId: req.user.id, endpoint: 'tour' }, () => writeTour({ name, goals }))
    if (blockedOutput(req, res, tour)) return
    res.json({ tour })
  } catch (err) {
    console.error('tour generation failed', err)
    // Still a tour, just the plain one.
    res.json({ tour: fallbackTour(name, goals) })
  }
})

// Progress, quests, focus sessions, inventory and the Chronicle Log.
app.use('/api', gameRoutes({ requireAuth, rateLimit }))

/**
 * A message for a group — a club chat — screened as strictly as the strictest
 * pair in it could need: the word filter, no contact details, and the checks
 * that otherwise apply between an adult and an under-18.
 */
function screenGroupMessage(req, res, context) {
  const message = validateMessage(req.body?.body)
  if (!message.ok) {
    if (/content filter/.test(message.error)) audit({ userId: req.user.id, email: req.user.email, event: 'moderation.club_chat', outcome: 'blocked', ip: req.ip, detail: context })
    res.status(400).json({ error: message.error })
    return null
  }
  const contact = contactDetails(message.value)
  if (contact) {
    audit({ userId: req.user.id, email: req.user.email, event: 'moderation.club_contact', outcome: 'blocked', ip: req.ip, detail: `${context}: ${contact}` })
    res.status(400).json({ error: "To keep everyone safe, phone numbers, emails, links and other apps can't be shared in club chats.", code: 'contact_details' })
    return null
  }
  const risk = riskyAcrossAges(message.value)
  if (risk) {
    audit({ userId: req.user.id, email: req.user.email, event: 'moderation.club_unsafe', outcome: 'blocked', ip: req.ip, detail: `${context} (${risk}): ${message.value.slice(0, 160)}` })
    res.status(400).json({ error: "That message can't be sent in a club chat.", code: 'unsafe' })
    return null
  }
  return message.value
}

// Clubs: membership, trials, challenges, chat, the club feed and club admin.
app.use(
  '/api',
  clubRoutes({
    requireAuth,
    requireAdmin,
    rateLimit,
    publicLook,
    findUserRowByUsername,
    isBlockedEitherWay,
    listFeed,
    postView,
    screenGroupMessage,
    fileReport,
    audit,
    softDeleteAnyPost: adminRemovePost,
    getPost,
  }),
)

app.use('/api', legalRoutes({ requireAuth, requireAdmin, requireSuperadmin, rateLimit, audit, notify, sessionCookie: SESSION_COOKIE }))

app.use(
  '/api',
  adminRoutes({
    requireAuth,
    requireAdmin,
    rateLimit,
    audit,
    notify,
    adminRemovePost,
    softDeleteComment,
    features: () => ({ ai: imageSafetyConfigured(), video: imageSafetyConfigured() && videoConfigured(), inviteOnly: Boolean(INVITE_CODE) }),
    retention: RETENTION,
    lastSweep: () => lastRetentionSweep,
  }),
)

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
  // The build keeps Brotli and gzip copies of every text file beside it
  // (scripts/compress.mjs). Send one when the browser takes it; the static
  // handler below then serves that file under the original's type and caching.
  const COMPRESSED_TYPES = /\.(?:js|mjs|css|html|svg|json|webmanifest|txt)$/
  app.use((req, res, next) => {
    if ((req.method !== 'GET' && req.method !== 'HEAD') || !COMPRESSED_TYPES.test(req.path)) return next()
    let file
    try {
      file = normalize(join(distDir, decodeURIComponent(req.path)))
    } catch {
      return next()
    }
    if (!file.startsWith(distDir + sep)) return next()
    const accepts = String(req.headers['accept-encoding'] ?? '')
    for (const [encoding, suffix] of [['br', '.br'], ['gzip', '.gz']]) {
      if (!new RegExp(`\\b${encoding}\\b`).test(accepts) || !existsSync(file + suffix)) continue
      res.setHeader('Content-Encoding', encoding)
      res.setHeader('Vary', 'Accept-Encoding')
      res.type(extname(file))
      req.url = req.url.replace(/(\?|$)/, `${suffix}$1`)
      break
    }
    next()
  })

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

/**
 * The last word on anything that went wrong: logged here, never shown.
 *
 * Express's own error page prints the stack, server file paths included, whenever
 * NODE_ENV is anything but "production" — one misconfigured deploy away from
 * handing that to anyone who sends a malformed URL — and an HTML page is no use
 * to a client that reads every API answer as JSON.
 */
app.use((err, req, res, next) => {
  if (res.headersSent) return next(err)
  const status = Number.isInteger(err?.status) && err.status >= 400 && err.status < 600 ? err.status : 500
  if (status >= 500) console.error('request failed', req.method, req.path, err)
  const message = status >= 500 ? 'Something went wrong.' : 'That request could not be read.'
  if (req.path.startsWith('/api/')) res.status(status).json({ error: message })
  else res.status(status).type('text/plain').send(message)
})

app.listen(PORT, () => {
  const mode = IS_PRODUCTION ? 'production' : 'development'
  console.log(`Questly listening on http://localhost:${PORT} (${mode})`)
  if (hasBuild) console.log('Serving built frontend from dist/')
  if (INVITE_CODE) console.log('Signup requires an invite code')
})
