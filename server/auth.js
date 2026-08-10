import { randomBytes, randomUUID, scrypt, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'
import {
  deleteSession,
  findSession,
  findUserByEmail,
  findUserById,
  insertSession,
  insertUser,
  normalizeEmail,
} from './db.js'

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

export function validateCredentials(email, password) {
  const normalized = normalizeEmail(email)
  if (!normalized || !normalized.includes('@') || normalized.length > 254) {
    return 'Enter a valid email address.'
  }
  if (typeof password !== 'string' || password.length < 8) {
    return 'Password must be at least 8 characters.'
  }
  if (password.length > 200) {
    return 'Password is too long.'
  }
  return null
}

export async function createUser(email, password) {
  const salt = randomBytes(16).toString('hex')
  const passwordHash = await hashPassword(password, salt)
  const id = randomUUID()
  insertUser({ id, email, passwordHash, salt })
  return { id, email: normalizeEmail(email) }
}

export async function verifyUser(email, password) {
  const user = findUserByEmail(email)
  if (!user) {
    // Hash anyway so a missing account and a wrong password take similar time.
    await hashPassword(password, 'decoy-salt')
    return null
  }
  const candidate = await hashPassword(password, user.salt)
  if (!safeEqualHex(candidate, user.password_hash)) return null
  return { id: user.id, email: user.email }
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
  req.user = { id: user.id, email: user.email }
  req.sessionToken = token
  next()
}
