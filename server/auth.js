import { createHash, randomBytes, randomUUID, scrypt, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'
import {
  audit,
  deleteSession,
  deleteSessionsForUser,
  updatePassword,
  findSession,
  findUserByEmail,
  findUserById,
  insertSession,
  insertUser,
  normalizeEmail,
  setMfa,
  setRecovery,
  PRIVILEGED_ROLES,
} from './db.js'
import { generateBackupCodes, normalizeBackupCode, verifyTotp } from './totp.js'

const scryptAsync = promisify(scrypt)

const KEY_LEN = 64
const SESSION_DAYS = 30
export const SESSION_COOKIE = 'questly_session'

async function hashPassword(password, salt) {
  const derived = await scryptAsync(password, salt, KEY_LEN)
  return derived.toString('hex')
}

/** Constant-time comparison so a wrong password can't be narrowed down by
 * timing how long the check took. */
function safeEqualHex(a, b) {
  const bufA = Buffer.from(a, 'hex')
  const bufB = Buffer.from(b, 'hex')
  if (bufA.length !== bufB.length) return false
  return timingSafeEqual(bufA, bufB)
}

/** A handful of the most-guessed passwords. Not a substitute for a breach
 * corpus, but it stops the worst choices at no cost. */
const OBVIOUS_PASSWORDS = new Set([
  'password', 'password1', 'password123', '12345678', '123456789', '1234567890',
  'qwertyui', 'qwerty123', 'iloveyou', 'admin123', 'letmein1', 'welcome1',
  'abc12345', 'football', 'baseball', 'superman', 'trustno1', 'passw0rd',
])

export function validateCredentials(email, password, { minLength = 8 } = {}) {
  const normalized = normalizeEmail(email)
  // Deliberately conservative: one @, something either side, a dot in the host.
  if (!normalized || normalized.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
    return 'Enter a valid email address.'
  }
  if (typeof password !== 'string' || password.length < minLength) {
    return `Password must be at least ${minLength} characters.`
  }
  if (password.length > 200) {
    return 'Password is too long.'
  }
  if (OBVIOUS_PASSWORDS.has(password.toLowerCase())) {
    return 'That password is too common. Choose something else.'
  }
  // Only meaningful for a local part long enough to be a real name. Applying it
  // to short ones rejects almost everything — "a@b.com" would bar any password
  // containing the letter a.
  const localPart = normalized.split('@')[0]
  if (localPart.length >= 4 && password.toLowerCase().includes(localPart.toLowerCase())) {
    return 'Password must not contain your email name.'
  }
  return null
}

/** Admin credentials protect everyone else's data, so they are held to a longer
 * minimum than an ordinary account. */
export const ADMIN_MIN_PASSWORD = 16

/** Ambiguous characters are left out so a code copied off a screen by hand does
 * not fail on an I/1 or O/0 mix-up. */
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

function makeRecoveryCode() {
  const bytes = randomBytes(20)
  let out = ''
  for (let i = 0; i < 20; i++) {
    if (i > 0 && i % 5 === 0) out += '-'
    out += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length]
  }
  return out
}

/** Case and dashes are cosmetic, so they are stripped before hashing and the
 * user can type it back however they like. */
export function normalizeCode(code) {
  return String(code ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '')
}

/**
 * `role` is a separate argument, never read from the caller's payload, and the
 * signup route never passes it. Self-service registration can therefore only
 * ever produce a plain user, no matter what a request body contains.
 */
export async function createUser(email, password, role = 'user') {
  const salt = randomBytes(16).toString('hex')
  const passwordHash = await hashPassword(password, salt)
  const recoveryCode = makeRecoveryCode()
  const recoverySalt = randomBytes(16).toString('hex')
  const recoveryHash = await hashPassword(normalizeCode(recoveryCode), recoverySalt)
  const id = randomUUID()
  insertUser({ id, email, passwordHash, salt, recoveryHash, recoverySalt }, role)
  // Returned once and never stored in the clear — this is the only time anyone
  // can read it.
  return { user: { id, email: normalizeEmail(email), role }, recoveryCode }
}

