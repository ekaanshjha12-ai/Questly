import { randomUUID } from 'node:crypto'
import { db } from '../db.js'
import { screenInput } from '../moderation.js'
import { isFirst, track } from './analytics.js'
import { dayKey, safeTimezone } from './clock.js'
import { conflict, invalid, notFound } from './errors.js'
import { addFocusMinutes, deriveStatus } from './quests.js'
import { FOCUS_DAILY_XP, getProgressRow, paidToday, startRewards, transaction } from './rewards.js'

/**
 * Focus sessions, timed by the server.
 *
 * The client shows a clock, but the reward is worked out from the server's own
 * timestamps: when the session started, how long it was paused, when it
 * finished. A request cannot say how long it focused. A session can be
 * finished once; a replayed finish gets the original result and pays nothing.
 */

export const MIN_TARGET_MIN = 5
export const MAX_TARGET_MIN = 240
/** A stopwatch counts up to this. */
export const STOPWATCH_MAX_MS = 4 * 3_600_000
export const MAX_PAUSES = 30
/** XP for a single session is one per focused minute up to this. */
export const MAX_SESSION_XP = 120
/** Sessions shorter than this pay nothing and do not count toward the streak. */
export const MIN_REWARD_MS = 5 * 60_000
/** A session left open this long past its end is closed on its own. */
const STALE_AFTER_MS = 12 * 3_600_000
/** What a forgotten stopwatch is credited with at most. */
const STALE_STOPWATCH_CREDIT_MS = 60 * 60_000

export function focusXp(activeMs) {
  if (activeMs < MIN_REWARD_MS) return 0
  return Math.min(MAX_SESSION_XP, Math.floor(activeMs / 60_000))
}

function parsePlan(text) {
  try {
    const list = text ? JSON.parse(text) : []
    return Array.isArray(list) ? list : []
  } catch {
    return []
  }
}

export function cleanPlan(input) {
  if (input === undefined || input === null) return []
  if (!Array.isArray(input)) throw invalid('The plan must be a list.', 'plan')
  return input.slice(0, 12).map((item, i) => {
    const text = String(item?.text ?? '').trim().replace(/\s+/g, ' ').slice(0, 120)
    if (!text) throw invalid(`Plan item ${i + 1} is empty.`, 'plan')
    if (!screenInput(text, { allowLength: 120 }).ok) throw invalid('That plan was blocked by the content filter.', 'plan')
    return { id: typeof item?.id === 'string' && /^[\w-]{1,64}$/.test(item.id) ? item.id : randomUUID(), text, done: Boolean(item?.done) }
  })
}

/** Time actually spent focusing so far, as the server counts it. */
function activeSoFar(row, now) {
  const pausedMs = row.paused_ms + (row.status === 'paused' && row.paused_at ? now - Date.parse(row.paused_at) : 0)
  const elapsed = Math.max(0, now - Date.parse(row.started_at) - pausedMs)
  return { elapsed, pausedMs }
}

export function sessionView(row, now = Date.now()) {
  const open = row.status === 'running' || row.status === 'paused'
  const { elapsed, pausedMs } = open ? activeSoFar(row, now) : { elapsed: row.active_ms ?? 0, pausedMs: row.paused_ms }
  return {
    id: row.id,
    kind: row.kind,
    label: row.label,
    questId: row.quest_id,
    challengeId: row.challenge_id,
    clubId: row.club_id,
    goalId: row.goal_id,
    targetMs: row.target_ms,
    status: row.status,
    startedAt: row.started_at,
    pausedAt: row.paused_at,
    pausedMs,
    pauses: row.pauses,
    endedAt: row.ended_at,
    activeMs: open ? elapsed : row.active_ms ?? 0,
    xp: row.xp,
    xpPreview: open ? focusXp(row.kind === 'timer' ? Math.min(row.target_ms ?? 0, Math.max(elapsed, row.target_ms ?? 0)) : elapsed) : row.xp,
    plan: parsePlan(row.plan),
    legacy: Boolean(row.legacy),
    serverNow: new Date(now).toISOString(),
  }
}

