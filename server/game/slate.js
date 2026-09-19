import { randomUUID } from 'node:crypto'
import { db, findUserById, getState } from '../db.js'
import { screenInput } from '../moderation.js'
import { periodEnd, periodKey, periodOrdinal, safeTimezone } from './clock.js'
import { questAgeGroup } from './ages.js'
import { setFlag } from './onboarding.js'
import { estimateMinutes, questScale } from './quests.js'
import { getProgressRow, transaction } from './rewards.js'
import { GOAL_CATEGORIES, fillTemplate, seededShuffle, suitableForAge, templatesFor } from './templates.js'

/**
 * The quests a player's goals hand out each day, week and month.
 *
 * Ported from the client, where it used to run: the same caps (4 daily, 1
 * weekly, 3 monthly across all goals), the same rotation, the same wording.
 * It runs here now because the server decides which quests exist and what
 * they pay — a client could otherwise invent a quest worth anything.
 *
 * Goals themselves stay in the player's notebook document. Adding goals
 * changes which quests appear, never how many, so there is nothing to gain by
 * writing a hundred of them.
 */

export const PERIODS = ['daily', 'weekly', 'monthly']
export const QUESTS_PER_PERIOD = { daily: 4, weekly: 1, monthly: 3 }
const FILL_ORDER = ['monthly', 'weekly', 'daily']

/**
 * What each cadence's quests are. Their length is read from their own wording
 * (see estimateMinutes), and their level, reward and rarity follow from that
 * on the same scale as every other quest.
 */
const TYPE = { daily: 'daily', weekly: 'weekly', monthly: 'monthly' }

/** Goals from the notebook document, cleaned — it is written by the client. */
export function readGoals(state) {
  const list = Array.isArray(state?.goals) ? state.goals : []
  const goals = []
  for (const g of list.slice(0, 200)) {
    if (!g || typeof g !== 'object') continue
    const id = typeof g.id === 'string' && /^[\w-]{1,64}$/.test(g.id) ? g.id : null
    const title = typeof g.title === 'string' ? g.title.trim().slice(0, 200) : ''
    if (!id || !title) continue
    const pool = {}
    for (const period of PERIODS) {
      const lines = Array.isArray(g.questPool?.[period]) ? g.questPool[period] : []
      pool[period] = lines.filter((l) => typeof l === 'string' && l.trim()).map((l) => l.trim().slice(0, 200)).slice(0, 20)
    }
    goals.push({
      id,
      title,
      category: GOAL_CATEGORIES.includes(g.category) ? g.category : 'general',
      archived: Boolean(g.archived),
      pool,
    })
  }
  return goals
}

function titleFor(goal, period, key, index, ageGroup) {
  const plain = templatesFor(goal.category, period, ageGroup)
  // A goal's own written quests, less any line unsuited to the player's age.
  const written = goal.pool[period].filter((line) => suitableForAge(line, ageGroup))
  const templates = written.length ? written : plain
  const ordered = seededShuffle(templates, `${goal.id}:${period}:${key}`)
  const template = ordered[index]
  if (!template) return null
  const title = fillTemplate(template, goal.title).slice(0, 160)
  if (screenInput(title, { allowLength: 400 }).ok && suitableForAge(title, ageGroup)) return title
  // A line the filters refuse (the goal's own title can be the problem) falls back to the plain wording.
  const fallback = seededShuffle(plain, `${goal.id}:${period}:${key}`)[index]
  return fallback ? fillTemplate(fallback, 'your goal') : null
}

function slateFor(goals, period, key, ordinal, covered, ageGroup) {
  const active = goals.filter((g) => !g.archived)
  const cap = QUESTS_PER_PERIOD[period]
  if (!active.length) return []
  const offset = ordinal % active.length
  const ordered = [...active.slice(offset), ...active.slice(0, offset)]
  const pool = [...ordered.filter((g) => !covered.has(g.id)), ...ordered.filter((g) => covered.has(g.id))]
  const picked = []
  for (let round = 0; picked.length < cap; round += 1) {
    let added = 0
    for (const goal of pool) {
      if (picked.length >= cap) break
      const title = titleFor(goal, period, key, round, ageGroup)
      if (!title) continue
      picked.push({ goal, index: round, title })
      added += 1
    }
    if (!added) break
  }
  return picked
}

/**
 * A goal just got quests written for it: take back its generated quests for
 * the current periods that nobody has touched, so the written ones replace
 * them today rather than next week. Anything started, progressed, pinned or
 * paid stays exactly as it is.
 */
