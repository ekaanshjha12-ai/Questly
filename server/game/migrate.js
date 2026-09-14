import { db, findUserById, getState } from '../db.js'
import { ACHIEVEMENT_IDS } from './achievements.js'
import { dayKey, isValidTimezone, periodEndForKey, safeTimezone } from './clock.js'
import { defaultAppearance, grantStarterGear } from './inventory.js'
import { findItem } from './items.js'
import { levelFromXp } from './levels.js'
import { notify } from './notify.js'
import { rarityFor } from './quests.js'
import { getProgressRow, startRewards, transaction } from './rewards.js'
import { GOAL_CATEGORIES } from './templates.js'

/**
 * Moves an account onto server-kept progress, once.
 *
 * Runs the first time an account touches the game after this shipped. What the
 * old document held is taken as given — it passed the old anti-cheat bounds —
 * and becomes an opening balance. Everything that already paid out is recorded
 * as settled, so carrying it over can never pay it a second time. The document
 * itself is backed up untouched before anything is read from it.
 */

const PERIOD_SHAPE = {
  daily: { type: 'daily', durationMin: 20, difficulty: 'easy', xp: 15 },
  weekly: { type: 'side', durationMin: 90, difficulty: 'normal', xp: 60 },
  monthly: { type: 'main', durationMin: 240, difficulty: 'hard', xp: 200 },
}

const num = (value) => (Number.isFinite(Number(value)) ? Number(value) : 0)
const isoOr = (value, fallback) => {
  const at = Date.parse(String(value ?? ''))
  return Number.isFinite(at) ? new Date(at).toISOString() : fallback
}
const text = (value, max) => String(value ?? '').trim().replace(/\s+/g, ' ').slice(0, max)
const safeId = (value) => (typeof value === 'string' && value.length >= 1 && value.length <= 160 ? value : null)