function load(userId, sessionId) {
  const row = db.get('SELECT * FROM focus_sessions WHERE id = ? AND user_id = ?', [String(sessionId ?? ''), userId])
  if (!row) throw notFound('That focus session')
  return row
}

function openSession(userId) {
  return db.get("SELECT * FROM focus_sessions WHERE user_id = ? AND status IN ('running', 'paused') ORDER BY started_at DESC LIMIT 1", [userId]) ?? null
}

/**
 * Settles a session: fixes its focused time from server timestamps and pays
 * for it, plus whatever it moves on a linked quest. Shared by an explicit
 * finish and by the tidy-up of a session nobody came back to.
 */
function settle(row, now, { stale = false } = {}) {
  const { elapsed, pausedMs } = activeSoFar(row, now)
  let activeMs
  let completed
  if (row.kind === 'timer') {
    activeMs = Math.min(elapsed, row.target_ms)
    completed = elapsed >= row.target_ms - 2000
  } else {
    activeMs = Math.min(elapsed, stale ? STALE_STOPWATCH_CREDIT_MS : STOPWATCH_MAX_MS)
    completed = false
  }
  const status = completed ? 'completed' : 'ended'
  const endedAt = new Date(now).toISOString()
  const moved = db.run(
    `UPDATE focus_sessions SET status = ?, ended_at = ?, active_ms = ?, paused_ms = ?, paused_at = NULL
     WHERE id = ? AND user_id = ? AND status IN ('running', 'paused')`,
    [status, endedAt, activeMs, pausedMs, row.id, row.user_id],
  )
  if (!moved.changes) return null

  const rewards = startRewards(row.user_id)
  const room = Math.max(0, FOCUS_DAILY_XP - paidToday(row.user_id, rewards.today, ['focus']))
  const earned = focusXp(activeMs)
  if (earned > room) rewards.summary.capped = true
  const paid = rewards.pay({
    source: 'focus',
    sourceId: row.id,
    xp: Math.min(earned, room),
    label: completed ? `Focus: ${row.label}` : `Focus (ended early): ${row.label}`,
    verified: true,
    streak: activeMs >= MIN_REWARD_MS,
  })
  db.run('UPDATE focus_sessions SET xp = ? WHERE id = ?', [paid, row.id])

  let quest = null
  const minutes = Math.floor(activeMs / 60_000)
  if (row.quest_id && minutes >= 1) quest = addFocusMinutes(row.user_id, row.quest_id, minutes, rewards)

  if (activeMs >= MIN_REWARD_MS) {
    if (isFirst(row.user_id, 'first_focus_session')) track(row.user_id, 'first_focus_session', { minutes })
    track(row.user_id, 'focus_completed', { minutes, completed, linked: Boolean(row.quest_id) })
  }
  const summary = rewards.finish()
  return { session: sessionView(db.get('SELECT * FROM focus_sessions WHERE id = ?', [row.id]), now), rewards: summary, quest }
}

/** Closes a session nobody came back to, so it cannot sit open forever. */
function closeIfStale(row, now) {
  const expectedEnd = Date.parse(row.started_at) + row.paused_ms + (row.kind === 'timer' ? row.target_ms : STOPWATCH_MAX_MS)
  const pausedTooLong = row.status === 'paused' && row.paused_at && now - Date.parse(row.paused_at) > STALE_AFTER_MS
  if (now - expectedEnd <= STALE_AFTER_MS && !pausedTooLong) return false
  transaction(() => settle(row, now, { stale: true }))
  return true
}

export function currentSession(userId) {
  const now = Date.now()
  const row = openSession(userId)
  if (!row) return null
  if (closeIfStale(row, now)) return null
  return sessionView(row, now)
}

