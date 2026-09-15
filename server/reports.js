import { randomUUID } from 'node:crypto'
import { db } from './db.js'

/**
 * The moderation queue.
 *
 * A report keeps a snapshot of what was reported at the moment it was filed —
 * a post can be edited or deleted, a bio rewritten — so whoever reviews it
 * sees what the reporter saw. One open report per person per thing: reporting
 * the same post twice does not queue it twice.
 */

db.run(`
  CREATE TABLE IF NOT EXISTS reports (
    id             TEXT PRIMARY KEY,
    reporter_id    TEXT REFERENCES users(id) ON DELETE SET NULL,
    target_kind    TEXT NOT NULL,
    target_id      TEXT NOT NULL,
    target_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
    reason         TEXT,
    snapshot       TEXT,
    status         TEXT NOT NULL DEFAULT 'open',
    action         TEXT,
    note           TEXT,
    resolved_by    TEXT REFERENCES users(id) ON DELETE SET NULL,
    created_at     TEXT NOT NULL,
    resolved_at    TEXT
  )
`)
db.run('CREATE INDEX IF NOT EXISTS idx_reports_status ON reports(status, created_at)')
// Whether a post or comment has a report waiting: the console and the retention sweep ask often.
db.run('CREATE INDEX IF NOT EXISTS idx_reports_target ON reports(target_kind, target_id, status)')
db.run("CREATE UNIQUE INDEX IF NOT EXISTS uq_reports_open ON reports(reporter_id, target_kind, target_id) WHERE status = 'open'")

export const REPORT_KINDS = ['player', 'post', 'comment', 'message', 'challenge', 'club']
export const REPORT_STATUSES = ['open', 'actioned', 'dismissed']

/** @returns {{ id: string | null, duplicate: boolean }} */
const SNAPSHOT_MAX = 16_000

/** The snapshot as stored: whole JSON or, if it will not fit, a note saying so — never JSON cut in half. */
function snapshotText(snapshot) {
  if (!snapshot) return null
  const text = JSON.stringify(snapshot)
  return text.length <= SNAPSHOT_MAX ? text : JSON.stringify({ note: 'The reported content was too large to keep in full.' })
}

export function fileReport({ reporterId, kind, targetId, targetUserId = null, reason = '', snapshot = null }) {
  if (!REPORT_KINDS.includes(kind)) throw new Error(`unknown report kind ${kind}`)
  const id = randomUUID()
  const result = db.run(
    `INSERT OR IGNORE INTO reports (id, reporter_id, target_kind, target_id, target_user_id, reason, snapshot, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      reporterId,
      kind,
      String(targetId).slice(0, 120),
      targetUserId,
      String(reason ?? '').trim().slice(0, 300) || null,
      snapshotText(snapshot),
      new Date().toISOString(),
    ],
  )
  return { id: result.changes ? id : null, duplicate: !result.changes }
}

function view(row) {
  let snapshot = null
  try {
    snapshot = row.snapshot ? JSON.parse(row.snapshot) : null
  } catch {
    snapshot = null
  }
  return {
    id: row.id,
    kind: row.target_kind,
    targetId: row.target_id,
    status: row.status,
    reason: row.reason,
    snapshot,
    action: row.action,
    note: row.note,
    createdAt: row.created_at,
    resolvedAt: row.resolved_at,
    reporter: row.reporter_id ? { id: row.reporter_id, username: row.reporter_username, email: row.reporter_email } : null,
    target: row.target_user_id
      ? {
          id: row.target_user_id,
          username: row.target_username,
          email: row.target_email,
          role: row.target_role,
          suspendedUntil: row.target_suspended_until,
          disabled: Boolean(row.target_disabled),
          // Every report against this account, so a pattern is visible at a glance.
          reportsAgainst: row.target_reports,
        }
      : null,
    resolvedBy: row.resolved_by ? { id: row.resolved_by, email: row.resolver_email } : null,
  }
}

const SELECT = `
  SELECT r.*,
    rep.username AS reporter_username, rep.email AS reporter_email,
    t.username AS target_username, t.email AS target_email, t.role AS target_role,
    t.suspended_until AS target_suspended_until, t.disabled AS target_disabled,
    (SELECT COUNT(*) FROM reports x WHERE x.target_user_id = r.target_user_id) AS target_reports,
    res.email AS resolver_email
  FROM reports r
  LEFT JOIN users rep ON rep.id = r.reporter_id
  LEFT JOIN users t ON t.id = r.target_user_id
  LEFT JOIN users res ON res.id = r.resolved_by`

export function listReports({ status = 'open', limit = 50, before = null } = {}) {
  const safeStatus = REPORT_STATUSES.includes(status) ? status : 'open'
  const args = [safeStatus]
  let where = 'r.status = ?'
  if (before) {
    where += ' AND r.created_at < ?'
    args.push(String(before))
  }
  const max = Math.min(100, Math.max(1, Number(limit) || 50))
  // Open reports oldest first, so nothing waits forever; closed ones newest first.
  const order = safeStatus === 'open' ? 'ASC' : 'DESC'
  const rows = db.all(`${SELECT} WHERE ${where} ORDER BY r.created_at ${order} LIMIT ?`, [...args, max + 1])
  return { reports: rows.slice(0, max).map(view), more: rows.length > max }
}

export function getReport(id) {
  const row = db.get(`${SELECT} WHERE r.id = ?`, [String(id)])
  return row ? view(row) : null
}

/** Closes an open report. False when it was not open (already handled). */
export function closeReport(id, { status, action, note, adminId }) {
  const result = db.run(
    "UPDATE reports SET status = ?, action = ?, note = ?, resolved_by = ?, resolved_at = ? WHERE id = ? AND status = 'open'",
    [status, action, note ? String(note).slice(0, 500) : null, adminId, new Date().toISOString(), String(id)],
  )
  return result.changes > 0
}

export function openReportCount() {
  return db.get("SELECT COUNT(*) AS n FROM reports WHERE status = 'open'")?.n ?? 0
}