function carryOver(userId, state, user, tz) {
  const rewards = startRewards(userId, { quiet: true })
  const now = new Date().toISOString()

  // --- balance -------------------------------------------------------------
  // Challenge rewards the old flow had granted but the client had not yet
  // added in are part of what was earned.
  const xp = Math.max(0, Math.round(num(state?.player?.xp))) + Math.max(0, Math.round(num(user?.xp_allowance)))
  const coins = Math.max(0, Math.round(num(state?.player?.coins)))
  if (xp || coins) {
    rewards.pay({ source: 'legacy', sourceId: 'opening-balance', xp, coins, label: 'Progress carried over' })
  }
  // Levels already reached do not pay their coins again.
  for (let level = 2; level <= levelFromXp(xp); level += 1) rewards.reserve('level_reward', String(level))

  const streak = state?.streak
  if (streak && /^\d{4}-\d{2}-\d{2}$/.test(String(streak.lastCompletedDay ?? ''))) {
    db.run('UPDATE player_progress SET streak_current = ?, streak_longest = ?, streak_last_day = ? WHERE user_id = ?', [
      Math.max(0, Math.round(num(streak.current))),
      Math.max(0, Math.round(num(streak.longest)), Math.round(num(streak.current))),
      streak.lastCompletedDay,
      userId,
    ])
  }

  // --- achievements ----------------------------------------------------------
  for (const [id, at] of Object.entries(state?.unlockedAchievements ?? {})) {
    if (!ACHIEVEMENT_IDS.has(id)) continue
    db.run('INSERT OR IGNORE INTO user_achievements (user_id, achievement_id, unlocked_at) VALUES (?, ?, ?)', [userId, id, isoOr(at, now)])
    rewards.reserve('achievement', id)
  }

  // --- generated quests ----------------------------------------------------
  const goals = new Map((Array.isArray(state?.goals) ? state.goals : []).map((g) => [g?.id, g]))
  for (const q of (Array.isArray(state?.quests) ? state.quests : []).slice(0, 20_000)) {
    const id = safeId(q?.id)
    const shape = PERIOD_SHAPE[q?.period]
    if (!id || !shape || typeof q.periodKey !== 'string') continue
    const goalId = safeId(q.goalId)
    const index = Number(/-(\d+)$/.exec(id)?.[1] ?? 0)
    const reward = Math.min(1000, Math.max(0, Math.round(num(q.xp)))) || shape.xp
    const completed = Boolean(q.completed)
    const category = GOAL_CATEGORIES.includes(goals.get(goalId)?.category) ? goals.get(goalId).category : 'general'
    const inserted = db.run(
      `INSERT OR IGNORE INTO quests (id, user_id, type, origin, gen_key, goal_id, period, period_key, title, description, category, difficulty,
         duration_min, xp_reward, rarity, progress_kind, progress_target, progress_value, status, deadline_at, created_at, completed_at, updated_at,
         xp_paid, verified_by, verified_at, verification_note)
       VALUES (?, ?, ?, 'generated', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'check', 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id, userId, shape.type, `${goalId}|${q.period}|${q.periodKey}|${index}`, goalId, q.period, q.periodKey,
        text(q.title, 160) || 'Quest', goals.get(goalId)?.title ? `For your goal: ${text(goals.get(goalId).title, 200)}` : null,
        category, shape.difficulty, shape.durationMin, reward, rarityFor(reward), completed ? 1 : 0,
        completed ? 'completed' : 'active', periodEndForKey(q.period, q.periodKey, tz), now,
        completed ? isoOr(q.completedAt, now) : null, now, completed ? reward : 0,
        q.verifiedBy === 'photo' || q.verifiedBy === 'voice' ? q.verifiedBy : null,
        q.verifiedBy ? isoOr(q.verifiedAt, now) : null, q.verifiedBy ? text(q.verificationNote, 300) || null : null,
      ],
    )
    if (inserted.changes && completed) rewards.reserve('quest', id)
    if (inserted.changes && q.verifiedBy) rewards.reserve('quest_verify', id)
  }

  // --- to-dos become optional quests ----------------------------------------
  for (const t of (Array.isArray(state?.todos) ? state.todos : []).slice(0, 5000)) {
    const id = safeId(t?.id)
    const title = text(t?.title, 160)
    if (!id || !title) continue
    const done = Boolean(t.done)
    const inserted = db.run(
      `INSERT OR IGNORE INTO quests (id, user_id, type, origin, title, category, difficulty, duration_min, xp_reward, rarity, progress_kind,
         progress_target, progress_value, status, created_at, completed_at, updated_at, xp_paid)
       VALUES (?, ?, 'optional', 'legacy_todo', ?, 'general', 'easy', 15, 10, 'common', 'check', 1, ?, ?, ?, ?, ?, ?)`,
      [id, userId, title, done ? 1 : 0, done ? 'completed' : 'active', isoOr(t.createdAt, now), done ? isoOr(t.completedAt, now) : null, now, done ? 10 : 0],
    )
    if (inserted.changes && done) rewards.reserve('quest', id)
  }

  // --- focus sessions ----------------------------------------------------------
  for (const s of (Array.isArray(state?.sessions) ? state.sessions : []).slice(0, 20_000)) {
    const id = safeId(s?.id)
    if (!id) continue
    const activeMs = Math.min(24 * 3_600_000, Math.max(0, Math.round(num(s.durationMs))))
    const endedAt = isoOr(s.endedAt, now)
    const legacyXp = activeMs < 1000 ? 0 : Math.min(120, Math.max(1, Math.round(activeMs / 60_000)))
    const inserted = db.run(
      `INSERT OR IGNORE INTO focus_sessions (id, user_id, goal_id, label, kind, target_ms, status, started_at, ended_at, active_ms, xp, plan, legacy, day)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`,
      [
        id, userId, safeId(s.goalId), text(s.label, 80) || 'Focus session', s.kind === 'stopwatch' ? 'stopwatch' : 'timer',
        Number.isFinite(Number(s.targetMs)) && s.targetMs ? Math.round(Number(s.targetMs)) : null,
        s.completed ? 'completed' : 'ended', isoOr(s.startedAt, endedAt), endedAt, activeMs, legacyXp,
        Array.isArray(s.plan) ? JSON.stringify(s.plan.slice(0, 12)) : null, dayKey(tz, new Date(endedAt)),
      ],
    )
    if (inserted.changes) rewards.reserve('focus', id)
  }

  // --- characters that were bought ----------------------------------------------
  const unlocked = Array.isArray(state?.collection?.unlocked) ? state.collection.unlocked : []
  for (const id of unlocked) {
    const item = findItem(id)
    if (!item?.model) continue
    db.run('INSERT OR IGNORE INTO user_items (user_id, item_id, source, acquired_at) VALUES (?, ?, ?, ?)', [userId, item.id, 'purchase', now])
    rewards.reserve('purchase', item.id)
  }
  const active = findItem(state?.collection?.active)
  if (active?.model && unlocked.includes(active.id)) {
    db.run(
      'INSERT INTO user_equipment (user_id, slot, item_id) VALUES (?, ?, ?) ON CONFLICT(user_id, slot) DO UPDATE SET item_id = excluded.item_id',
      [userId, 'special', active.id],
    )
  }

  // --- challenge rewards already paid -----------------------------------------
  for (const id of Array.isArray(state?.challengeRewards) ? state.challengeRewards : []) {
    if (safeId(id)) rewards.reserve('challenge', id)
  }
  for (const row of db.all(
    `SELECT id FROM challenges WHERE status = 'completed' AND ((creator_id = ? AND creator_reward > 0) OR (opponent_id = ? AND opponent_reward > 0))`,
    [userId, userId],
  )) {
    rewards.reserve('challenge', row.id)
  }
  db.run('UPDATE users SET xp_allowance = 0 WHERE id = ?', [userId])

  return rewards.finish()
}

/**
 * Makes sure an account has its game rows, carrying over old progress the
 * first time. Cheap after that: one indexed lookup.
 *
 * @param {string} userId
 * @param {string | null} timezoneHint  the client's IANA zone, if it sent one
 * @returns {boolean} whether this call created the rows
 */
export function ensureGame(userId, timezoneHint = null) {
  if (getProgressRow(userId)) return false
  return transaction(() => {
    if (getProgressRow(userId)) return false
    const user = findUserById(userId)
    if (!user) return false
    let state = null
    const stateRow = getState(userId)
    if (stateRow) {
      try {
        state = JSON.parse(stateRow.data)
      } catch {
        state = null
      }
    }
    const tz = isValidTimezone(timezoneHint) ? timezoneHint : 'UTC'
    const now = new Date().toISOString()
    db.run(
      `INSERT INTO player_progress (user_id, xp, coins, level, timezone, timezone_set_at, appearance, migrated_at, updated_at)
       VALUES (?, 0, 0, 1, ?, ?, ?, ?, ?)`,
      [userId, tz, isValidTimezone(timezoneHint) ? now : null, JSON.stringify(defaultAppearance(state?.player?.character)), now, now],
    )
    grantStarterGear(userId)

    if (state && typeof state === 'object') {
      if (stateRow) {
        db.run('INSERT OR IGNORE INTO state_backups (user_id, data, created_at) VALUES (?, ?, ?)', [userId, stateRow.data, now])
      }
      const summary = carryOver(userId, state, user, safeTimezone(tz))
      // Only worth saying when there was a balance to carry: an account whose
      // saved document held goals and nothing earned has nothing carried over.
      if (summary.entries.some((e) => e.source === 'legacy')) {
        notify(userId, {
          kind: 'system',
          title: 'Your progress carried over',
          body: `Level ${summary.progress.level}, ${summary.progress.xp.toLocaleString('en-US')} XP and everything you unlocked came with you. New rewards are waiting in your wardrobe.`,
          link: '/profile',
        })
      }
    } else {
      startRewards(userId, { quiet: true }).finish()
    }
    return true
  })
}

/** Keys that now belong to the server. A save that still carries them — an
 * older cached copy of the app — has them dropped rather than stored. */
export const SERVER_OWNED_STATE_KEYS = ['quests', 'todos', 'sessions', 'streak', 'unlockedAchievements', 'collection', 'progression', 'challengeRewards']

export function stripServerOwned(state) {
  const clean = { ...state }
  for (const key of SERVER_OWNED_STATE_KEYS) delete clean[key]
  if (clean.player && typeof clean.player === 'object') {
    const { xp: _xp, coins: _coins, ...player } = clean.player
    clean.player = player
  }
  return clean
}
