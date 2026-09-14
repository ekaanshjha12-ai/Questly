import { createHash } from 'node:crypto'
import { db } from './db.js'

/**
 * Per-account backoff for password, recovery-code and two-factor guesses.
 *
 * The IP limiter alone lets anyone with a pool of addresses try passwords
 * against one account indefinitely. This counts failures against the account
 * itself — keyed by a hash of the email, so it works the same whether or not
 * the account exists and reveals nothing either way.
 *
 * After a handful of free attempts each further failure locks the account's
 * sign-in for longer, doubling up to a ceiling. The ceiling is deliberately
 * short: a lock anyone can trigger is also a way to keep someone out of their
 * own account, so it should slow a guesser down, not shut the owner out for
 * hours. A correct sign-in clears the count.
 */

db.run(`
  CREATE TABLE IF NOT EXISTS login_failures (
    key          TEXT PRIMARY KEY,
    failures     INTEGER NOT NULL,
    window_start TEXT NOT NULL,
    locked_until TEXT
  )
`)

const FREE_ATTEMPTS = 5
const WINDOW_MS = 15 * 60_000
const BASE_LOCK_MS = 60_000
const MAX_LOCK_MS = 15 * 60_000

function keyFor(email) {
  return createHash('sha256').update(String(email ?? '').trim().toLowerCase()).digest('hex')
}

/** Seconds until this account may try again, or 0 when it may now. */
export function loginRetryAfter(email, now = Date.now()) {
  const row = db.get('SELECT locked_until FROM login_failures WHERE key = ?', [keyFor(email)])
  const until = row?.locked_until ? Date.parse(row.locked_until) : 0
  return until > now ? Math.ceil((until - now) / 1000) : 0
}

export function recordLoginFailure(email, now = Date.now()) {
  const key = keyFor(email)
  const row = db.get('SELECT failures, window_start, locked_until FROM login_failures WHERE key = ?', [key])
  const locked = row?.locked_until && Date.parse(row.locked_until) > now
  const fresh = !row || (!locked && now - Date.parse(row.window_start) > WINDOW_MS)
  const failures = fresh ? 1 : row.failures + 1
  const windowStart = fresh ? new Date(now).toISOString() : row.window_start
  const lockMs = failures >= FREE_ATTEMPTS ? Math.min(MAX_LOCK_MS, BASE_LOCK_MS * 2 ** (failures - FREE_ATTEMPTS)) : 0
  db.run(
    `INSERT INTO login_failures (key, failures, window_start, locked_until) VALUES (?, ?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET failures = excluded.failures, window_start = excluded.window_start, locked_until = excluded.locked_until`,
    [key, failures, windowStart, lockMs ? new Date(now + lockMs).toISOString() : null],
  )
}

export function clearLoginFailures(email) {
  db.run('DELETE FROM login_failures WHERE key = ?', [keyFor(email)])
}

/** Old rows, so the table does not grow with every address ever tried. */
export function purgeLoginFailures(now = Date.now()) {
  const cutoff = new Date(now - 24 * 60 * 60_000).toISOString()
  db.run('DELETE FROM login_failures WHERE window_start < ? AND (locked_until IS NULL OR locked_until < ?)', [cutoff, new Date(now).toISOString()])
}

export function lockedMessage(seconds) {
  const minutes = Math.ceil(seconds / 60)
  return `Too many attempts for this account. Try again in ${minutes === 1 ? 'a minute' : `${minutes} minutes`}.`
}
