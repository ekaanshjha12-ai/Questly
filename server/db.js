// node-sqlite3-wasm ships CommonJS, so it has no named ESM exports.
import sqlite3Wasm from 'node-sqlite3-wasm'
import { requiredMaxXp, levelFromXp } from './statecheck.js'
import { screenInput } from './moderation.js'
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
const addedColumns = new Set()
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
  // A suspension is a disable with an end date, so it lifts itself.
  'suspended_until TEXT',
  // Opt-out from the leaderboard. Visible by default, hideable at any time.
  'hide_from_leaderboard INTEGER NOT NULL DEFAULT 0',
  // Where proof-accounting starts for this account. Levels below the baseline
  // were reached before proofs were being recorded and are taken as given.
  'level_baseline INTEGER NOT NULL DEFAULT 1',
  'proof_baseline INTEGER NOT NULL DEFAULT 0',
  // Profile. Stored with the account rather than in the saved state, because
  // the server has to enforce them: a username must be unique across everyone,
  // and the age check is worthless if the browser can rewrite the birthdate.
  'username TEXT',
  'display_name TEXT',
  'birthdate TEXT',
  'bio TEXT',
  // Whether other players may send this account challenges.
  'challenges_open INTEGER NOT NULL DEFAULT 1',
  // XP the server has awarded (challenge rewards) that the account's next state
  // save may add on top of the normal rate ceiling. Spent as it is used.
  'xp_allowance INTEGER NOT NULL DEFAULT 0',
]) {
  try {
    db.run(`ALTER TABLE users ADD COLUMN ${column}`)
    addedColumns.add(column.split(' ')[0])
  } catch {
    // Already present — SQLite has no ADD COLUMN IF NOT EXISTS.
  }
}

// The baseline migration needs `states` and `photo_proofs`, so it runs once
// every table below has been created. See the bottom of this section.

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

/**
 * One row per call to the model.
 *
 * Cost is stored as it was priced at the time rather than recomputed on read —
 * rates change, and a report of what last month cost should not silently move
 * when they do.
 */
db.run(`
  CREATE TABLE IF NOT EXISTS ai_usage (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    at            TEXT NOT NULL,
    day           TEXT NOT NULL,
    user_id       TEXT,
    endpoint      TEXT NOT NULL,
    model         TEXT,
    input_tokens  INTEGER NOT NULL DEFAULT 0,
    output_tokens INTEGER NOT NULL DEFAULT 0,
    cost_usd      REAL NOT NULL DEFAULT 0,
    duration_ms   INTEGER NOT NULL DEFAULT 0,
    ok            INTEGER NOT NULL DEFAULT 1,
    error         TEXT
  )
`)

db.run('CREATE INDEX IF NOT EXISTS idx_ai_usage_day ON ai_usage(day)')
db.run('CREATE INDEX IF NOT EXISTS idx_ai_usage_user ON ai_usage(user_id)')

// `kind` was not recorded before, so photo and voice proofs could not be told
// apart after the fact.
try {
  db.run("ALTER TABLE photo_proofs ADD COLUMN kind TEXT NOT NULL DEFAULT 'photo'")
} catch {
  // Already present.
}

// Usernames are stored lowercased, so a plain unique index is case-insensitive.
// SQLite lets any number of rows share NULL, so accounts from before usernames
// existed do not collide with each other.
db.run('CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username ON users(username)')

/**
 * Profile pictures, in their own table rather than a column on users.
 *
 * Every authenticated request reads the users row, and dragging a picture along
 * with each of those would be pure waste. Base64 text rather than a BLOB keeps
 * it clear of the wasm SQLite driver's binary handling.
 */
db.run(`
  CREATE TABLE IF NOT EXISTS avatars (
    user_id    TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    mime       TEXT NOT NULL,
    data       TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )
`)

