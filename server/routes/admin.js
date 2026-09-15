import express from 'express'
import { db } from '../db.js'
import { deriveStatus } from '../challenges.js'
import { productAnalytics, systemHealth } from '../adminmetrics.js'

/**
 * The admin console's moderation and insight routes: posts, comments and
 * duels to review, the security log to search, and the service's health and
 * product analytics. Every route checks the admin role on the server; the
 * console hiding a tab is never what keeps anyone out.
 */
export function adminRoutes({ requireAuth, requireAdmin, rateLimit, audit, notify, adminRemovePost, softDeleteComment, features, retention, lastSweep }) {
  const router = express.Router()
  const throttle = rateLimit({ name: 'admin-console', max: 90, windowMs: 60_000, by: 'user' })
  const guard = [requireAuth, requireAdmin, throttle]
  const PAGE = 40
  const note = (value) => (typeof value === 'string' ? value.trim().slice(0, 300) : '')
  const beforeOf = (value) => (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T[\d:.]+Z$/.test(value) ? value : '9999-12-31T00:00:00.000Z')

  /* --- posts ---------------------------------------------------------------- */

  router.get('/admin/posts', ...guard, (req, res) => {
    const view = ['removed', 'reported'].includes(req.query.view) ? req.query.view : 'live'
    const where =
      view === 'removed'
        ? 'p.deleted_at IS NOT NULL'
        : view === 'reported'
          ? "p.deleted_at IS NULL AND EXISTS (SELECT 1 FROM reports r WHERE r.target_kind = 'post' AND r.target_id = p.id AND r.status = 'open')"
          : 'p.deleted_at IS NULL'
    const rows = db.all(
      `SELECT p.id, p.kind, p.body, p.image_id, p.video_id, p.ref_kind, p.created_at, p.deleted_at,
              u.id AS user_id, u.username, u.email, c.name AS club_name,
              (SELECT COUNT(*) FROM post_comments pc WHERE pc.post_id = p.id AND pc.deleted_at IS NULL) AS comments,
              (SELECT COUNT(*) FROM post_appreciations pa WHERE pa.post_id = p.id) AS appreciations,
              (SELECT COUNT(*) FROM reports r WHERE r.target_kind = 'post' AND r.target_id = p.id AND r.status = 'open') AS open_reports
       FROM posts p JOIN users u ON u.id = p.user_id LEFT JOIN clubs c ON c.id = p.club_id
       WHERE ${where} AND p.created_at < ?
       ORDER BY p.created_at DESC LIMIT ?`,
      [beforeOf(req.query.before), PAGE + 1],
    )
    res.json({
      posts: rows.slice(0, PAGE).map((r) => ({
        id: r.id,
        kind: r.kind,
        body: r.body,
        image: r.image_id && !r.deleted_at ? `/api/posts/images/${r.image_id}` : null,
        hasImage: Boolean(r.image_id),
        hasVideo: Boolean(r.video_id),
        attached: r.ref_kind ?? null,
        club: r.club_name ?? null,
        createdAt: r.created_at,
        removedAt: r.deleted_at,
        author: { id: r.user_id, username: r.username, email: r.email },
        comments: r.comments,
        appreciations: r.appreciations,
        openReports: r.open_reports,
      })),
      more: rows.length > PAGE,
    })
  })

  router.post('/admin/posts/:id/remove', ...guard, (req, res) => {
    const post = db.get('SELECT id, user_id, body FROM posts WHERE id = ? AND deleted_at IS NULL', [String(req.params.id ?? '')])
    if (!post || !adminRemovePost(post.id)) {
      res.status(404).json({ error: 'That post is not live.' })
      return
    }
    const why = note(req.body?.note)
    notify(post.user_id, {
      kind: 'system',
      title: 'One of your posts was removed',
      body: `It broke the Community Guidelines${why ? `: ${why}` : '.'}`,
      link: '/legal/guidelines',
    })
    audit({ userId: req.user.id, email: req.user.email, event: 'admin.remove_post', outcome: 'success', ip: req.ip, detail: `${post.id}${why ? `: ${why}` : ''}` })
    res.json({ ok: true })
  })

  /* --- comments --------------------------------------------------------------- */

  router.get('/admin/comments', ...guard, (req, res) => {
    const rows = db.all(
      `SELECT c.id, c.post_id, c.body, c.created_at, u.id AS user_id, u.username, u.email,
              (SELECT COUNT(*) FROM reports r WHERE r.target_kind = 'comment' AND r.target_id = c.id AND r.status = 'open') AS open_reports
       FROM post_comments c JOIN users u ON u.id = c.user_id
       WHERE c.deleted_at IS NULL AND c.created_at < ?
       ORDER BY c.created_at DESC LIMIT ?`,
      [beforeOf(req.query.before), PAGE + 1],
    )
    res.json({
      comments: rows.slice(0, PAGE).map((r) => ({
        id: r.id,
        postId: r.post_id,
        body: r.body,
        createdAt: r.created_at,
        author: { id: r.user_id, username: r.username, email: r.email },
        openReports: r.open_reports,
      })),
      more: rows.length > PAGE,
    })
  })

  router.post('/admin/comments/:id/remove', ...guard, (req, res) => {
    const comment = db.get('SELECT id, user_id FROM post_comments WHERE id = ? AND deleted_at IS NULL', [String(req.params.id ?? '')])
    if (!comment || !softDeleteComment(comment.id)) {
      res.status(404).json({ error: 'That comment is not live.' })
      return
    }
    const why = note(req.body?.note)
    notify(comment.user_id, {
      kind: 'system',
      title: 'One of your comments was removed',
      body: `It broke the Community Guidelines${why ? `: ${why}` : '.'}`,
      link: '/legal/guidelines',
    })
    audit({ userId: req.user.id, email: req.user.email, event: 'admin.remove_comment', outcome: 'success', ip: req.ip, detail: `${comment.id}${why ? `: ${why}` : ''}` })
    res.json({ ok: true })
  })

  /* --- duels ------------------------------------------------------------------- */

  router.get('/admin/duels', ...guard, (req, res) => {
    const open = req.query.view !== 'recent'
    const rows = db.all(
      `SELECT ch.*, a.username AS creator_username, b.username AS opponent_username
       FROM challenges ch JOIN users a ON a.id = ch.creator_id JOIN users b ON b.id = ch.opponent_id
       WHERE ${open ? "ch.status IN ('pending', 'accepted')" : '1 = 1'} AND ch.created_at < ?
       ORDER BY ch.created_at DESC LIMIT ?`,
      [beforeOf(req.query.before), PAGE + 1],
    )
    const now = Date.now()
    res.json({
      duels: rows.slice(0, PAGE).map((r) => ({
        id: r.id,
        name: r.name,
        objective: r.objective,
        mode: r.mode ?? 'checkin',
        status: deriveStatus(r, now),
        durationDays: r.duration_days,
        rewardXp: r.reward_xp,
        createdAt: r.created_at,
        startsAt: r.starts_at,
        endsAt: r.ends_at,
        creator: { id: r.creator_id, username: r.creator_username },
        opponent: { id: r.opponent_id, username: r.opponent_username },
        cancellable: r.status === 'pending' || r.status === 'accepted',
      })),
      more: rows.length > PAGE,
    })
  })

  router.post('/admin/duels/:id/cancel', ...guard, (req, res) => {
    const duel = db.get('SELECT id, name, creator_id, opponent_id, status FROM challenges WHERE id = ?', [String(req.params.id ?? '')])
    const result = duel
      ? db.run("UPDATE challenges SET status = 'cancelled', completed_at = ? WHERE id = ? AND status IN ('pending', 'accepted')", [new Date().toISOString(), duel.id])
      : { changes: 0 }
    if (!result.changes) {
      res.status(409).json({ error: 'Only a duel that is waiting or running can be cancelled.' })
      return
    }
    const why = note(req.body?.note)
    for (const userId of [duel.creator_id, duel.opponent_id]) {
      notify(userId, {
        kind: 'system',
        title: `"${duel.name}" was cancelled by the Questly team`,
        body: why || 'It did not follow the Community Guidelines. No XP is paid for a cancelled duel.',
        link: '/challenges',
      })
    }
    audit({ userId: req.user.id, email: req.user.email, event: 'admin.cancel_duel', outcome: 'success', ip: req.ip, detail: `${duel.id}${why ? `: ${why}` : ''}` })
    res.json({ ok: true })
  })

  /* --- the security log ------------------------------------------------------------ */

  router.get('/admin/audit', ...guard, (req, res) => {
    const where = []
    const args = []
    const prefix = typeof req.query.prefix === 'string' && /^[a-z_]{2,20}$/.test(req.query.prefix) ? req.query.prefix : null
    if (prefix) {
      where.push('event LIKE ?')
      args.push(`${prefix}.%`)
    }
    if (typeof req.query.event === 'string' && /^[a-z_.]{3,40}$/.test(req.query.event)) {
      where.push('event = ?')
      args.push(req.query.event)
    }
    if (typeof req.query.outcome === 'string' && /^[a-z_]{2,20}$/.test(req.query.outcome)) {
      where.push('outcome = ?')
      args.push(req.query.outcome)
    }
    const q = typeof req.query.q === 'string' ? req.query.q.trim().toLowerCase().slice(0, 80) : ''
    if (q) {
      where.push('(lower(email) LIKE ? OR lower(detail) LIKE ? OR ip = ?)')
      args.push(`%${q}%`, `%${q}%`, q)
    }
    const before = Number(req.query.before)
    if (Number.isInteger(before) && before > 0) {
      where.push('id < ?')
      args.push(before)
    }
    const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 100))
    const rows = db.all(`SELECT * FROM audit_log ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY id DESC LIMIT ?`, [...args, limit + 1])
    res.json({ entries: rows.slice(0, limit), more: rows.length > limit })
  })

  /* --- health and analytics ------------------------------------------------------------ */

  router.get('/admin/system', ...guard, (req, res) => {
    res.json(systemHealth({ features: features(), retention, lastSweep: lastSweep() }))
  })

  router.get('/admin/analytics', ...guard, (req, res) => {
    try {
      res.json(productAnalytics({ force: req.query.force === '1' }))
    } catch (err) {
      console.error('product analytics failed', err)
      res.status(500).json({ error: 'Could not build the analytics.' })
    }
  })

  return router
}