export function startSession(userId, input) {
  return transaction(() => {
    const now = Date.now()
    const open = openSession(userId)
    if (open && !closeIfStale(open, now)) {
      throw conflict('A focus session is already running.', 'session_open', { session: sessionView(open, now) })
    }

    const kind = input?.kind === 'stopwatch' ? 'stopwatch' : 'timer'
    let targetMs = null
    if (kind === 'timer') {
      const minutes = Math.round(Number(input?.targetMinutes))
      if (!Number.isFinite(minutes) || minutes < MIN_TARGET_MIN || minutes > MAX_TARGET_MIN) {
        throw invalid(`Set a focus block between ${MIN_TARGET_MIN} and ${MAX_TARGET_MIN} minutes.`, 'targetMinutes')
      }
      targetMs = minutes * 60_000
    }

    let questId = null
    let questTitle = null
    let goalId = null
    if (input?.questId) {
      const quest = db.get('SELECT * FROM quests WHERE id = ? AND user_id = ?', [String(input.questId), userId])
      if (!quest) throw notFound('That quest')
      const status = deriveStatus(quest)
      if (status !== 'active' && status !== 'in_progress') throw conflict(`That quest is ${status.replace('_', ' ')}.`, `quest_${status}`)
      questId = quest.id
      questTitle = quest.title
      goalId = quest.goal_id
      const iso = new Date(now).toISOString()
      db.run("UPDATE quests SET status = 'in_progress', started_at = COALESCE(started_at, ?), updated_at = ? WHERE id = ? AND user_id = ?", [
        iso,
        iso,
        quest.id,
        userId,
      ])
    }

    // A session with no quest can still count toward a goal in the notebook.
    if (!goalId && typeof input?.goalId === 'string' && /^[\w-]{1,64}$/.test(input.goalId)) goalId = input.goalId
    const label = String(input?.label ?? '').trim().replace(/\s+/g, ' ').slice(0, 80) || questTitle || (kind === 'timer' ? 'Focus session' : 'Stopwatch session')
    if (!screenInput(label, { allowLength: 160 }).ok) throw invalid('That label was blocked by the content filter.', 'label')
    const plan = cleanPlan(input?.plan)
    const tz = safeTimezone(getProgressRow(userId)?.timezone)
    const id = randomUUID()
    db.run(
      `INSERT INTO focus_sessions (id, user_id, quest_id, goal_id, label, kind, target_ms, status, started_at, plan, day)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'running', ?, ?, ?)`,
      [id, userId, questId, goalId, label, kind, targetMs, new Date(now).toISOString(), JSON.stringify(plan), dayKey(tz, new Date(now))],
    )
    return sessionView(load(userId, id), now)
  })
}

export function pauseSession(userId, sessionId) {
  const row = load(userId, sessionId)
  if (row.status !== 'running') throw conflict('Only a running session can be paused.', `session_${row.status}`)
  if (row.pauses >= MAX_PAUSES) throw conflict('That is a lot of pauses. Finish this session and start a fresh one.', 'too_many_pauses')
  const now = Date.now()
  const moved = db.run(
    "UPDATE focus_sessions SET status = 'paused', paused_at = ?, pauses = pauses + 1 WHERE id = ? AND user_id = ? AND status = 'running'",
    [new Date(now).toISOString(), row.id, userId],
  )
  if (!moved.changes) throw conflict('That session changed. Refresh and try again.', 'stale')
  return sessionView(load(userId, row.id), now)
}

export function resumeSession(userId, sessionId) {
  const row = load(userId, sessionId)
  if (row.status !== 'paused') throw conflict('Only a paused session can be resumed.', `session_${row.status}`)
  const now = Date.now()
  if (closeIfStale(row, now)) throw conflict('That session was paused too long and has been closed.', 'session_ended')
  const pausedFor = Math.max(0, now - Date.parse(row.paused_at))
  const moved = db.run(
    "UPDATE focus_sessions SET status = 'running', paused_at = NULL, paused_ms = paused_ms + ? WHERE id = ? AND user_id = ? AND status = 'paused'",
    [pausedFor, row.id, userId],
  )
  if (!moved.changes) throw conflict('That session changed. Refresh and try again.', 'stale')
  return sessionView(load(userId, row.id), now)
}