/**
 * Challenges between two players.
 *
 * Terms are copied onto the row when the offer is made and never edited after,
 * so what was accepted is exactly what is shown for the life of the challenge.
 * `status` holds only decisions (pending, accepted, rejected, cancelled,
 * completed); time-driven states are derived on read — see challenges.js.
 */
db.run(`
  CREATE TABLE IF NOT EXISTS challenges (
    id              TEXT PRIMARY KEY,
    creator_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    opponent_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name            TEXT NOT NULL,
    objective       TEXT NOT NULL,
    rules           TEXT NOT NULL,
    duration_days   INTEGER NOT NULL,
    reward_xp       INTEGER NOT NULL,
    proof           TEXT NOT NULL,
    min_checkins    INTEGER NOT NULL,
    start_mode      TEXT NOT NULL,
    status          TEXT NOT NULL,
    created_at      TEXT NOT NULL,
    expires_at      TEXT NOT NULL,
    responded_at    TEXT,
    starts_at       TEXT,
    ends_at         TEXT,
    completed_at    TEXT,
    creator_reward  INTEGER,
    opponent_reward INTEGER
  )
`)
db.run('CREATE INDEX IF NOT EXISTS idx_challenges_creator ON challenges(creator_id)')
db.run('CREATE INDEX IF NOT EXISTS idx_challenges_opponent ON challenges(opponent_id)')

db.run(`
  CREATE TABLE IF NOT EXISTS challenge_checkins (
    challenge_id TEXT NOT NULL REFERENCES challenges(id) ON DELETE CASCADE,
    user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    day          INTEGER NOT NULL,
    note         TEXT,
    created_at   TEXT NOT NULL,
    PRIMARY KEY (challenge_id, user_id, day)
  )
`)

db.run(`
  CREATE TABLE IF NOT EXISTS challenge_messages (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    challenge_id TEXT NOT NULL REFERENCES challenges(id) ON DELETE CASCADE,
    user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    body         TEXT NOT NULL,
    created_at   TEXT NOT NULL
  )
`)
db.run('CREATE INDEX IF NOT EXISTS idx_challenge_messages ON challenge_messages(challenge_id, id)')

/** One row per person someone has blocked. Blocking is one-sided to record but
 * two-sided in effect: neither can see or challenge the other. */
db.run(`
  CREATE TABLE IF NOT EXISTS user_blocks (
    blocker_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    blocked_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL,
    PRIMARY KEY (blocker_id, blocked_id)
  )
`)

/**
 * The feed.
 *
 * A post is soft-deleted so a report made against it can still be looked at
 * afterwards; nothing reads deleted posts back out to players.
 */
db.run(`
  CREATE TABLE IF NOT EXISTS posts (
    id         TEXT PRIMARY KEY,
    user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    kind       TEXT NOT NULL,
    body       TEXT NOT NULL,
    image_id   TEXT,
    club_id    TEXT,
    created_at TEXT NOT NULL,
    deleted_at TEXT
  )
`)
db.run('CREATE INDEX IF NOT EXISTS idx_posts_created ON posts(created_at)')
db.run('CREATE INDEX IF NOT EXISTS idx_posts_user ON posts(user_id)')

/** Feed pictures, apart from the posts so a page of the feed does not drag
 * every image through the query. */
db.run(`
  CREATE TABLE IF NOT EXISTS post_images (
    id         TEXT PRIMARY KEY,
    user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    mime       TEXT NOT NULL,
    data       TEXT NOT NULL,
    created_at TEXT NOT NULL
  )
`)

/**
 * Direct messages.
 *
 * One conversation per pair, stored with the two ids in sorted order so the
 * pair has exactly one row whoever wrote first. A conversation starts as a
 * request: the person who opened it cannot keep writing into it until the other
 * side replies or accepts, which is what stops a stranger filling someone's
 * inbox in a system with no follow list to keep them out.
 */
