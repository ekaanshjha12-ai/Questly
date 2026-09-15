import express from 'express'
import { findUserById } from '../db.js'
import {
  adminListClubs,
  adminSetArchived,
  beginTrials,
  checkInChallenge,
  closeClub,
  clubLeaderboard,
  clubView,
  completeTrials,
  createChallenge,
  createClub,
  deleteClubMessage,
  inviteToClub,
  joinChallenge,
  leaveClub,
  listChallenges,
  listClubMessages,
  listClubs,
  loadClub,
  postClubMessage,
  removeMember,
  setRole,
  setTrials,
  updateClub,
  canModeratePost,
  isClubMember,
} from '../game/clubs.js'
import { GameError, notFound } from '../game/errors.js'
import { sendGameError } from './game.js'

/**
 * Club routes. Every permission is decided in game/clubs.js from the club's own
 * membership rows, read fresh on each request — hiding a button is never what
 * stops anyone. Helpers that live with the rest of the social code (who has
 * blocked whom, how a message is screened, how a post is shown) are passed in.
 */
export function clubRoutes({
  requireAuth,
  requireAdmin,
  rateLimit,
  publicLook,
  findUserRowByUsername,
  isBlockedEitherWay,
  listFeed,
  postView,
  screenGroupMessage,
  fileReport,
  audit,
  softDeleteAnyPost,
  getPost,
}) {
  const router = express.Router()
  const read = rateLimit({ name: 'club-read', max: 240, windowMs: 60_000, by: 'user' })
  const write = rateLimit({ name: 'club-write', max: 60, windowMs: 60_000, by: 'user' })
  const founding = rateLimit({ name: 'club-create', max: 5, windowMs: 24 * 60 * 60_000, by: 'user' })

  const handle = (fn) => (req, res) => {
    try {
      const out = fn(req, res)
      if (out !== undefined && !res.headersSent) res.json(out)
    } catch (err) {
      sendGameError(res, err)
    }
  }

  /** Clubs are social: an account needs its profile, as for the feed and messages. */
  const profile = (req, res, next) => {
    const user = findUserById(req.user.id)
    if (!user?.username || !user?.birthdate) {
      res.status(403).json({ error: 'Finish your profile first.', code: 'profile_incomplete' })
      return
    }
    next()
  }

  const lookFor = (userId) => publicLook(userId)
  const target = (username) => {
    const row = findUserRowByUsername(String(username ?? '').replace(/^@+/, '').toLowerCase())
    if (!row || row.disabled) throw notFound('That player')
    return row
  }

  /* --- finding and founding ------------------------------------------------ */

  router.get('/clubs', requireAuth, read, handle((req) => ({
    clubs: listClubs(req.user.id, {
      q: typeof req.query.q === 'string' ? req.query.q : '',
      region: typeof req.query.region === 'string' ? req.query.region : null,
      mine: req.query.mine === '1',
    }),
  })))

  router.post('/clubs', requireAuth, profile, founding, handle((req, res) => {
    const club = createClub(req.user.id, req.body ?? {})
    audit({ userId: req.user.id, email: req.user.email, event: 'club.create', outcome: 'success', ip: req.ip, detail: club.id })
    res.status(201)
    return { club: clubView(req.user.id, club.slug, { lookFor }) }
  }))

  router.get('/clubs/:slug', requireAuth, read, handle((req) => ({ club: clubView(req.user.id, req.params.slug, { lookFor }) })))

  router.patch('/clubs/:slug', requireAuth, profile, write, handle((req) => {
    updateClub(req.user.id, req.params.slug, req.body ?? {})
    return { club: clubView(req.user.id, req.params.slug, { lookFor }) }
  }))

  router.put('/clubs/:slug/trials', requireAuth, profile, write, handle((req) => {
    setTrials(req.user.id, req.params.slug, req.body?.trials)
    return { club: clubView(req.user.id, req.params.slug, { lookFor }) }
  }))

  router.post('/clubs/:slug/close', requireAuth, write, handle((req) => {
    closeClub(req.user.id, req.params.slug)
    return { ok: true }
  }))

  /* --- the way in ----------------------------------------------------------- */

  router.post('/clubs/:slug/trials/begin', requireAuth, profile, write, handle((req) => ({ club: beginTrials(req.user.id, req.params.slug) })))
  router.post('/clubs/:slug/trials/complete', requireAuth, profile, write, handle((req) => ({ club: completeTrials(req.user.id, req.params.slug) })))

  router.post('/clubs/:slug/leave', requireAuth, write, handle((req) => {
    leaveClub(req.user.id, req.params.slug)
    return { club: clubView(req.user.id, req.params.slug, { lookFor }) }
  }))

  /* --- members ------------------------------------------------------------------ */

  router.get('/clubs/:slug/leaderboard', requireAuth, read, handle((req) => ({
    leaderboard: clubLeaderboard(req.params.slug, { lookFor, viewerId: req.user.id }),
  })))

  router.post('/clubs/:slug/members/:username/remove', requireAuth, write, handle((req) => {
    const who = target(req.params.username)
    removeMember(req.user.id, req.params.slug, who.id, typeof req.body?.reason === 'string' ? req.body.reason : '')
    audit({ userId: req.user.id, email: req.user.email, event: 'club.remove_member', outcome: 'success', ip: req.ip, detail: `${req.params.slug} ${who.id}` })
    return { leaderboard: clubLeaderboard(req.params.slug, { lookFor, viewerId: req.user.id }) }
  }))

  router.post('/clubs/:slug/members/:username/role', requireAuth, write, handle((req) => {
    const who = target(req.params.username)
    setRole(req.user.id, req.params.slug, who.id, req.body?.role)
    return { leaderboard: clubLeaderboard(req.params.slug, { lookFor, viewerId: req.user.id }) }
  }))

  router.post('/clubs/:slug/invite', requireAuth, profile, write, handle((req) => {
    const who = target(req.body?.username)
    if (who.id === req.user.id) throw new GameError(400, 'That is you.', 'self')
    if (isBlockedEitherWay(req.user.id, who.id)) throw notFound('That player')
    inviteToClub(req.user.id, req.params.slug, who)
    return { ok: true }
  }))

  /* --- challenges ------------------------------------------------------------------ */

  router.get('/clubs/:slug/challenges', requireAuth, read, handle((req) => ({ challenges: listChallenges(req.user.id, req.params.slug) })))

  router.post('/clubs/:slug/challenges', requireAuth, profile, write, handle((req, res) => {
    res.status(201)
    return { challenge: createChallenge(req.user.id, req.params.slug, req.body ?? {}) }
  }))

  router.post('/clubs/:slug/challenges/:id/join', requireAuth, profile, write, handle((req) => ({ challenge: joinChallenge(req.user.id, req.params.slug, req.params.id) })))
  router.post('/clubs/:slug/challenges/:id/checkin', requireAuth, profile, write, handle((req) => ({ challenge: checkInChallenge(req.user.id, req.params.slug, req.params.id) })))

  /* --- chat ---------------------------------------------------------------------------- */

  router.get('/clubs/:slug/messages', requireAuth, read, handle((req) => ({
    messages: listClubMessages(req.user.id, req.params.slug, Math.max(0, Number(req.query.after) || 0), {
      hidden: (authorId) => isBlockedEitherWay(req.user.id, authorId),
    }),
  })))

  router.post('/clubs/:slug/messages', requireAuth, profile, write, (req, res) => {
    try {
      const club = loadClub(req.params.slug)
      if (!isClubMember(req.user.id, club.id)) throw new GameError(403, 'Only members can write in the club chat.', 'members_only')
      const body = screenGroupMessage(req, res, `club ${club.id}`)
      if (body === null) return
      const id = postClubMessage(req.user.id, req.params.slug, body)
      const user = findUserById(req.user.id)
      res.status(201).json({
        message: { id, body, at: new Date().toISOString(), mine: true, author: { username: user.username, name: String(user.display_name ?? user.username).slice(0, 40) } },
      })
    } catch (err) {
      sendGameError(res, err)
    }
  })

  router.delete('/clubs/:slug/messages/:id', requireAuth, write, handle((req, res) => {
    deleteClubMessage(req.user.id, req.params.slug, req.params.id)
    res.status(204).end()
  }))

  /* --- the club feed ------------------------------------------------------------------ */

  router.get('/clubs/:slug/feed', requireAuth, read, handle((req) => {
    const club = loadClub(req.params.slug)
    const before = typeof req.query.before === 'string' ? req.query.before : null
    const rows = listFeed({ before, limit: 20, clubId: club.id })
    const visible = rows.filter((row) => row.user_id === req.user.id || !isBlockedEitherWay(req.user.id, row.user_id)).slice(0, 20)
    return { posts: visible.map((row) => postView(row, req.user.id)), more: rows.length >= 20 }
  }))

  router.delete('/clubs/:slug/posts/:id', requireAuth, write, handle((req, res) => {
    const club = loadClub(req.params.slug)
    const post = getPost(String(req.params.id ?? ''))
    if (!post || post.club_id !== club.id) throw notFound('That post')
    if (post.user_id !== req.user.id && !canModeratePost(req.user.id, club.id)) throw new GameError(403, 'Only club leaders can remove other people’s posts.', 'forbidden')
    softDeleteAnyPost(post.id)
    audit({ userId: req.user.id, email: req.user.email, event: 'club.remove_post', outcome: 'success', ip: req.ip, detail: `${club.id} ${post.id}` })
    res.status(204).end()
  }))

  router.post('/clubs/:slug/report', requireAuth, profile, write, handle((req) => {
    const club = loadClub(req.params.slug)
    const reason = String(req.body?.reason ?? '').trim().slice(0, 300)
    fileReport({ reporterId: req.user.id, kind: 'club', targetId: club.id, targetUserId: club.owner_id, reason, snapshot: { name: club.name, description: club.description, rules: club.rules, slug: club.slug } })
    audit({ userId: req.user.id, email: req.user.email, event: 'social.report_club', outcome: 'filed', ip: req.ip, detail: `${club.id}: ${reason || 'no reason given'}` })
    return { ok: true }
  }))

  /* --- platform admin ---------------------------------------------------------------- */

  router.get('/admin/clubs', requireAuth, requireAdmin, read, handle(() => ({ clubs: adminListClubs() })))

  router.post('/admin/clubs/:id/archive', requireAuth, requireAdmin, write, handle((req) => {
    const club = adminSetArchived(req.params.id, req.body?.archived !== false)
    audit({ userId: req.user.id, email: req.user.email, event: 'admin.club_archive', outcome: req.body?.archived === false ? 'restored' : 'archived', ip: req.ip, detail: club.id })
    return { clubs: adminListClubs() }
  }))

  return router
}
