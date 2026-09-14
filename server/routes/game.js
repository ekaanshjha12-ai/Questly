import express from 'express'
import { db } from '../db.js'
import {
  achievementsFor,
  FOCUS_DAILY_XP,
  getProgressRow,
  ledgerPage,
  paidToday,
  progressView,
  SELF_REPORTED_DAILY_XP,
  startRewards,
  transaction,
} from '../game/rewards.js'
import { markActive, track } from '../game/analytics.js'
import { isValidTimezone } from '../game/clock.js'
import { GameError, invalid } from '../game/errors.js'
import {
  abandonSession,
  currentSession,
  finishSession,
  focusTotals,
  hideSession,
  pauseSession,
  resumeSession,
  sessionHistory,
  startSession,
  updatePlan,
} from '../game/focus.js'
import { buyItem, equipItem, inventoryView, publicLook, setAppearance } from '../game/inventory.js'
import { ensureGame } from '../game/migrate.js'
import { listNotifications, markRead, unreadCount } from '../game/notify.js'
import {
  abandonQuest,
  completeQuest,
  createPlanQuests,
  createQuest,
  deleteQuest,
  featuredQuest,
  getQuestView,
  logProgress,
  pinQuest,
  questBoard,
  questHistory,
  setMilestone,
  startQuest,
  updateQuest,
} from '../game/quests.js'
import { ensurePeriodicQuests, refreshGoalQuests } from '../game/slate.js'
import { activitySeries, progressStats } from '../game/stats.js'
import { onboardingSteps, PATHS, setFlag } from '../game/onboarding.js'

/**
 * Routes for everything a player earns: progress, quests, focus sessions,
 * inventory, achievements and the Chronicle Log.
 *
 * Every route acts on the signed-in account only. Ids in paths are looked up
 * together with the owner, so another player's quest or session is simply not
 * found — there is no id anyone can change to reach someone else's.
 */

/** How often a player may move their day to a different timezone. */
const TIMEZONE_COOLDOWN_MS = 6 * 3_600_000

export function sendGameError(res, err) {
  if (err instanceof GameError) {
    res.status(err.status).json({ error: err.message, code: err.code, ...(err.extra ?? {}) })
    return
  }
  console.error('game route failed', err)
  res.status(500).json({ error: 'Something went wrong on our side. Try again in a moment.' })
}

function capsFor(userId) {
  const progress = getProgressRow(userId)
  const view = progressView(progress)
  return {
    focusXpLeft: Math.max(0, FOCUS_DAILY_XP - paidToday(userId, view.today, ['focus'])),
    selfReportedXpLeft: Math.max(0, SELF_REPORTED_DAILY_XP - paidToday(userId, view.today, ['quest', 'quest_step'], { selfReportedOnly: true })),
    focusXpDaily: FOCUS_DAILY_XP,
    selfReportedXpDaily: SELF_REPORTED_DAILY_XP,
  }
}

