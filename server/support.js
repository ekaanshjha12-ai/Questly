import { randomUUID } from 'node:crypto'
import { db } from './db.js'

/**
 * Contact & support: problems, questions, safety concerns and privacy
 * requests, sent from inside the app to the admin console.
 *
 * Signed-in players are known by their account. Someone who cannot sign in —
 * locked out, suspended, or asking about a young person's account — leaves an
 * email address to be answered at, and that is the only reason one is asked
 * for. A request goes with the account that sent it.
 */

db.run(`
  CREATE TABLE IF NOT EXISTS support_requests (
    id          TEXT PRIMARY KEY,
    user_id     TEXT REFERENCES users(id) ON DELETE CASCADE,
    contact     TEXT,
    kind        TEXT NOT NULL,
    body        TEXT NOT NULL,
    page        TEXT,
    status      TEXT NOT NULL DEFAULT 'open',
    reply       TEXT,
    created_at  TEXT NOT NULL,
    closed_at   TEXT,
    closed_by   TEXT REFERENCES users(id) ON DELETE SET NULL
  )
`)
db.run('CREATE INDEX IF NOT EXISTS idx_support_status ON support_requests(status, created_at)')
db.run('CREATE INDEX IF NOT EXISTS idx_support_user ON support_requests(user_id, created_at)')

export const SUPPORT_KINDS = ['problem', 'account', 'safety', 'privacy', 'feedback', 'other']
export const SUPPORT_BODY_MAX = 2000
export const SUPPORT_REPLY_MAX = 2000
const EMAIL = /^[^\s@<>()[\]]+@[^\s@<>()[\]]+\.[a-z]{2,}$/i

/** @returns {{ ok: true, value: object } | { ok: false, error: string }} */
export function validateSupportRequest(input, { signedIn }) {
  const kind = SUPPORT_KINDS.includes(input?.kind) ? input.kind : null
  if (!kind) return { ok: false, error: 'Choose what this is about.' }
  const body = String(input?.body ?? '').replace(/\r\n/g, '\n').trim()
  if (body.length < 10) return { ok: false, error: 'Tell us a little more — at least a sentence.' }
  if (body.length > SUPPORT_BODY_MAX) return { ok: false, error: `Keep it to ${SUPPORT_BODY_MAX.toLocaleString()} characters.` }
  // Only where the app was when the form opened, never a full address with a query.
  const page = typeof input?.page === 'string' && /^\/[a-z0-9/_-]{0,80}$/i.test(input.page) ? input.page : null
  let contact = null
  if (!signedIn) {
    contact = String(input?.contact ?? '').trim().toLowerCase().slice(0, 254)
    if (!EMAIL.test(contact)) return { ok: false, error: 'Add an email address so we can reply.' }
  }
  return { ok: true, value: { kind, body, page, contact } }
}

export function fileSupportRequest({ userId = null, kind, body, page = null, contact = null }) {
  const id = randomUUID()
  db.run('INSERT INTO support_requests (id, user_id, contact, kind, body, page, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)', [
    id,
    userId,
    contact,
    kind,
    body,
    page,
    new Date().toISOString(),
  ])
  return id
}

export function openSupportCountFor(userId) {
  return db.get("SELECT COUNT(*) AS n FROM support_requests WHERE user_id = ? AND status = 'open'", [userId])?.n ?? 0
}

export function openSupportCount() {
  return db.get("SELECT COUNT(*) AS n FROM support_requests WHERE status = 'open'")?.n ?? 0
}

function view(row) {
  return {
    id: row.id,
    kind: row.kind,
    body: row.body,
    page: row.page,
    status: row.status,
    reply: row.reply,
    createdAt: row.created_at,
    closedAt: row.closed_at,
  }
}

export function listMySupport(userId) {
  return db.all('SELECT * FROM support_requests WHERE user_id = ? ORDER BY created_at DESC LIMIT 20', [userId]).map(view)
}

export function listSupport(status = 'open') {
  const rows = db.all(
    `SELECT s.*, u.username, u.email AS user_email, c.email AS closed_by_email
     FROM support_requests s
     LEFT JOIN users u ON u.id = s.user_id
     LEFT JOIN users c ON c.id = s.closed_by
     WHERE s.status = ? ORDER BY s.created_at ${status === 'open' ? 'ASC' : 'DESC'} LIMIT 200`,
    [status === 'closed' ? 'closed' : 'open'],
  )
  return rows.map((row) => ({
    ...view(row),
    from: row.user_id ? { id: row.user_id, username: row.username ?? null, email: row.user_email ?? null } : null,
    contact: row.contact,
    closedBy: row.closed_by_email ?? null,
  }))
}

export function getSupportRequest(id) {
  return db.get('SELECT * FROM support_requests WHERE id = ?', [String(id ?? '')]) ?? null
}

/** Closes an open request, with the reply sent back if there is one. False if it was already closed. */
export function closeSupportRequest(id, { reply = null, adminId }) {
  const result = db.run("UPDATE support_requests SET status = 'closed', reply = ?, closed_at = ?, closed_by = ? WHERE id = ? AND status = 'open'", [
    reply,
    new Date().toISOString(),
    adminId,
    id,
  ])
  return result.changes > 0
}
