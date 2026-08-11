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
for (const column of ['recovery_hash TEXT', 'recovery_salt TEXT']) {
  try {
    db.run(`ALTER TABLE users ADD COLUMN ${column}`)
  } catch {
    // Already present — SQLite has no ADD COLUMN IF NOT EXISTS.
  }
}

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

export function insertUser({ id, email, passwordHash, salt, recoveryHash, recoverySalt }) {
  db.run(
    `INSERT INTO users (id, email, password_hash, salt, created_at, recovery_hash, recovery_salt)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [id, normalizeEmail(email), passwordHash, salt, new Date().toISOString(), recoveryHash, recoverySalt],
  )
}

export function updatePassword(userId, passwordHash, salt) {
  db.run('UPDATE users SET password_hash = ?, salt = ? WHERE id = ?', [passwordHash, salt, userId])
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
