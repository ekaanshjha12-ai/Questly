// node-sqlite3-wasm ships CommonJS, so it has no named ESM exports.
import sqlite3Wasm from 'node-sqlite3-wasm'
import { mkdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const { Database } = sqlite3Wasm

const here = dirname(fileURLToPath(import.meta.url))
// Overridable so the SQLite file can live on a mounted volume at whatever path
// the host provides, rather than being pinned inside the app directory.
const dataDir = process.env.DATA_DIR
  ? resolve(process.env.DATA_DIR)
  : join(here, 'data')
mkdirSync(dataDir, { recursive: true })

export const db = new Database(join(dataDir, 'questly.db'))

db.run('PRAGMA journal_mode = WAL')
db.run('PRAGMA foreign_keys = ON')

db.run(`
  CREATE TABLE IF NOT EXISTS users (
    id            TEXT PRIMARY KEY,
    email         TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    salt          TEXT NOT NULL,
    created_at    TEXT NOT NULL
  )
`)

// Recovery codes are hashed exactly like passwords. A leaked database must not
// hand over the means to take over every account.
//
// `role` is deliberately server-owned: nothing in the API can set it, so no
// request body can promote its own account. `max_xp` is the high-water mark used
// to bound what a client is allowed to claim it has earned.
for (const column of [
  'recovery_hash TEXT',
  'recovery_salt TEXT',
  "role TEXT NOT NULL DEFAULT 'user'",
  'mfa_secret TEXT',
  'mfa_enabled INTEGER NOT NULL DEFAULT 0',
  'mfa_backup TEXT',
  'max_xp INTEGER NOT NULL DEFAULT 0',
  'disabled INTEGER NOT NULL DEFAULT 0',
  'password_set_at TEXT',
]) {
  try {
    db.run(`ALTER TABLE users ADD COLUMN ${column}`)
  } catch {
    // Already present — SQLite has no ADD COLUMN IF NOT EXISTS.
  }
}

/**
 * One-time links for claiming an admin account.
 *
 * The password is never transported to the server by an operator, put in an
 * environment variable, or written to a log. The token proves who may set one,
 * and the holder chooses it themselves in the browser.
 */
db.run(`
  CREATE TABLE IF NOT EXISTS admin_setup_tokens (
    token_hash TEXT PRIMARY KEY,
    user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at TEXT NOT NULL,
    used_at    TEXT,
    created_at TEXT NOT NULL
  )
`)

/** Security-relevant events. Append-only by convention — nothing updates rows. */
db.run(`
  CREATE TABLE IF NOT EXISTS audit_log (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    at         TEXT NOT NULL,
    user_id    TEXT,
    email      TEXT,
    event      TEXT NOT NULL,
    outcome    TEXT NOT NULL,
    ip         TEXT,
    detail     TEXT
  )
`)

db.run('CREATE INDEX IF NOT EXISTS idx_audit_at ON audit_log(at)')
db.run('CREATE INDEX IF NOT EXISTS idx_audit_event ON audit_log(event)')
db.run('CREATE INDEX IF NOT EXISTS idx_audit_user ON audit_log(user_id)')

db.run(`
  CREATE TABLE IF NOT EXISTS sessions (
    token      TEXT PRIMARY KEY,
    user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL
  )
`)

db.run(`
  CREATE TABLE IF NOT EXISTS states (
    user_id    TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    data       TEXT NOT NULL,
    version    INTEGER NOT NULL DEFAULT 1,
    updated_at TEXT NOT NULL
  )
`)

// One row per user per UTC day, counting paid verification calls.
db.run(`
  CREATE TABLE IF NOT EXISTS verify_usage (
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    day     TEXT NOT NULL,
    count   INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (user_id, day)
  )
`)

// Perceptual hashes of accepted proof photos, so the same shot cannot be spent
// twice. Kept per user — two people photographing the same gym is not cheating.
db.run(`
  CREATE TABLE IF NOT EXISTS photo_proofs (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    hash       TEXT NOT NULL,
    created_at TEXT NOT NULL
  )
`)

db.run('CREATE INDEX IF NOT EXISTS idx_photo_proofs_user ON photo_proofs(user_id)')
db.run('CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id)')

/** Emails are stored lowercased so lookups and the UNIQUE constraint are
 * case-insensitive without needing COLLATE NOCASE everywhere. */
export function normalizeEmail(email) {
  return String(email ?? '').trim().toLowerCase()
}

export function findUserByEmail(email) {
  return db.get('SELECT * FROM users WHERE email = ?', [normalizeEmail(email)]) ?? null
}

export function findUserById(id) {
  return db.get('SELECT * FROM users WHERE id = ?', [id]) ?? null
}

/**
 * `role` is a named parameter rather than part of the caller's payload so it can
 * never arrive from a request body. The signup route does not pass it at all,
 * which means self-service registration can only ever produce a plain user.
 */
export function insertUser({ id, email, passwordHash, salt, recoveryHash, recoverySalt }, role = 'user') {
  if (!ROLES.has(role)) throw new Error(`Unknown role: ${role}`)
  db.run(
    `INSERT INTO users (id, email, password_hash, salt, created_at, recovery_hash, recovery_salt, role, password_set_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      normalizeEmail(email),
      passwordHash,
      salt,
      new Date().toISOString(),
      recoveryHash,
      recoverySalt,
      role,
      passwordHash ? new Date().toISOString() : null,
    ],
  )
}

export const ROLES = new Set(['user', 'admin', 'superadmin'])
export const PRIVILEGED_ROLES = new Set(['admin', 'superadmin'])

export function updatePassword(userId, passwordHash, salt) {
  db.run('UPDATE users SET password_hash = ?, salt = ?, password_set_at = ? WHERE id = ?', [
    passwordHash,
    salt,
    new Date().toISOString(),
    userId,
  ])
}

export function setRecovery(userId, recoveryHash, recoverySalt) {
  db.run('UPDATE users SET recovery_hash = ?, recovery_salt = ? WHERE id = ?', [
    recoveryHash,
    recoverySalt,
    userId,
  ])
}

export function setUserRole(userId, role) {
  if (!ROLES.has(role)) throw new Error(`Unknown role: ${role}`)
  db.run('UPDATE users SET role = ? WHERE id = ?', [role, userId])
}

export function setUserDisabled(userId, disabled) {
  db.run('UPDATE users SET disabled = ? WHERE id = ?', [disabled ? 1 : 0, userId])
  if (disabled) deleteSessionsForUser(userId)
}

export function countByRole(role) {
  return db.get('SELECT COUNT(*) AS n FROM users WHERE role = ?', [role])?.n ?? 0
}

export function listUsers(limit = 200) {
  return db.all(
    `SELECT id, email, role, disabled, mfa_enabled, created_at, max_xp
     FROM users ORDER BY created_at DESC LIMIT ?`,
    [limit],
  )
}

export function deleteUser(userId) {
  // Sessions, state, verify usage and photo hashes all cascade from users.
  db.run('DELETE FROM users WHERE id = ?', [userId])
}

export function setMfa(userId, { secret, enabled, backup }) {
  db.run('UPDATE users SET mfa_secret = ?, mfa_enabled = ?, mfa_backup = ? WHERE id = ?', [
    secret ?? null,
    enabled ? 1 : 0,
    backup ?? null,
    userId,
  ])
}

export function setMaxXp(userId, xp) {
  db.run('UPDATE users SET max_xp = ? WHERE id = ?', [Math.max(0, Math.floor(xp)), userId])
}

export function insertSetupToken({ tokenHash, userId, expiresAt }) {
  db.run(
    'INSERT INTO admin_setup_tokens (token_hash, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)',
    [tokenHash, userId, expiresAt, new Date().toISOString()],
  )
}

export function findSetupToken(tokenHash) {
  const row = db.get('SELECT * FROM admin_setup_tokens WHERE token_hash = ?', [tokenHash])
  if (!row || row.used_at) return null
  if (new Date(row.expires_at).getTime() <= Date.now()) return null
  return row
}

export function consumeSetupToken(tokenHash) {
  db.run('UPDATE admin_setup_tokens SET used_at = ? WHERE token_hash = ?', [
    new Date().toISOString(),
    tokenHash,
  ])
}

/** Never throws: a failure to write the audit trail must not take down the
 * request it was recording. */
export function audit({ userId = null, email = null, event, outcome, ip = null, detail = null }) {
  try {
    db.run(
      'INSERT INTO audit_log (at, user_id, email, event, outcome, ip, detail) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [
        new Date().toISOString(),
        userId,
        email ? normalizeEmail(email) : null,
        String(event).slice(0, 60),
        String(outcome).slice(0, 30),
        ip ? String(ip).slice(0, 60) : null,
        detail ? String(detail).slice(0, 500) : null,
      ],
    )
  } catch {
    // Best effort only.
  }
}

export function listAudit({ limit = 100, event = null } = {}) {
  if (event) {
    return db.all('SELECT * FROM audit_log WHERE event = ? ORDER BY id DESC LIMIT ?', [event, limit])
  }
  return db.all('SELECT * FROM audit_log ORDER BY id DESC LIMIT ?', [limit])
}

/** Every session is dropped after a reset, so a thief holding a stolen session
 * cookie is logged out the moment the real owner recovers the account. */
export function deleteSessionsForUser(userId) {
  db.run('DELETE FROM sessions WHERE user_id = ?', [userId])
}

export function insertSession({ token, userId, expiresAt }) {
  db.run('INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)', [
    token,
    userId,
    new Date().toISOString(),
    expiresAt,
  ])
}

export function findSession(token) {
  if (!token) return null
  const row = db.get('SELECT * FROM sessions WHERE token = ?', [token])
  if (!row) return null
  if (new Date(row.expires_at).getTime() <= Date.now()) {
    deleteSession(token)
    return null
  }
  return row
}

export function deleteSession(token) {
  db.run('DELETE FROM sessions WHERE token = ?', [token])
}

export function purgeExpiredSessions() {
  db.run('DELETE FROM sessions WHERE expires_at <= ?', [new Date().toISOString()])
}

export function getState(userId) {
  return db.get('SELECT data, version, updated_at FROM states WHERE user_id = ?', [userId]) ?? null
}

export function putState(userId, data) {
  const now = new Date().toISOString()
  const existing = getState(userId)
  if (!existing) {
    db.run('INSERT INTO states (user_id, data, version, updated_at) VALUES (?, ?, 1, ?)', [userId, data, now])
    return { version: 1, updatedAt: now }
  }
  const version = existing.version + 1
  db.run('UPDATE states SET data = ?, version = ?, updated_at = ? WHERE user_id = ?', [data, version, now, userId])
  return { version, updatedAt: now }
}

export function countVerifications(userId, day) {
  const row = db.get('SELECT count FROM verify_usage WHERE user_id = ? AND day = ?', [userId, day])
  return row?.count ?? 0
}

export function listPhotoHashes(userId, limit = 500) {
  return db
    .all('SELECT hash FROM photo_proofs WHERE user_id = ? ORDER BY id DESC LIMIT ?', [userId, limit])
    .map((r) => r.hash)
}

/** How many photo proofs this account has actually had accepted. The level gate
 * is priced in proofs, so this is the server's own ceiling on how many levels a
 * client may claim to have unlocked. */
export function countPhotoProofs(userId) {
  return db.get('SELECT COUNT(*) AS n FROM photo_proofs WHERE user_id = ?', [userId])?.n ?? 0
}

export function recordPhotoHash(userId, hash) {
  db.run('INSERT INTO photo_proofs (user_id, hash, created_at) VALUES (?, ?, ?)', [
    userId,
    hash,
    new Date().toISOString(),
  ])
}

export function recordVerification(userId, day) {
  db.run(
    `INSERT INTO verify_usage (user_id, day, count) VALUES (?, ?, 1)
     ON CONFLICT(user_id, day) DO UPDATE SET count = count + 1`,
    [userId, day],
  )
}
