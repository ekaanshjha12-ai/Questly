import { db } from '../db.js'

/**
 * The Chronicle Log: notifications the server writes when something happens
 * to a player.
 *
 * `dedupeKey` folds repeats into one entry while it is unread — ten messages
 * in one conversation are one line saying so, not ten.
 */

const KEEP_PER_USER = 300

export const NOTIFICATION_KINDS = new Set([
  'quest_completed',
  'achievement',
  'level_up',
  'item_unlocked',
  'streak',
  'challenge_received',
  'challenge_accepted',
  'challenge_rejected',
  'challenge_completed',
  'challenge_expired',
  'club_invitation',
  'club_announcement',
  'club_mandatory',
  'club_joined',
  'club_removed',
  'club_request',
  'message',
  'world_event',
  'system',
])

export function notify(userId, { kind, title, body = null, link = null, data = null, dedupeKey = null }) {
  if (!userId || !NOTIFICATION_KINDS.has(kind)) return
  const now = new Date().toISOString()
  const payload = data ? JSON.stringify(data).slice(0, 2000) : null
  try {
    if (dedupeKey) {
      const existing = db.get(
        'SELECT id FROM notifications WHERE user_id = ? AND dedupe_key = ? AND read_at IS NULL ORDER BY id DESC LIMIT 1',
        [userId, dedupeKey],
      )
      if (existing) {
        db.run('UPDATE notifications SET title = ?, body = ?, link = ?, data = ?, created_at = ? WHERE id = ?', [
          String(title).slice(0, 120),
          body ? String(body).slice(0, 300) : null,
          link,
          payload,
          now,
          existing.id,
        ])
        return
      }
    }
    const result = db.run(
      'INSERT INTO notifications (user_id, kind, title, body, link, data, dedupe_key, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [userId, kind, String(title).slice(0, 120), body ? String(body).slice(0, 300) : null, link, payload, dedupeKey, now],
    )
    // Pruned now and then rather than on every write.
    if (Number(result.lastInsertRowid) % 50 === 0) {
      db.run(
        `DELETE FROM notifications WHERE user_id = ? AND id <= (
           SELECT id FROM notifications WHERE user_id = ? ORDER BY id DESC LIMIT 1 OFFSET ?
         )`,
        [userId, userId, KEEP_PER_USER],
      )
    }
  } catch (err) {
    // A notification failing must never undo the thing it describes.
    console.error('notify failed', err)
  }
}

function view(row) {
  let data = null
  try {
    data = row.data ? JSON.parse(row.data) : null
  } catch {
    data = null
  }
  return {
    id: row.id,
    kind: row.kind,
    title: row.title,
    body: row.body,
    link: row.link,
    data,
    createdAt: row.created_at,
    read: Boolean(row.read_at),
  }
}

export function listNotifications(userId, { before = null, limit = 30 } = {}) {
  const capped = Math.min(100, Math.max(1, limit))
  const rows = before
    ? db.all('SELECT * FROM notifications WHERE user_id = ? AND id < ? ORDER BY id DESC LIMIT ?', [userId, before, capped + 1])
    : db.all('SELECT * FROM notifications WHERE user_id = ? ORDER BY id DESC LIMIT ?', [userId, capped + 1])
  return { notifications: rows.slice(0, capped).map(view), more: rows.length > capped }
}

export function unreadCount(userId) {
  return db.get('SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND read_at IS NULL', [userId])?.n ?? 0
}

/** Marks some or all of a player's notifications read. Ids that are not theirs
 * match nothing, because the owner is part of the condition. */
export function markRead(userId, ids = null) {
  const now = new Date().toISOString()
  if (!ids) {
    db.run('UPDATE notifications SET read_at = ? WHERE user_id = ? AND read_at IS NULL', [now, userId])
    return
  }
  const clean = ids.map(Number).filter((n) => Number.isSafeInteger(n) && n > 0).slice(0, 200)
  if (!clean.length) return
  db.run(
    `UPDATE notifications SET read_at = ? WHERE user_id = ? AND read_at IS NULL AND id IN (${clean.map(() => '?').join(',')})`,
    [now, userId, ...clean],
  )
}
