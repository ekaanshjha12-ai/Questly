import { db, getState } from '../db.js'
import { ACHIEVEMENTS, achievementView, findAchievement, newlyEarned } from './achievements.js'
import { track } from './analytics.js'
import { dayKey, daysBetween, previousDay, safeTimezone } from './clock.js'
import { earnedItems, findItem } from './items.js'
import { levelCoins, levelFromXp, levelInfo, nextRank, rankForLevel } from './levels.js'
import { notify } from './notify.js'

/**
 * The only code that changes XP or coins.
 *
 * Every change is a ledger row keyed by what caused it, inserted first; the
 * running totals move only if that insert went in. So a reward is paid once no
 * matter how often the request arrives, and the totals always equal the sum
 * of the ledger.
 *
 * All of it is synchronous. The database driver is synchronous and Node runs
 * one callback at a time, so a whole reward — ledger, totals, level, streak,
 * achievements, items — lands inside one transaction with nothing
 * interleaving.
 */

let depth = 0

/** Runs `fn` in a transaction, or inside the one already open. `fn` must not
 * await: the transaction has to finish before anything else runs. */
export function transaction(fn) {
  if (depth > 0) return fn()
  depth += 1
  db.run('BEGIN IMMEDIATE')
  try {
    const result = fn()
    db.run('COMMIT')
    return result
  } catch (err) {
    try {
      db.run('ROLLBACK')
    } catch {
      // Already rolled back.
    }
    throw err
  } finally {
    depth -= 1
  }
}

/** Daily ceilings, in XP. */
export const FOCUS_DAILY_XP = 600
export const SELF_REPORTED_DAILY_XP = 300

export function getProgressRow(userId) {
  return db.get('SELECT * FROM player_progress WHERE user_id = ?', [userId]) ?? null
}

/** The streak as it stands today: a run that last moved before yesterday is over. */
export function effectiveStreak(row, today) {
  if (!row?.streak_last_day) return 0
  const gap = daysBetween(row.streak_last_day, today)
  return gap <= 1 ? row.streak_current : 0
}

function parseJson(text, fallback) {
  try {
    return text ? JSON.parse(text) : fallback
  } catch {
    return fallback
  }
}

export function progressView(row) {
  const tz = safeTimezone(row.timezone)
  const today = dayKey(tz)
  const info = levelInfo(row.xp)
  const rank = rankForLevel(info.level)
  const upcoming = nextRank(info.level)
  return {
    xp: row.xp,
    coins: row.coins,
    level: info.level,
    xpIntoLevel: info.xpIntoLevel,
    xpForNext: info.xpForNext,
    rank: { id: rank.id, name: rank.name },
    nextRank: upcoming ? { id: upcoming.id, name: upcoming.name, level: upcoming.minLevel } : null,
    streak: {
      current: effectiveStreak(row, today),
      longest: row.streak_longest,
      activeToday: row.streak_last_day === today,
    },
    timezone: tz,
    today,
    path: row.path ?? null,
    appearance: parseJson(row.appearance, null),
    flags: parseJson(row.flags, {}),
  }
}

/** XP already paid today from these sources — for the daily ceilings. */
export function paidToday(userId, day, sources, { selfReportedOnly = false } = {}) {
  const marks = sources.map(() => '?').join(',')
  const row = db.get(
    `SELECT COALESCE(SUM(xp), 0) AS total FROM xp_ledger
     WHERE user_id = ? AND day = ? AND source IN (${marks})${selfReportedOnly ? ' AND verified = 0' : ''} AND xp > 0`,
    [userId, day, ...sources],
  )
  return row?.total ?? 0
}

function count(sql, params) {
  try {
    return db.get(sql, params)?.n ?? 0
  } catch {
    // A table that belongs to a later feature may not exist yet.
    return 0
  }
}