export function finishSession(userId, sessionId) {
  return transaction(() => {
    const row = load(userId, sessionId)
    if (row.status !== 'running' && row.status !== 'paused') {
      throw conflict('This session has already finished.', 'session_finished', { session: sessionView(row) })
    }
    const result = settle(row, Date.now())
    if (!result) throw conflict('This session has already finished.', 'session_finished', { session: sessionView(load(userId, row.id)) })
    return result
  })
}

/** Ends a session without paying for it. */
export function abandonSession(userId, sessionId) {
  const row = load(userId, sessionId)
  if (row.status !== 'running' && row.status !== 'paused') throw conflict('This session has already finished.', 'session_finished')
  const now = Date.now()
  const { elapsed, pausedMs } = activeSoFar(row, now)
  db.run(
    `UPDATE focus_sessions SET status = 'abandoned', ended_at = ?, active_ms = ?, paused_ms = ?, paused_at = NULL
     WHERE id = ? AND user_id = ? AND status IN ('running', 'paused')`,
    [new Date(now).toISOString(), elapsed, pausedMs, row.id, userId],
  )
  return sessionView(load(userId, row.id), now)
}

export function updatePlan(userId, sessionId, planInput) {
  const row = load(userId, sessionId)
  if (row.status !== 'running' && row.status !== 'paused') throw conflict('This session has already finished.', 'session_finished')
  const plan = cleanPlan(planInput)
  db.run('UPDATE focus_sessions SET plan = ? WHERE id = ? AND user_id = ?', [JSON.stringify(plan), row.id, userId])
  return sessionView(load(userId, row.id))
}

export function sessionHistory(userId, { before = null, limit = 30 } = {}) {
  const capped = Math.min(100, Math.max(1, limit))
  const rows = db.all(
    `SELECT * FROM focus_sessions WHERE user_id = ? AND hidden = 0 AND status IN ('completed', 'ended')
       ${before ? 'AND started_at < ?' : ''}
     ORDER BY started_at DESC LIMIT ?`,
    before ? [userId, before, capped + 1] : [userId, capped + 1],
  )
  return { sessions: rows.slice(0, capped).map((r) => sessionView(r)), more: rows.length > capped }
}

/** Hides a session from history. The XP it paid stays paid. */
export function hideSession(userId, sessionId) {
  const row = load(userId, sessionId)
  if (row.status === 'running' || row.status === 'paused') throw conflict('Finish the session before removing it.', 'session_open')
  db.run('UPDATE focus_sessions SET hidden = 1 WHERE id = ? AND user_id = ?', [row.id, userId])
}

/** Focused time totals for the stats panels. */
export function focusTotals(userId) {
  const tz = safeTimezone(getProgressRow(userId)?.timezone)
  const today = dayKey(tz)
  const weekAgo = new Date(Date.now() - 7 * 86_400_000).toISOString()
  const sum = (sql, params) => db.get(sql, params)?.n ?? 0
  return {
    todayMs: sum("SELECT COALESCE(SUM(active_ms), 0) AS n FROM focus_sessions WHERE user_id = ? AND day = ? AND status IN ('completed', 'ended')", [userId, today]),
    weekMs: sum("SELECT COALESCE(SUM(active_ms), 0) AS n FROM focus_sessions WHERE user_id = ? AND started_at > ? AND status IN ('completed', 'ended')", [userId, weekAgo]),
    totalMs: sum("SELECT COALESCE(SUM(active_ms), 0) AS n FROM focus_sessions WHERE user_id = ? AND status IN ('completed', 'ended')", [userId]),
    sessions: sum("SELECT COUNT(*) AS n FROM focus_sessions WHERE user_id = ? AND status IN ('completed', 'ended') AND active_ms >= 60000", [userId]),
  }
}