db.run(`
  CREATE TABLE IF NOT EXISTS conversations (
    id              TEXT PRIMARY KEY,
    user_a          TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    user_b          TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_by      TEXT NOT NULL,
    status          TEXT NOT NULL,
    created_at      TEXT NOT NULL,
    last_message_at TEXT NOT NULL,
    UNIQUE (user_a, user_b)
  )
`)
db.run('CREATE INDEX IF NOT EXISTS idx_conversations_a ON conversations(user_a)')
db.run('CREATE INDEX IF NOT EXISTS idx_conversations_b ON conversations(user_b)')

db.run(`
  CREATE TABLE IF NOT EXISTS direct_messages (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    user_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    body            TEXT NOT NULL,
    created_at      TEXT NOT NULL
  )
`)
db.run('CREATE INDEX IF NOT EXISTS idx_direct_messages ON direct_messages(conversation_id, id)')

/** How far each person has read, for unread counts. */
db.run(`
  CREATE TABLE IF NOT EXISTS conversation_reads (
    conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    user_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    last_read_id    INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (conversation_id, user_id)
  )
`)

db.run('CREATE INDEX IF NOT EXISTS idx_photo_proofs_user ON photo_proofs(user_id)')
db.run('CREATE INDEX IF NOT EXISTS idx_photo_proofs_created ON photo_proofs(created_at)')
db.run('CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id)')
db.run('CREATE INDEX IF NOT EXISTS idx_users_created ON users(created_at)')

/**
 * Grandfathers levels that existed before proofs were counted.
 *
 * The level gate is priced in photo verifications, and the server now refuses a
 * save claiming more levels than it has recorded proofs for. Accounts that
 * levelled up before that table was being written have none to show, so without
 * this every save they make would be rejected and they would silently stop
 * syncing. Their current level becomes the floor; everything above it is checked
 * normally.
 *
 * Runs only in the branch where the column was just created, so it happens
 * exactly once per database — and after every table it reads exists.
 */
if (addedColumns.has('level_baseline')) {
  try {
    const rows = db.all('SELECT user_id AS id, data FROM states')
    for (const row of rows) {
      let level = 1
      let maxXp = 0
      try {
        const state = JSON.parse(row.data)
        level = Math.max(1, Number(state?.progression?.level) || 1)
        // Seeds the coin ledger too, not just the level floor — an established
        // account can hold more than its current XP would mint.
        maxXp = requiredMaxXp(state)
      } catch {
        // Unreadable state: leave the floor at 1 rather than guessing high.
      }
      const proofs = db.get('SELECT COUNT(*) AS n FROM photo_proofs WHERE user_id = ?', [row.id])?.n ?? 0
      db.run('UPDATE users SET level_baseline = ?, proof_baseline = ?, max_xp = MAX(max_xp, ?) WHERE id = ?', [
        level,
        proofs,
        Math.round(maxXp),
        row.id,
      ])
    }
    if (rows.length) console.log(`Grandfathered proof baselines for ${rows.length} existing account(s).`)
  } catch (err) {
    console.error('baseline migration failed', err)
  }
}

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

/** Expects an already-normalised (lowercased) username. */
export function findUserByUsername(username) {
  return db.get('SELECT id FROM users WHERE username = ?', [username]) ?? null
}

/**
 * Writes whichever profile fields are given; anything left undefined is not
 * touched. Throws on a username collision — the unique index is the final word
 * when two sign-ups race for the same name.
 */
export function setProfile(userId, { username, displayName, birthdate, bio }) {
  const sets = []
  const values = []
  if (username !== undefined) {
    sets.push('username = ?')
    values.push(username)
  }
  if (displayName !== undefined) {
    sets.push('display_name = ?')
    values.push(displayName)
  }
  if (birthdate !== undefined) {
    sets.push('birthdate = ?')
    values.push(birthdate)
  }
  if (bio !== undefined) {
    sets.push('bio = ?')
    values.push(bio)
  }
  if (!sets.length) return
  db.run(`UPDATE users SET ${sets.join(', ')} WHERE id = ?`, [...values, userId])
}