/** Everything achievements are judged on, from the server's own tables. */
function achievementStats(userId, progress, readState) {
  const quest = (extra) => count(`SELECT COUNT(*) AS n FROM quests WHERE user_id = ? AND status = 'completed'${extra}`, [userId])
  const state = readState()
  const goals = Array.isArray(state?.goals) ? state.goals : []
  return {
    questsCompleted: quest(''),
    questsVerified: count('SELECT COUNT(*) AS n FROM quests WHERE user_id = ? AND verified_at IS NOT NULL', [userId]),
    monthlyCompleted: quest(" AND type = 'monthly'"),
    legendaryCompleted: quest(" AND rarity = 'legendary'"),
    focusSessions: count(
      "SELECT COUNT(*) AS n FROM focus_sessions WHERE user_id = ? AND status IN ('completed', 'ended') AND active_ms >= 60000",
      [userId],
    ),
    deepFocus: count(
      "SELECT COUNT(*) AS n FROM focus_sessions WHERE user_id = ? AND status IN ('completed', 'ended') AND active_ms >= 3600000",
      [userId],
    ),
    focusMs:
      db.get(
        "SELECT COALESCE(SUM(active_ms), 0) AS n FROM focus_sessions WHERE user_id = ? AND status IN ('completed', 'ended')",
        [userId],
      )?.n ?? 0,
    streakLongest: progress.streak_longest,
    level: levelFromXp(progress.xp),
    activeDays: count(
      "SELECT COUNT(DISTINCT day) AS n FROM xp_ledger WHERE user_id = ? AND xp > 0 AND source IN ('quest', 'quest_step', 'focus', 'challenge', 'club_challenge')",
      [userId],
    ),
    duelsMet: count(
      `SELECT COUNT(*) AS n FROM challenges WHERE status = 'completed' AND
         ((creator_id = ? AND creator_reward > 0) OR (opponent_id = ? AND opponent_reward > 0))`,
      [userId, userId],
    ),
    // Counted from the event log rather than current membership, so leaving a
    // club does not take the achievement back.
    clubsJoined: count("SELECT COUNT(*) AS n FROM analytics_events WHERE user_id = ? AND event = 'club_joined'", [userId]),
    trialsPassed: count("SELECT COUNT(*) AS n FROM analytics_events WHERE user_id = ? AND event = 'club_trials_passed'", [userId]),
    posts: count('SELECT COUNT(*) AS n FROM posts WHERE user_id = ?', [userId]),
    goals: goals.length,
    activeGoals: goals.filter((g) => g && !g.archived).length,
    cardDesigned: Boolean(state?.card && Array.isArray(state.card.items)),
  }
}

/**
 * One action's rewards.
 *
 *   const rewards = startRewards(userId)
 *   rewards.pay({ source: 'quest', sourceId: quest.id, xp: 120, label: quest.title })
 *   const summary = rewards.finish()
 *
 * `finish` settles everything that follows from the payments — level-ups and
 * their coins, achievements and their XP, items — and returns what the client
 * needs to celebrate it. Must run inside `transaction`.
 */