export function refreshGoalQuests(userId, goalId, now = new Date()) {
  const progress = getProgressRow(userId)
  if (!progress) return
  const tz = safeTimezone(progress.timezone)
  transaction(() => {
    for (const period of PERIODS) {
      db.run(
        `DELETE FROM quests WHERE user_id = ? AND goal_id = ? AND period = ? AND period_key = ? AND origin = 'generated'
           AND status = 'active' AND started_at IS NULL AND xp_paid = 0 AND progress_value = 0 AND pinned = 0`,
        [userId, goalId, period, periodKey(period, tz, now)],
      )
    }
  })
  ensurePeriodicQuests(userId, now)
}

/**
 * Tops up the current day, week and month. Only ever adds: quests already
 * issued for a period hold their slots. Idempotent through the unique
 * `(user_id, gen_key)` index.
 */
export function ensurePeriodicQuests(userId, now = new Date()) {
  const progress = getProgressRow(userId)
  if (!progress) return
  const tz = safeTimezone(progress.timezone)
  let state = null
  try {
    const row = getState(userId)
    state = row ? JSON.parse(row.data) : null
  } catch {
    state = null
  }
  const goals = readGoals(state)
  const activeIds = new Set(goals.filter((g) => !g.archived).map((g) => g.id))
  const ageGroup = questAgeGroup(findUserById(userId)?.birthdate, now)
  let flags = {}
  try {
    flags = JSON.parse(progress.flags ?? '{}') ?? {}
  } catch {
    flags = {}
  }

  transaction(() => {
    // Written for a different age group, or before the one scale: this period's
    // untouched quests are handed out again, worded for who the player is now.
    if (flags.slateFor !== `${ageGroup}|scale1`) {
      for (const period of PERIODS) {
        db.run(
          `DELETE FROM quests WHERE user_id = ? AND period = ? AND period_key = ? AND origin = 'generated'
             AND status = 'active' AND started_at IS NULL AND xp_paid = 0 AND progress_value = 0 AND pinned = 0`,
          [userId, period, periodKey(period, tz, now)],
        )
      }
      setFlag(userId, 'slateFor', `${ageGroup}|scale1`)
    }

    const covered = new Set()
    for (const period of FILL_ORDER) {
      const key = periodKey(period, tz, now)
      const existing = db.all(
        "SELECT id, goal_id, gen_key, status FROM quests WHERE user_id = ? AND period = ? AND period_key = ? AND gen_key IS NOT NULL",
        [userId, period, key],
      )
      // A quest whose goal was archived gives up its slot unless it was done.
      for (const q of existing) {
        if (!activeIds.has(q.goal_id) && q.status !== 'completed' && q.status !== 'expired' && q.status !== 'failed') {
          db.run("UPDATE quests SET status = 'expired', updated_at = ? WHERE id = ? AND user_id = ?", [now.toISOString(), q.id, userId])
          q.status = 'expired'
        }
      }
      const live = existing.filter((q) => activeIds.has(q.goal_id))
      for (const q of live) covered.add(q.goal_id)
      let slots = QUESTS_PER_PERIOD[period] - live.length
      if (slots <= 0 || !activeIds.size) continue

      const avoid = period === 'daily' ? new Set() : covered
      const deadline = periodEnd(period, tz, now)
      const taken = new Set(existing.map((q) => q.gen_key))
      for (const pick of slateFor(goals, period, key, periodOrdinal(period, tz, now), avoid, ageGroup)) {
        if (slots <= 0) break
        const genKey = `${pick.goal.id}|${period}|${key}|${pick.index}`
        if (taken.has(genKey)) continue
        const iso = now.toISOString()
        const durationMin = estimateMinutes(pick.title, period)
        const scale = questScale({ type: TYPE[period], durationMin })
        const inserted = db.run(
          `INSERT OR IGNORE INTO quests (id, user_id, type, origin, gen_key, goal_id, period, period_key, title, description, category,
             difficulty, duration_min, xp_reward, rarity, progress_kind, status, deadline_at, created_at, updated_at)
           VALUES (?, ?, ?, 'generated', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'check', 'active', ?, ?, ?)`,
          [
            randomUUID(), userId, TYPE[period], genKey, pick.goal.id, period, key, pick.title, `For your goal: ${pick.goal.title}`, pick.goal.category,
            scale.difficulty, durationMin, scale.xp, scale.rarity, deadline, iso, iso,
          ],
        )
        if (inserted.changes) {
          taken.add(genKey)
          covered.add(pick.goal.id)
          slots -= 1
        }
      }
    }
  })
}