/**
 * Creates a privileged account that cannot yet be logged into.
 *
 * No password is chosen here. The row is created with an empty credential and
 * the holder sets one through a one-time link, so an operator's password is
 * never typed into a terminal, stored in an environment variable, written to a
 * deploy log, or passed through anyone else's hands.
 */
export function createPendingAdmin(email, role) {
  const id = randomUUID()
  insertUser(
    { id, email, passwordHash: '', salt: '', recoveryHash: null, recoverySalt: null },
    role,
  )
  return { id, email: normalizeEmail(email), role }
}

/** Finishes a pending admin: sets the password they chose and issues their
 * recovery code. Separate from `createUser` so the row keeps its id and role. */
export async function completeAdminSetup(userId, password) {
  const salt = randomBytes(16).toString('hex')
  const passwordHash = await hashPassword(password, salt)
  updatePassword(userId, passwordHash, salt)

  const recoveryCode = makeRecoveryCode()
  const recoverySalt = randomBytes(16).toString('hex')
  const recoveryHash = await hashPassword(normalizeCode(recoveryCode), recoverySalt)
  setRecovery(userId, recoveryHash, recoverySalt)
  return recoveryCode
}

/**
 * Resets a password using the recovery code issued at signup.
 *
 * There is no email provider wired to this app, so a link-based reset is not
 * possible. A code the user saves at signup gives genuine self-service recovery
 * with no infrastructure — at the cost that losing the code means losing the
 * account, which is the same trade-off password managers make.
 */
export async function resetWithCode(email, code, newPassword) {
  const user = findUserByEmail(email)
  const normalized = normalizeCode(code)

  if (!user || !user.recovery_hash || !user.recovery_salt || normalized.length < 8) {
    // Hash regardless so a missing account cannot be spotted by how fast this
    // returns.
    await hashPassword(normalized || 'x', 'decoy-salt')
    return false
  }

  const candidate = await hashPassword(normalized, user.recovery_salt)
  if (!safeEqualHex(candidate, user.recovery_hash)) return false

  const salt = randomBytes(16).toString('hex')
  updatePassword(user.id, await hashPassword(newPassword, salt), salt)
  deleteSessionsForUser(user.id)
  return true
}

export async function verifyUser(email, password) {
  const user = findUserByEmail(email)
  if (!user) {
    // Hash anyway so a missing account and a wrong password take similar time.
    await hashPassword(password, 'decoy-salt')
    return null
  }
  // An account with no password set (a freshly invited admin) can never be
  // logged into until the setup link has been used.
  if (!user.password_hash) {
    await hashPassword(password, 'decoy-salt')
    return null
  }
  const candidate = await hashPassword(password, user.salt)
  if (!safeEqualHex(candidate, user.password_hash)) return null
  if (user.disabled) return { disabled: true }
  return {
    id: user.id,
    email: user.email,
    role: user.role ?? 'user',
    mfaEnabled: Boolean(user.mfa_enabled),
  }
}

/** Admins and the superadmin must hold a second factor — a stolen password on
 * one of those accounts would otherwise expose every user's data. */
export function mfaRequiredFor(role) {
  return PRIVILEGED_ROLES.has(role)
}

export async function enrolMfa(userId, secret) {
  const codes = generateBackupCodes()
  const hashed = codes.map((code) => sha256(normalizeBackupCode(code)))
  setMfa(userId, { secret, enabled: true, backup: JSON.stringify(hashed) })
  // Shown once, stored only as hashes.
  return codes
}

function sha256(value) {
  return createHash('sha256').update(String(value)).digest('hex')
}

/**
 * Checks a second factor, accepting either a live TOTP code or one unused backup
 * code. A backup code is burned on use so it cannot be replayed.
 */
