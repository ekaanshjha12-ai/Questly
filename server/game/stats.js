import { db, findUserById, getState } from '../db.js'
import { dayKey, daysBetween, previousDay, safeTimezone } from './clock.js'
import { levelFromXp } from './levels.js'
import { effectiveStreak, getProgressRow } from './rewards.js'
import { readGoals } from './slate.js'

/**
 * Counts for the progress screens, from the server's own records.
 *
 * The client used to add these up from its saved document. Now that quests and
 * focus sessions live here, so do the sums — which also means the figures a
 * player sees, and those fed to the progress outlook, are the true ones.
 */

const DAY_MS = 86_400_000

function completionRows(userId) {
  return {
    quests: db.all(
      "SELECT goal_id, type, origin, completed_at, verified_at FROM quests WHERE user_id = ? AND status = 'completed' AND completed_at IS NOT NULL",
      [userId],
    ),
    sessions: db.all(
      "SELECT goal_id, ended_at, active_ms, day FROM focus_sessions WHERE user_id = ? AND status IN ('completed', 'ended') AND active_ms >= 60000",
      [userId],
    ),
  }
}

const isTodo = (q) => q.origin === 'legacy_todo' || q.type === 'optional'

export function progressStats(userId, now = new Date()) {
  const progress = getProgressRow(userId)
  const tz = safeTimezone(progress?.timezone)
  const today = dayKey(tz, now)
  const user = findUserById(userId)
  const { quests, sessions } = completionRows(userId)

  const days = new Set()
  const stamps = []
  for (const q of quests) {
    const key = dayKey(tz, new Date(q.completed_at))
    days.add(key)
    stamps.push(Date.parse(q.completed_at))
  }
  for (const s of sessions) {
    days.add(s.day)
    if (s.ended_at) stamps.push(Date.parse(s.ended_at))
  }
  const sortedDays = [...days].sort()
  const last14 = (() => {
    let key = today
    const set = new Set()
    for (let i = 0; i < 14; i += 1) {
      set.add(key)
      key = previousDay(key)
    }
    return set
  })()
  const since = (ms) => stamps.filter((t) => t >= now.getTime() - ms).length
  const open = db.get(
    "SELECT COUNT(*) AS n FROM quests WHERE user_id = ? AND status IN ('active', 'in_progress') AND (type = 'optional' OR origin = 'legacy_todo')",
    [userId],
  )?.n ?? 0

  const createdAt = user?.created_at ? Date.parse(user.created_at) : now.getTime()
  const lastDay = sortedDays[sortedDays.length - 1] ?? null
  const stats = {
    totalFocusMs: sessions.reduce((sum, s) => sum + s.active_ms, 0),
    focusSessions: sessions.length,
    currentStreak: progress ? effectiveStreak(progress, today) : 0,
    longestStreak: progress?.streak_longest ?? 0,
    questsCompleted: quests.filter((q) => !isTodo(q)).length,
    questsVerified: quests.filter((q) => q.verified_at).length,
    todosCompleted: quests.filter(isTodo).length,
    todosOpen: open,
    level: levelFromXp(progress?.xp ?? 0),
    xp: progress?.xp ?? 0,
    accountAgeDays: Math.max(1, Math.round((now.getTime() - createdAt) / DAY_MS)),
    activeDays: sortedDays.length,
    activeDaysLast14: sortedDays.filter((d) => last14.has(d)).length,
    completionsLast7: since(7 * DAY_MS),
    completionsLast30: since(30 * DAY_MS),
    daysSinceLastActivity: lastDay ? Math.max(0, daysBetween(lastDay, today)) : null,
  }

  let state = null
  try {
    const row = getState(userId)
    state = row ? JSON.parse(row.data) : null
  } catch {
    state = null
  }
  const rawGoals = Array.isArray(state?.goals) ? state.goals : []
  const goals = readGoals(state)
    .filter((g) => !g.archived)
    .map((goal) => {
      const raw = rawGoals.find((g) => g?.id === goal.id)
      const mine = quests.filter((q) => q.goal_id === goal.id)
      const focusMs = sessions.filter((s) => s.goal_id === goal.id).reduce((sum, s) => sum + s.active_ms, 0)
      const created = Date.parse(String(raw?.createdAt ?? ''))
      return {
        id: goal.id,
        title: goal.title,
        category: goal.category,
        ...(typeof raw?.detail === 'string' && raw.detail.trim() ? { detail: raw.detail.trim().slice(0, 400) } : {}),
        ageDays: Number.isFinite(created) ? Math.max(0, Math.round((now.getTime() - created) / DAY_MS)) : 0,
        questsCompleted: mine.length,
        questsVerified: mine.filter((q) => q.verified_at).length,
        focusMinutes: Math.round(focusMs / 60000),
      }
    })

  return { stats, goals }
}

/** One row per day for the last `days` days, oldest first — gaps included. */
export function activitySeries(userId, days = 84, now = new Date()) {
  const span = Math.min(400, Math.max(7, Math.round(days)))
  const progress = getProgressRow(userId)
  const tz = safeTimezone(progress?.timezone)
  const cutoff = new Date(now.getTime() - (span + 1) * DAY_MS).toISOString()
  const byDay = new Map()
  const bucket = (key) => {
    let point = byDay.get(key)
    if (!point) {
      point = { date: key, quests: 0, verified: 0, todos: 0, sessions: 0, focusMs: 0 }
      byDay.set(key, point)
    }
    return point
  }
  for (const q of db.all(
    "SELECT type, origin, completed_at, verified_at FROM quests WHERE user_id = ? AND status = 'completed' AND completed_at > ?",
    [userId, cutoff],
  )) {
    const point = bucket(dayKey(tz, new Date(q.completed_at)))
    if (isTodo(q)) point.todos += 1
    else point.quests += 1
  }
  for (const q of db.all('SELECT verified_at FROM quests WHERE user_id = ? AND verified_at > ?', [userId, cutoff])) {
    bucket(dayKey(tz, new Date(q.verified_at))).verified += 1
  }
  for (const s of db.all(
    "SELECT day, active_ms FROM focus_sessions WHERE user_id = ? AND status IN ('completed', 'ended') AND active_ms >= 60000 AND started_at > ?",
    [userId, cutoff],
  )) {
    const point = bucket(s.day)
    point.sessions += 1
    point.focusMs += s.active_ms
  }
  return { today: dayKey(tz, now), days: [...byDay.values()].sort((a, b) => (a.date < b.date ? -1 : 1)) }
}