export function startRewards(userId, { quiet = false } = {}) {
  const initial = getProgressRow(userId)
  if (!initial) throw new Error(`No progress row for ${userId}`)
  const tz = safeTimezone(initial.timezone)
  const today = dayKey(tz)

  const summary = {
    xp: 0,
    coins: 0,
    capped: false,
    levelBefore: levelFromXp(initial.xp),
    levelAfter: levelFromXp(initial.xp),
    achievements: [],
    items: [],
    streak: null,
    entries: [],
  }

  let stateCache
  const readState = () => {
    if (stateCache !== undefined) return stateCache
    try {
      const row = getState(userId)
      stateCache = row ? JSON.parse(row.data) : null
    } catch {
      stateCache = null
    }
    return stateCache
  }

  function advanceStreak() {
    const row = getProgressRow(userId)
    if (row.streak_last_day === today) return
    // A key after today means the timezone moved backwards; count it as today.
    if (row.streak_last_day && daysBetween(row.streak_last_day, today) <= 0) return
    const continued = row.streak_last_day === previousDay(today)
    const current = continued ? row.streak_current + 1 : 1
    const longest = Math.max(row.streak_longest, current)
    db.run('UPDATE player_progress SET streak_current = ?, streak_longest = ?, streak_last_day = ? WHERE user_id = ?', [
      current,
      longest,
      today,
      userId,
    ])
    summary.streak = { current, extended: true }
    if (!quiet && current > 1 && [3, 7, 14, 30, 50, 100, 365].includes(current)) {
      notify(userId, { kind: 'streak', title: `${current}-day streak`, body: 'Your streak keeps burning. Come back tomorrow to extend it.', link: '/' })
    }
  }

  const api = {
    userId,
    today,
    timezone: tz,
    summary,

    /**
     * Pays one reward. Returns the XP actually paid — 0 when this source has
     * already been paid.
     *
     * @param {{ source: string, sourceId: string, xp?: number, coins?: number, label?: string, verified?: boolean, streak?: boolean }} entry
     */
    pay({ source, sourceId, xp = 0, coins, label = null, verified = true, streak = false }) {
      const xpAmount = Math.round(Number(xp) || 0)
      const coinAmount = coins === undefined ? Math.floor(Math.max(0, xpAmount) / 3) : Math.round(Number(coins) || 0)
      const inserted = db.run(
        `INSERT OR IGNORE INTO xp_ledger (user_id, source, source_id, xp, coins, verified, label, day, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [userId, source, String(sourceId), xpAmount, coinAmount, verified ? 1 : 0, label ? String(label).slice(0, 120) : null, today, new Date().toISOString()],
      )
      if (!inserted.changes) return 0
      db.run(
        'UPDATE player_progress SET xp = MAX(0, xp + ?), coins = MAX(0, coins + ?), updated_at = ? WHERE user_id = ?',
        [xpAmount, coinAmount, new Date().toISOString(), userId],
      )
      summary.xp += xpAmount
      summary.coins += coinAmount
      if (xpAmount || coinAmount) summary.entries.push({ source, label, xp: xpAmount, coins: coinAmount })
      if (streak && xpAmount > 0) advanceStreak()
      return xpAmount
    },

    /** Records that a source has been settled without paying anything — used
     * when carrying over progress that was already counted. */
    reserve(source, sourceId, label = null) {
      db.run(
        `INSERT OR IGNORE INTO xp_ledger (user_id, source, source_id, xp, coins, verified, label, day, created_at)
         VALUES (?, ?, ?, 0, 0, 1, ?, ?, ?)`,
        [userId, source, String(sourceId), label, today, new Date().toISOString()],
      )
    },

    /** Whether a source has already been paid or reserved. */
    isSettled(source, sourceId) {
      return Boolean(db.get('SELECT 1 AS x FROM xp_ledger WHERE user_id = ? AND source = ? AND source_id = ?', [userId, source, String(sourceId)]))
    },

    finish() {
      // Achievements pay XP, which can reach a level, which can grant items and
      // satisfy a level achievement — so settle until nothing new happens.
      for (let pass = 0; pass < 6; pass += 1) {
        let changed = false
        const row = getProgressRow(userId)
        const level = levelFromXp(row.xp)

        if (level !== row.level) {
          db.run('UPDATE player_progress SET level = ? WHERE user_id = ?', [level, userId])
          if (level > row.level) {
            for (let reached = row.level + 1; reached <= level; reached += 1) {
              api.pay({ source: 'level_reward', sourceId: String(reached), xp: 0, coins: levelCoins(reached), label: `Reached level ${reached}` })
            }
            track(userId, 'level_up', { level })
          }
          changed = true
        }

        const unlocked = new Set(
          db.all('SELECT achievement_id FROM user_achievements WHERE user_id = ?', [userId]).map((r) => r.achievement_id),
        )
        const stats = achievementStats(userId, getProgressRow(userId), readState)
        for (const id of newlyEarned(stats, unlocked)) {
          const def = findAchievement(id)
          const insert = db.run('INSERT OR IGNORE INTO user_achievements (user_id, achievement_id, unlocked_at) VALUES (?, ?, ?)', [
            userId,
            id,
            new Date().toISOString(),
          ])
          if (!insert.changes) continue
          unlocked.add(id)
          if (def.xp) api.pay({ source: 'achievement', sourceId: id, xp: def.xp, label: `Achievement: ${def.title}` })
          summary.achievements.push(achievementView(def, new Date().toISOString()))
          if (!quiet) notify(userId, {
            kind: 'achievement',
            title: `Achievement unlocked: ${def.title}`,
            body: def.description + (def.xp ? ` +${def.xp} XP` : ''),
            link: '/profile/achievements',
            data: { achievementId: id },
          })
          changed = true
        }

        const flags = parseJson(getProgressRow(userId).flags, {})
        for (const itemId of earnedItems({ level: levelFromXp(getProgressRow(userId).xp), achievements: unlocked, onboardingDone: Boolean(flags.onboardingDone) })) {
          const item = findItem(itemId)
          const insert = db.run('INSERT OR IGNORE INTO user_items (user_id, item_id, source, acquired_at) VALUES (?, ?, ?, ?)', [
            userId,
            itemId,
            item.unlock.type,
            new Date().toISOString(),
          ])
          if (!insert.changes || item.unlock.type === 'starter') continue
          summary.items.push({ id: item.id, name: item.name, slot: item.slot, rarity: item.rarity })
          if (!quiet) notify(userId, {
            kind: 'item_unlocked',
            title: `Reward unlocked: ${item.name}`,
            body: `${item.rarity[0].toUpperCase()}${item.rarity.slice(1)} ${item.slot === 'badge' ? 'badge' : 'item'} added to your wardrobe.`,
            link: '/profile/wardrobe',
            data: { itemId: item.id },
          })
          changed = true
        }

        if (!changed) break
      }

      const final = getProgressRow(userId)
      summary.levelAfter = levelFromXp(final.xp)
      if (!quiet && summary.levelAfter > summary.levelBefore) {
        const rank = rankForLevel(summary.levelAfter)
        const before = rankForLevel(summary.levelBefore)
        notify(userId, {
          kind: 'level_up',
          title: `Level up! You reached level ${summary.levelAfter}`,
          body: rank.id !== before.id ? `New rank: ${rank.name}.` : 'New rewards may be waiting in your wardrobe.',
          link: '/profile',
          data: { level: summary.levelAfter },
        })
      }
      return { ...summary, progress: progressView(final) }
    },
  }
  return api
}

/** Every achievement with when this player unlocked it, if they have. */
export function achievementsFor(userId) {
  const unlocked = new Map(
    db.all('SELECT achievement_id, unlocked_at FROM user_achievements WHERE user_id = ?', [userId]).map((r) => [
      r.achievement_id,
      r.unlocked_at,
    ]),
  )
  return ACHIEVEMENTS.map((a) => achievementView(a, unlocked.get(a.id) ?? null))
}

/** A page of the ledger, newest first. */
export function ledgerPage(userId, { before = null, limit = 30 } = {}) {
  const capped = Math.min(100, Math.max(1, limit))
  const rows = before
    ? db.all('SELECT * FROM xp_ledger WHERE user_id = ? AND id < ? AND (xp != 0 OR coins != 0) ORDER BY id DESC LIMIT ?', [userId, before, capped + 1])
    : db.all('SELECT * FROM xp_ledger WHERE user_id = ? AND (xp != 0 OR coins != 0) ORDER BY id DESC LIMIT ?', [userId, capped + 1])
  return {
    entries: rows.slice(0, capped).map((r) => ({
      id: r.id,
      source: r.source,
      label: r.label,
      xp: r.xp,
      coins: r.coins,
      verified: Boolean(r.verified),
      day: r.day,
      at: r.created_at,
    })),
    more: rows.length > capped,
  }
}