export function checkSecondFactor(user, code) {
  if (!user?.mfa_enabled || !user.mfa_secret) return false
  if (verifyTotp(user.mfa_secret, code)) return true

  const normalized = normalizeBackupCode(code)
  if (normalized.length < 8) return false
  let remaining
  try {
    remaining = JSON.parse(user.mfa_backup ?? '[]')
  } catch {
    return false
  }
  const hashed = sha256(normalized)
  const index = remaining.indexOf(hashed)
  if (index < 0) return false

  remaining.splice(index, 1)
  setMfa(user.id, { secret: user.mfa_secret, enabled: true, backup: JSON.stringify(remaining) })
  audit({ userId: user.id, email: user.email, event: 'mfa.backup_used', outcome: 'success' })
  return true
}

export function startSession(userId) {
  const token = randomBytes(32).toString('hex')
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000).toISOString()
  insertSession({ token, userId, expiresAt })
  return { token, expiresAt }
}

export function endSession(token) {
  if (token) deleteSession(token)
}

/** Shared by set and clear so logout actually removes the cookie — a mismatched
 * secure/sameSite pair leaves the original in place. */
function baseCookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'lax',
    // Dev runs over plain http on localhost, where a secure cookie would never
    // be stored. Production is always behind HTTPS.
    secure: process.env.NODE_ENV === 'production',
    path: '/',
  }
}

export function cookieOptions() {
  return { ...baseCookieOptions(), maxAge: SESSION_DAYS * 24 * 60 * 60 * 1000 }
}

export function clearCookieOptions() {
  return baseCookieOptions()
}

/** Attaches req.user when a valid session cookie is present; otherwise 401. */
export function requireAuth(req, res, next) {
  const token = req.cookies?.[SESSION_COOKIE]
  const session = findSession(token)
  if (!session) {
    res.status(401).json({ error: 'Not signed in.' })
    return
  }
  const user = findUserById(session.user_id)
  if (!user) {
    res.status(401).json({ error: 'Not signed in.' })
    return
  }
  // A disabled account keeps its rows but loses access immediately, even if it
  // is holding a session issued before it was disabled.
  if (user.disabled) {
    deleteSessionsForUser(user.id)
    res.status(403).json({ error: 'This account has been disabled.', code: 'disabled' })
    return
  }
  req.user = {
    id: user.id,
    email: user.email,
    role: user.role ?? 'user',
    mfaEnabled: Boolean(user.mfa_enabled),
  }
  req.sessionToken = token
  next()
}

/**
 * Gate for anything an ordinary account must never reach.
 *
 * Checked against the role stored on the row, read fresh on every request, so
 * demoting or disabling an admin takes effect at once rather than whenever their
 * session happens to expire.
 */
export function requireRole(...roles) {
  const allowed = new Set(roles)
  return (req, res, next) => {
    if (!req.user) {
      res.status(401).json({ error: 'Not signed in.' })
      return
    }
    if (!allowed.has(req.user.role)) {
      audit({
        userId: req.user.id,
        email: req.user.email,
        event: 'authz.denied',
        outcome: 'blocked',
        ip: req.ip,
        detail: `${req.method} ${req.originalUrl} as ${req.user.role}`,
      })
      // Deliberately 404, not 403: an ordinary account should not be able to map
      // which admin routes exist.
      res.status(404).json({ error: 'Not found.' })
      return
    }
    // Privileged sessions are only trusted when the second factor was actually
    // presented at sign-in.
    if (mfaRequiredFor(req.user.role) && !req.user.mfaEnabled) {
      res.status(403).json({ error: 'This account must finish setting up two-factor authentication.', code: 'mfa_required' })
      return
    }
    next()
  }
}

export const requireAdmin = requireRole('admin', 'superadmin')
export const requireSuperadmin = requireRole('superadmin')

export function hashSetupToken(token) {
  return sha256(token)
}

export function makeSetupToken() {
  return randomBytes(32).toString('hex')
}