export function gameRoutes({ requireAuth, rateLimit }) {
  const router = express.Router()
  const read = rateLimit({ name: 'game-read', max: 300, windowMs: 60_000, by: 'user' })
  const write = rateLimit({ name: 'game-write', max: 120, windowMs: 60_000, by: 'user' })
  const creating = rateLimit({ name: 'quest-create', max: 30, windowMs: 60 * 60_000, by: 'user' })

  /** Makes sure the account has game rows, carrying over old progress once. */
  const game = (req, _res, next) => {
    try {
      ensureGame(req.user.id, req.get('x-timezone'))
      markActive(req.user.id)
      next()
    } catch (err) {
      next(err)
    }
  }

  const handle = (fn) => (req, res) => {
    try {
      const out = fn(req, res)
      if (out !== undefined && !res.headersSent) res.json(out)
    } catch (err) {
      sendGameError(res, err)
    }
  }

  /* --- the whole picture, for app start --------------------------------- */

  router.get('/game', requireAuth, read, game, handle((req) => {
    const userId = req.user.id
    ensurePeriodicQuests(userId)
    const board = questBoard(userId)
    const unlocked = achievementsFor(userId).filter((a) => a.unlockedAt)
    const progress = progressView(getProgressRow(userId))
    const onboarding = onboardingSteps(userId)
    // Finishing the first quests is worth the Drafting Quill; settle it the
    // moment the checklist completes.
    if (onboarding.complete && !progress.flags.onboardingDone) {
      transaction(() => {
        setFlag(userId, 'onboardingDone', true)
        startRewards(userId).finish()
      })
    }
    return {
      progress: progressView(getProgressRow(userId)),
      todayXp: db.get('SELECT COALESCE(SUM(xp), 0) AS n FROM xp_ledger WHERE user_id = ? AND day = ? AND xp > 0', [userId, progress.today])?.n ?? 0,
      onboarding,
      focus: currentSession(userId),
      focusTotals: focusTotals(userId),
      quests: board,
      featuredQuestId: featuredQuest(board)?.id ?? null,
      look: publicLook(userId),
      notifications: { unread: unreadCount(userId) },
      caps: capsFor(userId),
      achievements: {
        unlocked: unlocked.length,
        total: achievementsFor(userId).length,
        recent: unlocked.sort((a, b) => Date.parse(b.unlockedAt) - Date.parse(a.unlockedAt)).slice(0, 3),
      },
    }
  }))

  router.put('/game/timezone', requireAuth, write, game, handle((req) => {
    const timezone = req.body?.timezone
    if (!isValidTimezone(timezone)) throw invalid('That timezone is not recognised.', 'timezone')
    const row = getProgressRow(req.user.id)
    if (row.timezone !== timezone) {
      const last = row.timezone_set_at ? Date.parse(row.timezone_set_at) : 0
      if (Date.now() - last < TIMEZONE_COOLDOWN_MS) {
        throw new GameError(429, 'Your timezone changed recently. It will update in a few hours.', 'timezone_cooldown')
      }
      db.run('UPDATE player_progress SET timezone = ?, timezone_set_at = ?, updated_at = ? WHERE user_id = ?', [
        timezone,
        new Date().toISOString(),
        new Date().toISOString(),
        req.user.id,
      ])
    }
    return { progress: progressView(getProgressRow(req.user.id)) }
  }))

  router.put('/game/appearance', requireAuth, write, game, handle((req) => {
    const appearance = setAppearance(req.user.id, req.body?.appearance)
    setFlag(req.user.id, 'appearanceSet', true)
    return { appearance }
  }))

  // The path chosen at the start. Changeable; the first choice is what
  // counts as finishing onboarding.
  router.put('/game/path', requireAuth, write, game, handle((req) => {
    const path = String(req.body?.path ?? '')
    if (!PATHS.includes(path)) throw invalid('Choose one of the five paths.', 'path')
    const first = !progressView(getProgressRow(req.user.id)).flags.path
    setFlag(req.user.id, 'path', path)
    if (first) track(req.user.id, 'onboarding_completed', { path })
    return { path }
  }))

  router.get('/progress/history', requireAuth, read, game, handle((req) =>
    ledgerPage(req.user.id, { before: Number(req.query.before) || null, limit: Number(req.query.limit) || 30 }),
  ))

  router.get('/progress/stats', requireAuth, read, game, handle((req) => progressStats(req.user.id)))
  router.get('/progress/activity', requireAuth, read, game, handle((req) => activitySeries(req.user.id, Number(req.query.days) || 84)))

  router.get('/achievements', requireAuth, read, game, handle((req) => ({ achievements: achievementsFor(req.user.id) })))

  /* --- quests --------------------------------------------------------------- */

  router.get('/quests', requireAuth, read, game, handle((req) => {
    ensurePeriodicQuests(req.user.id)
    const board = questBoard(req.user.id)
    return { quests: board, featuredQuestId: featuredQuest(board)?.id ?? null, caps: capsFor(req.user.id) }
  }))

  router.get('/quests/history', requireAuth, read, game, handle((req) =>
    questHistory(req.user.id, { before: typeof req.query.before === 'string' ? req.query.before : null }),
  ))

  router.post('/quests', requireAuth, creating, game, handle((req, res) => {
    res.status(201)
    return { quest: createQuest(req.user.id, req.body ?? {}) }
  }))

  // A whole plan counts as one creation against the hourly limit.
  router.post('/quests/plan', requireAuth, creating, game, handle((req, res) => {
    res.status(201)
    return { quests: createPlanQuests(req.user.id, req.body?.items) }
  }))

  router.post('/quests/refresh-goal', requireAuth, write, game, handle((req) => {
    const goalId = String(req.body?.goalId ?? '')
    if (!/^[\w-]{1,64}$/.test(goalId)) throw invalid('That goal could not be found.', 'goalId')
    refreshGoalQuests(req.user.id, goalId)
    return { ok: true }
  }))

  router.get('/quests/:id', requireAuth, read, game, handle((req) => ({ quest: getQuestView(req.user.id, req.params.id) })))
  router.patch('/quests/:id', requireAuth, write, game, handle((req) => ({ quest: updateQuest(req.user.id, req.params.id, req.body ?? {}) })))
  router.delete('/quests/:id', requireAuth, write, game, handle((req, res) => {
    deleteQuest(req.user.id, req.params.id)
    res.status(204).end()
  }))
  router.post('/quests/:id/start', requireAuth, write, game, handle((req) => ({ quest: startQuest(req.user.id, req.params.id) })))
  router.post('/quests/:id/pin', requireAuth, write, game, handle((req) => ({ quest: pinQuest(req.user.id, req.params.id, req.body?.pinned !== false) })))
  router.post('/quests/:id/complete', requireAuth, write, game, handle((req) => completeQuest(req.user.id, req.params.id)))
  router.post('/quests/:id/progress', requireAuth, write, game, handle((req) => logProgress(req.user.id, req.params.id, req.body?.delta)))
  router.post('/quests/:id/milestones/:index', requireAuth, write, game, handle((req) =>
    setMilestone(req.user.id, req.params.id, req.params.index, req.body?.done !== false),
  ))
  router.post('/quests/:id/abandon', requireAuth, write, game, handle((req) => ({ quest: abandonQuest(req.user.id, req.params.id) })))

  /* --- focus ---------------------------------------------------------------- */

  router.get('/focus/current', requireAuth, read, game, handle((req) => ({ session: currentSession(req.user.id) })))
  router.get('/focus/history', requireAuth, read, game, handle((req) => ({
    ...sessionHistory(req.user.id, { before: typeof req.query.before === 'string' ? req.query.before : null }),
    totals: focusTotals(req.user.id),
  })))
  router.post('/focus', requireAuth, write, game, handle((req, res) => {
    res.status(201)
    return { session: startSession(req.user.id, req.body ?? {}) }
  }))
  router.post('/focus/:id/pause', requireAuth, write, game, handle((req) => ({ session: pauseSession(req.user.id, req.params.id) })))
  router.post('/focus/:id/resume', requireAuth, write, game, handle((req) => ({ session: resumeSession(req.user.id, req.params.id) })))
  router.post('/focus/:id/finish', requireAuth, write, game, handle((req) => finishSession(req.user.id, req.params.id)))
  router.post('/focus/:id/abandon', requireAuth, write, game, handle((req) => ({ session: abandonSession(req.user.id, req.params.id) })))
  router.put('/focus/:id/plan', requireAuth, write, game, handle((req) => ({ session: updatePlan(req.user.id, req.params.id, req.body?.plan) })))
  router.delete('/focus/:id', requireAuth, write, game, handle((req, res) => {
    hideSession(req.user.id, req.params.id)
    res.status(204).end()
  }))

  /* --- inventory ------------------------------------------------------------ */

  router.get('/inventory', requireAuth, read, game, handle((req) => ({
    ...inventoryView(req.user.id),
    appearance: publicLook(req.user.id).appearance,
  })))
  router.post('/inventory/equip', requireAuth, write, game, handle((req) => ({ equipment: equipItem(req.user.id, req.body?.slot, req.body?.itemId) })))
  router.post('/inventory/buy', requireAuth, write, game, handle((req) => buyItem(req.user.id, req.body?.itemId)))

  /* --- the Chronicle Log ---------------------------------------------------- */

  router.get('/notifications', requireAuth, read, game, handle((req) => ({
    ...listNotifications(req.user.id, { before: Number(req.query.before) || null, limit: Number(req.query.limit) || 30 }),
    unread: unreadCount(req.user.id),
  })))
  router.get('/notifications/unread', requireAuth, read, handle((req) => ({ unread: unreadCount(req.user.id) })))
  router.post('/notifications/read', requireAuth, write, handle((req) => {
    const ids = Array.isArray(req.body?.ids) ? req.body.ids : null
    markRead(req.user.id, ids)
    return { unread: unreadCount(req.user.id) }
  }))

  return router
}
