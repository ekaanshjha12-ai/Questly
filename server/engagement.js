import { db } from './db.js'

/**
 * How players respond to each other's posts: appreciation and comments.
 *
 * There are no followers and no public like counts to chase — appreciation is
 * a quiet nod from one player to another, and comments are a conversation
 * under a post. Both are checked like everything else people write: filtered,
 * limited, hidden across blocks, removable by whoever should be able to.
 */

db.run(`
  CREATE TABLE IF NOT EXISTS post_appreciations (
    post_id    TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL,
    PRIMARY KEY (post_id, user_id)
  )
`)

db.run(`
  CREATE TABLE IF NOT EXISTS post_comments (
    id         TEXT PRIMARY KEY,
    post_id    TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    body       TEXT NOT NULL,
    created_at TEXT NOT NULL,
    deleted_at TEXT
  )
`)
db.run('CREATE INDEX IF NOT EXISTS idx_post_comments_post ON post_comments(post_id, created_at)')
db.run('CREATE INDEX IF NOT EXISTS idx_post_comments_user ON post_comments(user_id, created_at)')

// What a post is about, when it is about something the server can vouch for:
// a completed quest, a duel result, an achievement, a focus session.
for (const column of ['ref_kind TEXT', 'ref_id TEXT', 'ref_data TEXT']) {
  try {
    db.run(`ALTER TABLE posts ADD COLUMN ${column}`)
  } catch {
    // Already present.
  }
}

export const COMMENT_MAX = 500

export function setAppreciation(postId, userId, on) {
  if (on) {
    db.run('INSERT OR IGNORE INTO post_appreciations (post_id, user_id, created_at) VALUES (?, ?, ?)', [postId, userId, new Date().toISOString()])
  } else {
    db.run('DELETE FROM post_appreciations WHERE post_id = ? AND user_id = ?', [postId, userId])
  }
  return appreciationFor(postId, userId)
}

export function appreciationFor(postId, viewerId) {
  const count = db.get('SELECT COUNT(*) AS n FROM post_appreciations WHERE post_id = ?', [postId])?.n ?? 0
  const mine = viewerId ? Boolean(db.get('SELECT 1 AS x FROM post_appreciations WHERE post_id = ? AND user_id = ?', [postId, viewerId])) : false
  return { count, mine }
}

export function countRecentAppreciations(userId, sinceIso) {
  return db.get('SELECT COUNT(*) AS n FROM post_appreciations WHERE user_id = ? AND created_at > ?', [userId, sinceIso])?.n ?? 0
}

export function commentCount(postId) {
  return db.get('SELECT COUNT(*) AS n FROM post_comments WHERE post_id = ? AND deleted_at IS NULL', [postId])?.n ?? 0
}

export function insertComment({ id, postId, userId, body }) {
  db.run('INSERT INTO post_comments (id, post_id, user_id, body, created_at) VALUES (?, ?, ?, ?, ?)', [id, postId, userId, body, new Date().toISOString()])
}

export function getComment(id) {
  return db.get('SELECT * FROM post_comments WHERE id = ? AND deleted_at IS NULL', [String(id)]) ?? null
}

/** Oldest first, so a thread reads top to bottom; `after` pages forward. */
export function listComments(postId, { after = null, limit = 50 } = {}) {
  const rows = after
    ? db.all(
        `SELECT c.*, u.username, u.display_name, u.disabled FROM post_comments c JOIN users u ON u.id = c.user_id
         WHERE c.post_id = ? AND c.deleted_at IS NULL AND c.created_at > ? ORDER BY c.created_at LIMIT ?`,
        [postId, after, limit + 1],
      )
    : db.all(
        `SELECT c.*, u.username, u.display_name, u.disabled FROM post_comments c JOIN users u ON u.id = c.user_id
         WHERE c.post_id = ? AND c.deleted_at IS NULL ORDER BY c.created_at LIMIT ?`,
        [postId, limit + 1],
      )
  return { rows: rows.slice(0, limit), more: rows.length > limit }
}

export function softDeleteComment(id) {
  const result = db.run('UPDATE post_comments SET deleted_at = ? WHERE id = ? AND deleted_at IS NULL', [new Date().toISOString(), String(id)])
  return result.changes > 0
}

export function countRecentComments(userId, sinceIso) {
  return db.get('SELECT COUNT(*) AS n FROM post_comments WHERE user_id = ? AND created_at > ?', [userId, sinceIso])?.n ?? 0
}

export function setPostRef(postId, ref) {
  db.run('UPDATE posts SET ref_kind = ?, ref_id = ?, ref_data = ? WHERE id = ?', [ref.kind, ref.id, JSON.stringify(ref.data), postId])
}

/** Whether this player already has a live post about the same thing. */
export function findPostWithRef(userId, kind, id) {
  return db.get('SELECT id FROM posts WHERE user_id = ? AND ref_kind = ? AND ref_id = ? AND deleted_at IS NULL', [userId, kind, id]) ?? null
}
