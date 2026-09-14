import { randomUUID } from 'node:crypto'
import { db, getState } from '../db.js'
import { screenInput } from '../moderation.js'
import { periodEnd, periodKey, periodOrdinal, safeTimezone } from './clock.js'
import { rarityFor } from './quests.js'
import { getProgressRow, transaction } from './rewards.js'
import { GOAL_CATEGORIES, TASK_TEMPLATES, fillTemplate, seededShuffle } from './templates.js'

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

const SHAPE = {
  daily: { type: 'daily', xp: 15, durationMin: 20, difficulty: 'easy' },
  weekly: { type: 'side', xp: 60, durationMin: 90, difficulty: 'normal' },
  monthly: { type: 'main', xp: 200, durationMin: 240, difficulty: 'hard' },
}

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

function titleFor(goal, period, key, index) {
  const written = goal.pool[period]
  const templates = written.length ? written : TASK_TEMPLATES[goal.category][period]
  const ordered = seededShuffle(templates, `${goal.id}:${period}:${key}`)
  const template = ordered[index]
  if (!template) return null
  const title = fillTemplate(template, goal.title).slice(0, 160)
  if (screenInput(title, { allowLength: 400 }).ok) return title
  // A written pool line the filter refuses falls back to the plain wording.
  const fallback = seededShuffle(TASK_TEMPLATES[goal.category][period], `${goal.id}:${period}:${key}`)[index]
  return fallback ? fillTemplate(fallback, 'your goal') : null
}

function slateFor(goals, period, key, ordinal, covered) {
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
      const title = titleFor(goal, period, key, round)
      if (!title) continue
      picked.push({ goal, index: round, title })
      added += 1
    }
    if (!added) break
  }
  return picked
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

  transaction(() => {
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
      const shape = SHAPE[period]
      const deadline = periodEnd(period, tz, now)
      const taken = new Set(existing.map((q) => q.gen_key))
      for (const pick of slateFor(goals, period, key, periodOrdinal(period, tz, now), avoid)) {
        if (slots <= 0) break
        const genKey = `${pick.goal.id}|${period}|${key}|${pick.index}`
        if (taken.has(genKey)) continue
        const iso = now.toISOString()
        const inserted = db.run(
          `INSERT OR IGNORE INTO quests (id, user_id, type, origin, gen_key, goal_id, period, period_key, title, description, category,
             difficulty, duration_min, xp_reward, rarity, progress_kind, status, deadline_at, created_at, updated_at)
           VALUES (?, ?, ?, 'generated', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'check', 'active', ?, ?, ?)`,
          [
            randomUUID(), userId, shape.type, genKey, pick.goal.id, period, key, pick.title, `For your goal: ${pick.goal.title}`, pick.goal.category,
            shape.difficulty, shape.durationMin, shape.xp, rarityFor(shape.xp), deadline, iso, iso,
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
