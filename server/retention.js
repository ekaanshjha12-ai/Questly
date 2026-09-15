import { db } from './db.js'

/**
 * How long things are kept once nobody needs them, and the sweep that
 * forgets them.
 *
 * Deleting a post or comment hides it at once; the row stays for a while so a
 * report already made about it can still be reviewed, then it is erased for
 * good — text, picture and the comments under it. The security log and closed
 * moderation records are kept long enough to investigate abuse, not forever.
 *
 * Each period can be changed with an environment variable. The Privacy Policy
 * quotes these same numbers, so it never promises something the sweep does
 * not do.
 */

function days(name, fallback, min) {
  const value = Number(process.env[name])
  return Number.isFinite(value) && value >= min ? Math.min(3650, Math.round(value)) : fallback
}

export const RETENTION = {
  deletedContentDays: days('DELETED_CONTENT_RETENTION_DAYS', 30, 1),
  auditLogDays: days('AUDIT_LOG_RETENTION_DAYS', 180, 30),
  reportDays: days('CLOSED_REPORT_RETENTION_DAYS', 365, 30),
  supportDays: days('SUPPORT_RETENTION_DAYS', 365, 30),
}

function tableExists(name) {
  return Boolean(db.get("SELECT 1 AS x FROM sqlite_master WHERE type = 'table' AND name = ?", [name]))
}

/** @returns {Record<string, number>} how many rows of each kind were erased */
export function purgeExpiredRecords(now = Date.now()) {
  const before = (n) => new Date(now - n * 86_400_000).toISOString()
  const contentCutoff = before(RETENTION.deletedContentDays)
  const removed = { posts: 0, comments: 0, clubMessages: 0, auditLog: 0, reports: 0, supportRequests: 0 }

  // Deleted posts, unless a report about them is still waiting. Comments and
  // appreciations go with the post; a video left without a post is removed,
  // file and all, by the hourly video sweep.
  const posts = db.all(
    `SELECT id, image_id FROM posts
     WHERE deleted_at IS NOT NULL AND deleted_at < ?
       AND id NOT IN (SELECT target_id FROM reports WHERE target_kind = 'post' AND status = 'open')`,
    [contentCutoff],
  )
  for (const post of posts) {
    db.run('DELETE FROM posts WHERE id = ?', [post.id])
    if (post.image_id) db.run('DELETE FROM post_images WHERE id = ?', [post.image_id])
    removed.posts++
  }

  if (tableExists('post_comments')) {
    removed.comments = db.run(
      `DELETE FROM post_comments
       WHERE deleted_at IS NOT NULL AND deleted_at < ?
         AND id NOT IN (SELECT target_id FROM reports WHERE target_kind = 'comment' AND status = 'open')`,
      [contentCutoff],
    ).changes
  }
  if (tableExists('club_messages')) {
    removed.clubMessages = db.run('DELETE FROM club_messages WHERE deleted_at IS NOT NULL AND deleted_at < ?', [contentCutoff]).changes
  }

  removed.auditLog = db.run('DELETE FROM audit_log WHERE at < ?', [before(RETENTION.auditLogDays)]).changes
  if (tableExists('reports')) {
    removed.reports = db.run("DELETE FROM reports WHERE status <> 'open' AND resolved_at IS NOT NULL AND resolved_at < ?", [before(RETENTION.reportDays)]).changes
  }
  if (tableExists('support_requests')) {
    removed.supportRequests = db.run("DELETE FROM support_requests WHERE status = 'closed' AND closed_at < ?", [before(RETENTION.supportDays)]).changes
  }
  return removed
}