export function putAvatar(userId, mime, base64) {
  const now = new Date().toISOString()
  db.run(
    `INSERT INTO avatars (user_id, mime, data, updated_at) VALUES (?, ?, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET mime = excluded.mime, data = excluded.data, updated_at = excluded.updated_at`,
    [userId, mime, base64, now],
  )
  return now
}

export function getAvatar(userId) {
  return db.get('SELECT mime, data, updated_at FROM avatars WHERE user_id = ?', [userId]) ?? null
}

/** Just the timestamp, for cache-busting the picture URL without loading it. */
export function avatarVersion(userId) {
  return db.get('SELECT updated_at FROM avatars WHERE user_id = ?', [userId])?.updated_at ?? null
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

/**
 * The leaderboard, built from stored state.
 *
 * Returns a name, an XP figure and the rank that figure earns — nothing else.
 * It is the only place in the app where one account can see another, so it
 * hands back exactly the fields the ranking needs rather than anything the
 * caller might filter client-side; email, streak and goals never leave the
 * server here.
 *
 * Rank is derived from XP rather than read from the stored state, for two
 * reasons: the stored level is client-written and so not trustworthy, and a
 * rank computed from a number already on screen discloses nothing further.
 */
const BOARD_RANKS = [
  ['Heisenberg', 40], ['God', 30], ['Celestial', 24], ['King', 18],
  ['Monarch', 14], ['Champion', 10], ['Knight', 6], ['Soldier', 3], ['Recruit', 1],
]

export function rankName(level) {
  for (const [name, min] of BOARD_RANKS) if (level >= min) return name
  return 'Recruit'
}

export function leaderboard(limit = 50) {
  const rows = db.all(`
    SELECT u.id, u.hide_from_leaderboard AS hidden, u.username, u.birthdate, s.data
    FROM users u JOIN states s ON s.user_id = u.id
    WHERE u.disabled = 0
  `)

  const ranked = []
  for (const row of rows) {
    if (row.hidden) continue
    let name = ''
    let xp = 0
    try {
      const state = JSON.parse(row.data)
      name = String(state?.player?.name ?? '').trim().slice(0, 40)
      xp = Math.max(0, Math.round(Number(state?.player?.xp) || 0))
    } catch {
      continue
    }
    // Screened here, at the one place a name is shown to other people. The name
    // is client-written — onboarding, and now the Personalise screen — and saved
    // with the rest of the state, which is never content-filtered, so without
    // this an abusive name went straight onto a public list. Checking on the way
    // out also catches names saved before the filter existed.
    if (!name || !screenInput(name, { allowLength: 40 }).ok) name = 'Adventurer'
    // username and birthdate ride along for the route to decide who the viewer
    // may open; the route strips them before anything is sent.
    ranked.push({ id: row.id, name, xp, rank: rankName(levelFromXp(xp)), username: row.username, birthdate: row.birthdate })
  }

  ranked.sort((a, b) => b.xp - a.xp)
  return ranked.map((r, i) => ({ ...r, position: i + 1 })).slice(0, Math.max(limit, 1))
}

export function setLeaderboardVisibility(userId, hidden) {
  db.run('UPDATE users SET hide_from_leaderboard = ? WHERE id = ?', [hidden ? 1 : 0, userId])
}

export function setSuspendedUntil(userId, until) {
  db.run('UPDATE users SET suspended_until = ? WHERE id = ?', [until, userId])
  if (until) deleteSessionsForUser(userId)
}

/** True while a suspension is still running. Expired ones simply stop applying,
 * so nothing has to sweep the table. */
export function isSuspended(user) {
  if (!user?.suspended_until) return false
  return new Date(user.suspended_until).getTime() > Date.now()
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

/** Never throws: metering must not be able to fail the request it is measuring. */
export function recordAiUsage({
  userId = null,
  endpoint,
  model = null,
  inputTokens = 0,
  outputTokens = 0,
  costUsd = 0,
  durationMs = 0,
  ok = true,
  error = null,
}) {
  try {
    const now = new Date()
    db.run(
      `INSERT INTO ai_usage (at, day, user_id, endpoint, model, input_tokens, output_tokens, cost_usd, duration_ms, ok, error)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        now.toISOString(),
        now.toISOString().slice(0, 10),
        userId,
        String(endpoint).slice(0, 60),
        model ? String(model).slice(0, 60) : null,
        Math.max(0, Math.round(inputTokens)),
        Math.max(0, Math.round(outputTokens)),
        Number.isFinite(costUsd) ? costUsd : 0,
        Math.max(0, Math.round(durationMs)),
        ok ? 1 : 0,
        error ? String(error).slice(0, 300) : null,
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

export function recordPhotoHash(userId, hash, kind = 'photo') {
  db.run('INSERT INTO photo_proofs (user_id, hash, created_at, kind) VALUES (?, ?, ?, ?)', [
    userId,
    hash,
    new Date().toISOString(),
    kind,
  ])
}

export function recordVerification(userId, day) {
  db.run(
    `INSERT INTO verify_usage (user_id, day, count) VALUES (?, ?, 1)
     ON CONFLICT(user_id, day) DO UPDATE SET count = count + 1`,
    [userId, day],
  )
}


/* --- players meeting each other ------------------------------------------ */

/** The whole users row for a username, for the checks that decide whether two
 * players may interact. Never returned to a client as-is. */
export function findUserRowByUsername(username) {
  return db.get('SELECT * FROM users WHERE username = ?', [username]) ?? null
}

/** Username prefix search, for finding someone to challenge. The caller filters
 * the rows for age band and blocks before anything leaves the server. */
export function searchUsernames(prefix, limit = 40) {
  const escaped = prefix.replace(/[\\%_]/g, (c) => `\\${c}`)
  return db.all(
    `SELECT * FROM users
     WHERE username LIKE ? ESCAPE '\\' AND disabled = 0 AND username IS NOT NULL AND birthdate IS NOT NULL
     ORDER BY LENGTH(username), username LIMIT ?`,
    [`${escaped}%`, limit],
  )
}

export function setChallengesOpen(userId, open) {
  db.run('UPDATE users SET challenges_open = ? WHERE id = ?', [open ? 1 : 0, userId])
}

export function isBlockedEitherWay(a, b) {
  return Boolean(
    db.get('SELECT 1 AS x FROM user_blocks WHERE (blocker_id = ? AND blocked_id = ?) OR (blocker_id = ? AND blocked_id = ?)', [
      a,
      b,
      b,
      a,
    ]),
  )
}

export function blockUser(blockerId, blockedId) {
  db.run('INSERT OR IGNORE INTO user_blocks (blocker_id, blocked_id, created_at) VALUES (?, ?, ?)', [
    blockerId,
    blockedId,
    new Date().toISOString(),
  ])
}

/* --- challenges ----------------------------------------------------------- */

export function insertChallenge(c) {
  db.run(
    `INSERT INTO challenges
       (id, creator_id, opponent_id, name, objective, rules, duration_days, reward_xp, proof, min_checkins,
        start_mode, status, created_at, expires_at, starts_at, ends_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?)`,
    [
      c.id, c.creatorId, c.opponentId, c.name, c.objective, c.rules, c.durationDays, c.rewardXp, c.proof,
      c.minCheckins, c.startMode, c.createdAt, c.expiresAt, c.startsAt, c.endsAt,
    ],
  )
}

export function getChallenge(id) {
  return db.get('SELECT * FROM challenges WHERE id = ?', [id]) ?? null
}

export function listChallengesFor(userId, limit = 200) {
  return db.all(
    'SELECT * FROM challenges WHERE creator_id = ? OR opponent_id = ? ORDER BY created_at DESC LIMIT ?',
    [userId, userId, limit],
  )
}

/**
 * Moves a challenge from one decision to the next, only if it is still in the
 * state the caller saw. Returns whether it did.
 *
 * The condition is the guard against two requests acting on the same challenge
 * at once — an accept racing a cancel, or two reads both settling a finished
 * challenge and paying its reward twice.
 */
const CHALLENGE_COLUMNS = new Set([
  'status', 'responded_at', 'starts_at', 'ends_at', 'completed_at', 'creator_reward', 'opponent_reward',
])

export function transitionChallenge(id, fromStatus, fields) {
  // Column names come from this allow-list only, never from a caller's input.
  const keys = Object.keys(fields).filter((k) => CHALLENGE_COLUMNS.has(k))
  if (!keys.includes('status')) throw new Error('transitionChallenge needs a status')
  const result = db.run(
    `UPDATE challenges SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = ? AND status = ?`,
    [...keys.map((k) => fields[k]), id, fromStatus],
  )
  return result.changes > 0
}

/** Offers still waiting that someone has sent. */
export function countPendingSent(userId, nowIso) {
  return db.get("SELECT COUNT(*) AS n FROM challenges WHERE creator_id = ? AND status = 'pending' AND expires_at > ?", [
    userId,
    nowIso,
  ])?.n ?? 0
}

/** Accepted challenges that have not reached their end, for either side. */
export function countRunning(userId, nowIso) {
  return db.get(
    "SELECT COUNT(*) AS n FROM challenges WHERE (creator_id = ? OR opponent_id = ?) AND status = 'accepted' AND ends_at > ?",
    [userId, userId, nowIso],
  )?.n ?? 0
}

/** A live offer or challenge between these two, in either direction. */
export function findOpenBetween(a, b, nowIso) {
  return db.get(
    `SELECT id FROM challenges
     WHERE ((creator_id = ? AND opponent_id = ?) OR (creator_id = ? AND opponent_id = ?))
       AND ((status = 'pending' AND expires_at > ?) OR (status = 'accepted' AND ends_at > ?))
     LIMIT 1`,
    [a, b, b, a, nowIso, nowIso],
  ) ?? null
}

/** Cancels everything still live between two players — used when one blocks
 * the other, so a block does not leave them sharing a chat. */
export function cancelOpenBetween(a, b) {
  db.run(
    `UPDATE challenges SET status = 'cancelled', completed_at = ?
     WHERE ((creator_id = ? AND opponent_id = ?) OR (creator_id = ? AND opponent_id = ?))
       AND status IN ('pending', 'accepted')`,
    [new Date().toISOString(), a, b, b, a],
  )
}

export function insertCheckin(challengeId, userId, day, note) {
  const result = db.run(
    'INSERT OR IGNORE INTO challenge_checkins (challenge_id, user_id, day, note, created_at) VALUES (?, ?, ?, ?, ?)',
    [challengeId, userId, day, note, new Date().toISOString()],
  )
  return result.changes > 0
}

export function listCheckins(challengeId) {
  return db.all('SELECT user_id, day, note, created_at FROM challenge_checkins WHERE challenge_id = ? ORDER BY day', [
    challengeId,
  ])
}

export function insertChallengeMessage(challengeId, userId, body) {
  const result = db.run('INSERT INTO challenge_messages (challenge_id, user_id, body, created_at) VALUES (?, ?, ?, ?)', [
    challengeId,
    userId,
    body,
    new Date().toISOString(),
  ])
  return Number(result.lastInsertRowid)
}

/** Messages after `afterId` in order; with no `afterId`, the latest `limit`
 * of them, so a long chat opens on its newest messages rather than its first. */
export function listChallengeMessages(challengeId, afterId = 0, limit = 100) {
  if (!afterId) {
    return db
      .all('SELECT id, user_id, body, created_at FROM challenge_messages WHERE challenge_id = ? ORDER BY id DESC LIMIT ?', [
        challengeId,
        limit,
      ])
      .reverse()
  }
  return db.all(
    'SELECT id, user_id, body, created_at FROM challenge_messages WHERE challenge_id = ? AND id > ? ORDER BY id LIMIT ?',
    [challengeId, afterId, limit],
  )
}

/** Finished challenges where this player met the requirement, and all finished
 * ones — the record shown on their card. */
export function challengeRecord(userId) {
  const row = db.get(
    `SELECT
       SUM(CASE WHEN (creator_id = ? AND creator_reward > 0) OR (opponent_id = ? AND opponent_reward > 0) THEN 1 ELSE 0 END) AS won,
       COUNT(*) AS finished
     FROM challenges WHERE (creator_id = ? OR opponent_id = ?) AND status = 'completed'`,
    [userId, userId, userId, userId],
  )
  return { completed: row?.won ?? 0, finished: row?.finished ?? 0 }
}

/* --- rewards -------------------------------------------------------------- */

export function addXpAllowance(userId, xp) {
  db.run('UPDATE users SET xp_allowance = xp_allowance + ? WHERE id = ?', [Math.max(0, Math.round(xp)), userId])
}

export function spendXpAllowance(userId, xp) {
  db.run('UPDATE users SET xp_allowance = MAX(0, xp_allowance - ?) WHERE id = ?', [Math.max(0, Math.round(xp)), userId])
}

/* --- feed ----------------------------------------------------------------- */

export function insertPostImage(id, userId, mime, base64) {
  db.run('INSERT INTO post_images (id, user_id, mime, data, created_at) VALUES (?, ?, ?, ?, ?)', [
    id,
    userId,
    mime,
    base64,
    new Date().toISOString(),
  ])
}

export function getPostImage(id) {
  return db.get('SELECT i.id, i.user_id, i.mime, i.data, p.deleted_at FROM post_images i LEFT JOIN posts p ON p.image_id = i.id WHERE i.id = ?', [id]) ?? null
}

export function insertPost({ id, userId, kind, body, imageId = null, clubId = null }) {
  db.run('INSERT INTO posts (id, user_id, kind, body, image_id, club_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)', [
    id,
    userId,
    kind,
    body,
    imageId,
    clubId,
    new Date().toISOString(),
  ])
}

export function getPost(id) {
  return db.get('SELECT * FROM posts WHERE id = ? AND deleted_at IS NULL', [id]) ?? null
}

/**
 * A page of the feed, newest first, with each author's row alongside so the
 * caller can apply the age-band and block rules without a query per post.
 * Over-fetches a little, since some rows will be filtered out.
 */
export function listFeed({ before, limit = 20, clubId = null, userId = null }) {
  const where = ['p.deleted_at IS NULL', 'u.disabled = 0']
  const args = []
  if (before) {
    where.push('p.created_at < ?')
    args.push(before)
  }
  if (clubId) {
    where.push('p.club_id = ?')
    args.push(clubId)
  } else {
    where.push('p.club_id IS NULL')
  }
  if (userId) {
    where.push('p.user_id = ?')
    args.push(userId)
  }
  return db.all(
    `SELECT p.*, u.username AS author_username, u.birthdate AS author_birthdate
     FROM posts p JOIN users u ON u.id = p.user_id
     WHERE ${where.join(' AND ')}
     ORDER BY p.created_at DESC LIMIT ?`,
    [...args, limit * 3],
  )
}

export function softDeletePost(id, userId) {
  const result = db.run('UPDATE posts SET deleted_at = ? WHERE id = ? AND user_id = ? AND deleted_at IS NULL', [
    new Date().toISOString(),
    id,
    userId,
  ])
  return result.changes > 0
}

/** Posts in the last hour, for the posting rate limit that survives restarts. */
export function countRecentPosts(userId, sinceIso, withImages = false) {
  return db.get(
    `SELECT COUNT(*) AS n FROM posts WHERE user_id = ? AND created_at > ?${withImages ? ' AND image_id IS NOT NULL' : ''}`,
    [userId, sinceIso],
  )?.n ?? 0
}

/* --- direct messages ------------------------------------------------------ */

function pair(x, y) {
  return x < y ? [x, y] : [y, x]
}

export function findConversationBetween(x, y) {
  const [a, b] = pair(x, y)
  return db.get('SELECT * FROM conversations WHERE user_a = ? AND user_b = ?', [a, b]) ?? null
}

export function getConversation(id) {
  return db.get('SELECT * FROM conversations WHERE id = ?', [id]) ?? null
}

export function createConversation(id, creatorId, otherId) {
  const [a, b] = pair(creatorId, otherId)
  const now = new Date().toISOString()
  db.run(
    "INSERT INTO conversations (id, user_a, user_b, created_by, status, created_at, last_message_at) VALUES (?, ?, ?, ?, 'request', ?, ?)",
    [id, a, b, creatorId, now, now],
  )
}

export function setConversationStatus(id, status) {
  db.run('UPDATE conversations SET status = ? WHERE id = ?', [status, id])
}

/** A conversation's list entry: the other person, the latest message, and how
 * many messages this viewer has not read. */
export function listConversationsFor(userId, limit = 100) {
  return db.all(
    `SELECT c.*,
       (SELECT body FROM direct_messages m WHERE m.conversation_id = c.id ORDER BY m.id DESC LIMIT 1) AS last_body,
       (SELECT user_id FROM direct_messages m WHERE m.conversation_id = c.id ORDER BY m.id DESC LIMIT 1) AS last_user,
       (SELECT COUNT(*) FROM direct_messages m WHERE m.conversation_id = c.id AND m.user_id != ?
          AND m.id > COALESCE((SELECT last_read_id FROM conversation_reads r WHERE r.conversation_id = c.id AND r.user_id = ?), 0)) AS unread
     FROM conversations c
     WHERE (c.user_a = ? OR c.user_b = ?)
     ORDER BY c.last_message_at DESC LIMIT ?`,
    [userId, userId, userId, userId, limit],
  )
}

export function insertDirectMessage(conversationId, userId, body) {
  const now = new Date().toISOString()
  const result = db.run('INSERT INTO direct_messages (conversation_id, user_id, body, created_at) VALUES (?, ?, ?, ?)', [
    conversationId,
    userId,
    body,
    now,
  ])
  db.run('UPDATE conversations SET last_message_at = ? WHERE id = ?', [now, conversationId])
  return Number(result.lastInsertRowid)
}

/** As listChallengeMessages: with no `afterId`, the latest `limit` messages. */
export function listDirectMessages(conversationId, afterId = 0, limit = 200) {
  if (!afterId) {
    return db
      .all('SELECT id, user_id, body, created_at FROM direct_messages WHERE conversation_id = ? ORDER BY id DESC LIMIT ?', [
        conversationId,
        limit,
      ])
      .reverse()
  }
  return db.all(
    'SELECT id, user_id, body, created_at FROM direct_messages WHERE conversation_id = ? AND id > ? ORDER BY id LIMIT ?',
    [conversationId, afterId, limit],
  )
}

export function countMessagesBy(conversationId, userId) {
  return db.get('SELECT COUNT(*) AS n FROM direct_messages WHERE conversation_id = ? AND user_id = ?', [conversationId, userId])?.n ?? 0
}

export function markConversationRead(conversationId, userId, lastId) {
  db.run(
    `INSERT INTO conversation_reads (conversation_id, user_id, last_read_id) VALUES (?, ?, ?)
     ON CONFLICT(conversation_id, user_id) DO UPDATE SET last_read_id = MAX(last_read_id, excluded.last_read_id)`,
    [conversationId, userId, lastId],
  )
}

/** Requests someone has started in the last day, for the cap on cold messages. */
export function countConversationsStartedSince(userId, sinceIso) {
  return db.get('SELECT COUNT(*) AS n FROM conversations WHERE created_by = ? AND created_at > ?', [userId, sinceIso])?.n ?? 0
}
