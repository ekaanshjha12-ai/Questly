import { randomUUID } from 'node:crypto'
import { db } from '../db.js'
import { screenInput } from '../moderation.js'
import { isFirst, track } from './analytics.js'
import { dayKey, safeTimezone } from './clock.js'
import { conflict, invalid, notFound } from './errors.js'
import { notify } from './notify.js'
import { SELF_REPORTED_DAILY_XP, getProgressRow, paidToday, startRewards, transaction } from './rewards.js'
import { GOAL_CATEGORIES } from './templates.js'
import { levelFromXp } from './levels.js'

/**
 * The quest system.
 *
 * What a quest pays is decided here, from its type, difficulty and estimated
 * duration — never taken from a request. How it can be completed depends on
 * how its progress is measured:
 *
 *   check       ticked when done. Self-reported.
 *   minutes     filled only by focus sessions the server timed.
 *   count       logged in units (pages, km). Self-reported, paid as it grows.
 *   milestones  a list of steps. Self-reported, paid step by step.
 *
 * Self-reported XP counts against a daily ceiling; time the server measured
 * and proof it accepted do not. Every payment is keyed to the quest (or the
 * step), so nothing pays twice.
 */

export const QUEST_TYPES = ['main', 'side', 'daily', 'club', 'challenge', 'optional']
export const PLAYER_TYPES = ['main', 'side', 'optional']
export const DIFFICULTIES = ['easy', 'normal', 'hard', 'heroic']
export const PROGRESS_KINDS = ['check', 'minutes', 'count', 'milestones']
const TERMINAL = new Set(['completed', 'failed', 'expired'])
const OPEN = new Set(['active', 'in_progress'])

const RATE = { main: 2, side: 1.5, daily: 1.5, optional: 1, club: 1.5, challenge: 1.5 }
const DIFFICULTY = { easy: 0.75, normal: 1, hard: 1.25, heroic: 1.5 }

/** Most open quests a player can hold, and create in a day. */
export const MAX_OPEN_QUESTS = 100
export const MAX_CREATED_PER_DAY = 40

export const VERIFY_BONUS = { photo: 15, voice: 8 }

export function questXp({ type, difficulty, durationMin }) {
  const minutes = Math.min(480, Math.max(5, Math.round(durationMin)))
  const raw = minutes * (RATE[type] ?? 1) * (DIFFICULTY[difficulty] ?? 1)
  return Math.min(900, Math.max(10, Math.round(raw / 5) * 5))
}

export function rarityFor(xp) {
  if (xp >= 300) return 'legendary'
  if (xp >= 150) return 'epic'
  if (xp >= 60) return 'rare'
  return 'common'
}

function cleanLine(value, { min, max, label, field }) {
  const text = String(value ?? '').trim().replace(/\s+/g, ' ')
  if (text.length < min) throw invalid(`${label} needs at least ${min} characters.`, field)
  if (text.length > max) throw invalid(`${label} can be at most ${max} characters.`, field)
  if (text && !screenInput(text, { allowLength: max }).ok) throw invalid(`${label} was blocked by the content filter.`, field)
  return text
}

function futureIso(value, { now, field, label, minLeadMs = 0 }) {
  if (value === undefined || value === null || value === '') return null
  const at = Date.parse(String(value))
  if (!Number.isFinite(at)) throw invalid(`${label} is not a valid date.`, field)
  if (at < now + minLeadMs) throw invalid(`${label} has to be in the future.`, field)
  if (at > now + 366 * 86_400_000) throw invalid(`${label} has to be within a year.`, field)
  return new Date(at).toISOString()
}

/**
 * Checks a quest a player is writing. XP and rarity are worked out from what
 * passes, and nothing else in the input is trusted.
 */
export function validateQuestInput(input, now = Date.now()) {
  const type = PLAYER_TYPES.includes(input?.type) ? input.type : null
  if (!type) throw invalid('Choose Main, Side or Optional.', 'type')
  const title = cleanLine(input?.title, { min: 3, max: 80, label: 'The title', field: 'title' })
  const description = cleanLine(input?.description ?? '', { min: 0, max: 400, label: 'The description', field: 'description' }) || null
  const category = GOAL_CATEGORIES.includes(input?.category) ? input.category : 'general'
  const difficulty = DIFFICULTIES.includes(input?.difficulty) ? input.difficulty : 'normal'
  const durationMin = Math.round(Number(input?.durationMin))
  if (!Number.isFinite(durationMin) || durationMin < 5 || durationMin > 480) {
    throw invalid('Estimate between 5 minutes and 8 hours.', 'durationMin')
  }

  const progressKind = PROGRESS_KINDS.includes(input?.progressKind) ? input.progressKind : 'check'
  let target = null
  let unit = null
  let milestones = null
  if (progressKind === 'minutes') {
    target = durationMin
  } else if (progressKind === 'count') {
    target = Math.round(Number(input?.target))
    if (!Number.isFinite(target) || target < 1 || target > 100_000) throw invalid('Set a target between 1 and 100,000.', 'target')
    unit = cleanLine(input?.unit ?? '', { min: 1, max: 16, label: 'The unit', field: 'unit' })
  } else if (progressKind === 'milestones') {
    const list = Array.isArray(input?.milestones) ? input.milestones : []
    if (list.length < 2 || list.length > 12) throw invalid('Add between 2 and 12 milestones.', 'milestones')
    milestones = list.map((m, i) => ({
      title: cleanLine(typeof m === 'string' ? m : m?.title, { min: 2, max: 80, label: `Milestone ${i + 1}`, field: 'milestones' }),
      doneAt: null,
    }))
    target = milestones.length
  }

  const startsAt = futureIso(input?.startsAt, { now, field: 'startsAt', label: 'The start' })
  const deadlineAt = futureIso(input?.deadlineAt, { now, field: 'deadlineAt', label: 'The deadline', minLeadMs: 5 * 60_000 })
  if (startsAt && deadlineAt && Date.parse(deadlineAt) <= Date.parse(startsAt)) {
    throw invalid('The deadline has to come after the start.', 'deadlineAt')
  }
  const goalId = typeof input?.goalId === 'string' && /^[\w-]{1,64}$/.test(input.goalId) ? input.goalId : null
  const xp = questXp({ type, difficulty, durationMin })
  return { type, title, description, category, difficulty, durationMin, progressKind, target, unit, milestones, startsAt, deadlineAt, goalId, xp, rarity: rarityFor(xp) }
}

function parseMilestones(row) {
  try {
    const list = row.milestones ? JSON.parse(row.milestones) : null
    return Array.isArray(list) ? list : null
  } catch {
    return null
  }
}

export function deriveStatus(row, now = Date.now(), level = Infinity) {
  if (TERMINAL.has(row.status)) return row.status
  if (row.min_level && level < row.min_level) return 'locked'
  if (row.deadline_at && now >= Date.parse(row.deadline_at)) return 'expired'
  if (row.starts_at && now < Date.parse(row.starts_at)) return 'upcoming'
  return row.started_at || row.progress_value > 0 || row.status === 'in_progress' ? 'in_progress' : 'active'
}

export function questView(row, { now = Date.now(), level = Infinity } = {}) {
  const status = deriveStatus(row, now, level)
  const milestones = parseMilestones(row)
  const target = row.progress_kind === 'check' ? 1 : row.progress_target ?? 1
  const value = row.progress_kind === 'check' ? (status === 'completed' ? 1 : 0) : Math.min(row.progress_value, target)
  return {
    id: row.id,
    type: row.type,
    origin: row.origin,
    title: row.title,
    description: row.description,
    category: row.category,
    difficulty: row.difficulty,
    durationMin: row.duration_min,
    xp: row.xp_reward,
    xpPaid: row.xp_paid,
    rarity: row.rarity,
    status,
    progress: {
      kind: row.progress_kind,
      target,
      value: status === 'completed' ? target : value,
      unit: row.progress_unit,
      percent: status === 'completed' ? 100 : Math.round((value / Math.max(1, target)) * 100),
      milestones: milestones?.map((m, index) => ({ index, title: m.title, done: Boolean(m.doneAt) })) ?? null,
    },
    period: row.period,
    goalId: row.goal_id,
    clubId: row.club_id,
    challengeId: row.challenge_id,
    minLevel: row.min_level,
    startsAt: row.starts_at,
    deadlineAt: row.deadline_at,
    createdAt: row.created_at,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    verified: row.verified_at ? { by: row.verified_by, at: row.verified_at } : null,
    pinned: Boolean(row.pinned),
  }
}

function loadQuest(userId, questId) {
  const row = db.get('SELECT * FROM quests WHERE id = ? AND user_id = ?', [String(questId ?? ''), userId])
  if (!row) throw notFound('That quest')
  return row
}

function playerLevel(userId) {
  const progress = getProgressRow(userId)
  return progress ? levelFromXp(progress.xp) : 1
}

/** Stores the expiry of quests whose deadline has passed, so counts and
 * history see them as expired too. */
function persistExpiry(rows, now) {
  const expired = rows.filter((r) => !TERMINAL.has(r.status) && r.deadline_at && now >= Date.parse(r.deadline_at))
  for (const row of expired) {
    db.run("UPDATE quests SET status = 'expired', updated_at = ? WHERE id = ? AND user_id = ? AND status IN ('active', 'in_progress', 'upcoming', 'locked')", [
      new Date(now).toISOString(),
      row.id,
      row.user_id,
    ])
    row.status = 'expired'
  }
}

/* --- creation and editing ------------------------------------------------ */

export function createQuest(userId, input) {
  const now = Date.now()
  const value = validateQuestInput(input, now)
  const open = db.get(
    "SELECT COUNT(*) AS n FROM quests WHERE user_id = ? AND status IN ('active', 'in_progress', 'upcoming', 'locked')",
    [userId],
  )?.n ?? 0
  if (open >= MAX_OPEN_QUESTS) throw conflict(`You have ${MAX_OPEN_QUESTS} open quests. Finish or abandon some first.`, 'too_many_open')
  const since = new Date(now - 86_400_000).toISOString()
  const recent = db.get("SELECT COUNT(*) AS n FROM quests WHERE user_id = ? AND origin = 'user' AND created_at > ?", [userId, since])?.n ?? 0
  if (recent >= MAX_CREATED_PER_DAY) throw conflict('That is a lot of new quests for one day. Try again tomorrow.', 'too_many_created')

  const id = randomUUID()
  const iso = new Date(now).toISOString()
  db.run(
    `INSERT INTO quests (id, user_id, type, origin, goal_id, title, description, category, difficulty, duration_min, xp_reward, rarity,
       progress_kind, progress_target, progress_unit, milestones, status, starts_at, deadline_at, created_at, updated_at)
     VALUES (?, ?, ?, 'user', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id, userId, value.type, value.goalId, value.title, value.description, value.category, value.difficulty, value.durationMin,
      value.xp, value.rarity, value.progressKind, value.target, value.unit, value.milestones ? JSON.stringify(value.milestones) : null,
      value.startsAt && Date.parse(value.startsAt) > now ? 'upcoming' : 'active', value.startsAt, value.deadlineAt, iso, iso,
    ],
  )
  return questView(loadQuest(userId, id), { level: playerLevel(userId) })
}

/** Text and dates can always change on an open quest; what sets its reward
 * can change only before any of it has been done. */
export function updateQuest(userId, questId, input) {
  const row = loadQuest(userId, questId)
  const now = Date.now()
  const status = deriveStatus(row, now)
  if (TERMINAL.has(status)) throw conflict('Finished quests cannot be edited.', 'finished')
  if (row.origin !== 'user' && row.origin !== 'legacy_todo') throw conflict('Only quests you wrote can be edited.', 'not_editable')

  const merged = {
    type: input?.type ?? row.type,
    title: input?.title ?? row.title,
    description: input?.description === undefined ? row.description : input.description,
    category: input?.category ?? row.category,
    difficulty: input?.difficulty ?? row.difficulty,
    durationMin: input?.durationMin ?? row.duration_min,
    progressKind: input?.progressKind ?? row.progress_kind,
    target: input?.target ?? row.progress_target,
    unit: input?.unit ?? row.progress_unit,
    milestones: input?.milestones ?? parseMilestones(row)?.map((m) => m.title),
    startsAt: input?.startsAt === undefined ? (row.starts_at && Date.parse(row.starts_at) > now ? row.starts_at : null) : input.startsAt,
    deadlineAt: input?.deadlineAt === undefined ? (row.deadline_at && Date.parse(row.deadline_at) > now + 5 * 60_000 ? row.deadline_at : null) : input.deadlineAt,
    goalId: input?.goalId === undefined ? row.goal_id : input.goalId,
  }
  if (!PLAYER_TYPES.includes(merged.type)) merged.type = 'optional'
  const value = validateQuestInput(merged, now)

  const touchesReward =
    value.type !== row.type ||
    value.difficulty !== row.difficulty ||
    value.durationMin !== row.duration_min ||
    value.progressKind !== row.progress_kind ||
    (value.target ?? null) !== (row.progress_target ?? null) ||
    JSON.stringify(value.milestones?.map((m) => m.title) ?? null) !== JSON.stringify(parseMilestones(row)?.map((m) => m.title) ?? null)
  if (touchesReward && (row.progress_value > 0 || row.xp_paid > 0 || row.started_at)) {
    throw conflict('Once a quest is under way, its type, size and progress are fixed.', 'reward_locked')
  }

  db.run(
    `UPDATE quests SET type = ?, title = ?, description = ?, category = ?, difficulty = ?, duration_min = ?, xp_reward = ?, rarity = ?,
       progress_kind = ?, progress_target = ?, progress_unit = ?, milestones = ?, starts_at = ?, deadline_at = ?, goal_id = ?,
       status = CASE WHEN status IN ('active', 'upcoming') THEN ? ELSE status END, updated_at = ?
     WHERE id = ? AND user_id = ?`,
    [
      value.type, value.title, value.description, value.category, value.difficulty, value.durationMin, value.xp, value.rarity,
      value.progressKind, value.target, value.unit, value.milestones ? JSON.stringify(value.milestones) : null, value.startsAt,
      value.deadlineAt, value.goalId, value.startsAt && Date.parse(value.startsAt) > now ? 'upcoming' : 'active',
      new Date(now).toISOString(), row.id, userId,
    ],
  )
  return questView(loadQuest(userId, row.id), { level: playerLevel(userId) })
}

export function deleteQuest(userId, questId) {
  const row = loadQuest(userId, questId)
  if (row.origin !== 'user' && row.origin !== 'legacy_todo') throw conflict('Only quests you wrote can be deleted.', 'not_deletable')
  if (row.status === 'completed' || row.xp_paid > 0) throw conflict('Quests that have paid XP stay in your history.', 'has_history')
  db.run('DELETE FROM quests WHERE id = ? AND user_id = ?', [row.id, userId])
}

/* --- progress ------------------------------------------------------------ */

function requireOpen(row, level) {
  const status = deriveStatus(row, Date.now(), level)
  if (status === 'locked') throw conflict(`This quest unlocks at level ${row.min_level}.`, 'locked')
  if (status === 'upcoming') throw conflict('This quest has not started yet.', 'upcoming')
  if (!OPEN.has(status)) throw conflict(`This quest is ${status.replace('_', ' ')}.`, `quest_${status}`)
  return status
}

export function startQuest(userId, questId) {
  const row = loadQuest(userId, questId)
  requireOpen(row, playerLevel(userId))
  const now = new Date().toISOString()
  db.run("UPDATE quests SET status = 'in_progress', started_at = COALESCE(started_at, ?), updated_at = ? WHERE id = ? AND user_id = ?", [
    now,
    now,
    row.id,
    userId,
  ])
  return questView(loadQuest(userId, row.id))
}

export function pinQuest(userId, questId, pinned) {
  const row = loadQuest(userId, questId)
  transaction(() => {
    if (pinned) db.run('UPDATE quests SET pinned = 0 WHERE user_id = ? AND pinned = 1', [userId])
    db.run('UPDATE quests SET pinned = ? WHERE id = ? AND user_id = ?', [pinned ? 1 : 0, row.id, userId])
  })
  return questView(loadQuest(userId, row.id))
}

export function abandonQuest(userId, questId) {
  const row = loadQuest(userId, questId)
  if (row.type === 'challenge' || row.type === 'club') throw conflict('This quest ends with its challenge.', 'not_abandonable')
  const status = deriveStatus(row)
  if (TERMINAL.has(status)) throw conflict(`This quest is already ${status}.`, `quest_${status}`)
  db.run("UPDATE quests SET status = 'failed', pinned = 0, updated_at = ? WHERE id = ? AND user_id = ?", [new Date().toISOString(), row.id, userId])
  return questView(loadQuest(userId, row.id))
}

/** How much self-reported XP may still be paid today. */
function selfReportedRoom(rewards) {
  return Math.max(0, SELF_REPORTED_DAILY_XP - paidToday(rewards.userId, rewards.today, ['quest', 'quest_step'], { selfReportedOnly: true }))
}

/** Pays toward a quest, capped when self-reported. Returns XP paid. */
function payToward(rewards, row, { source, sourceId, amount, verified, label }) {
  if (amount <= 0) {
    rewards.pay({ source, sourceId, xp: 0, label, verified, streak: true })
    return 0
  }
  let payable = amount
  if (!verified) {
    const room = selfReportedRoom(rewards)
    if (room < amount) rewards.summary.capped = true
    payable = Math.min(amount, room)
  }
  const paid = rewards.pay({ source, sourceId, xp: payable, label, verified, streak: true })
  if (paid) db.run('UPDATE quests SET xp_paid = xp_paid + ? WHERE id = ? AND user_id = ?', [paid, row.id, row.user_id])
  return paid
}

/**
 * Marks a quest complete and pays whatever it still owes.
 *
 * @param {'self' | 'focus' | 'proof' | 'system'} via  how completion was established
 */
export function finishQuest(userId, questId, via, { rewards: outer = null } = {}) {
  return transaction(() => {
    const row = loadQuest(userId, questId)
    const level = playerLevel(userId)
    requireOpen(row, level)
    const now = new Date().toISOString()
    const claimed = db.run(
      `UPDATE quests SET status = 'completed', completed_at = ?, pinned = 0, updated_at = ?,
         progress_value = COALESCE(progress_target, progress_value)
       WHERE id = ? AND user_id = ? AND status IN ('active', 'in_progress', 'upcoming')`,
      [now, now, row.id, userId],
    )
    if (!claimed.changes) throw conflict('This quest is already finished.', 'quest_completed')

    const rewards = outer ?? startRewards(userId)
    const verified = via !== 'self'
    const owed = Math.max(0, row.xp_reward - row.xp_paid)
    payToward(rewards, row, { source: 'quest', sourceId: row.id, amount: owed, verified, label: row.title })

    if (row.type !== 'daily' && row.type !== 'optional') {
      notify(userId, {
        kind: 'quest_completed',
        title: `Quest complete: ${row.title}`,
        body: `+${row.xp_reward} XP ${verified ? '' : '(self-reported)'}`.trim(),
        link: '/quests',
        data: { questId: row.id },
      })
    }
    if (isFirst(userId, 'first_quest')) track(userId, 'first_quest', { type: row.type })
    track(userId, 'quest_completed', { type: row.type, rarity: row.rarity, via })

    if (outer) return { quest: questView(loadQuest(userId, row.id)) }
    const summary = rewards.finish()
    return { quest: questView(loadQuest(userId, row.id), { level: summary.progress.level }), rewards: summary }
  })
}

export function completeQuest(userId, questId) {
  const row = loadQuest(userId, questId)
  if (row.progress_kind === 'minutes') {
    throw conflict('This quest fills with focus time. Enter Focus Mode to complete it.', 'needs_focus')
  }
  if (row.progress_kind === 'count') throw conflict(`Log your ${row.progress_unit ?? 'progress'} to complete this quest.`, 'needs_progress')
  if (row.progress_kind === 'milestones') throw conflict('Tick off its milestones to complete this quest.', 'needs_milestones')
  return finishQuest(userId, row.id, 'self')
}

/** Adds units to a count quest, paying in proportion as it grows. */
export function logProgress(userId, questId, deltaInput) {
  return transaction(() => {
    const row = loadQuest(userId, questId)
    if (row.progress_kind !== 'count') throw conflict('This quest is not measured in units.', 'wrong_kind')
    requireOpen(row, playerLevel(userId))
    const delta = Math.round(Number(deltaInput))
    const target = row.progress_target ?? 1
    if (!Number.isFinite(delta) || delta < 1 || delta > 10_000) throw invalid('Log between 1 and 10,000.', 'delta')
    const value = Math.min(target, row.progress_value + delta)
    const now = new Date().toISOString()
    const moved = db.run(
      `UPDATE quests SET progress_value = ?, status = 'in_progress', started_at = COALESCE(started_at, ?), updated_at = ?
       WHERE id = ? AND user_id = ? AND progress_value = ?`,
      [value, now, now, row.id, userId, row.progress_value],
    )
    if (!moved.changes) throw conflict('That quest changed. Try again.', 'stale')

    if (value >= target) return finishQuest(userId, row.id, 'self')

    const rewards = startRewards(userId)
    const earnedSoFar = Math.floor((row.xp_reward * value) / target)
    payToward(rewards, row, {
      source: 'quest_step',
      sourceId: `${row.id}:v${value}`,
      amount: Math.max(0, earnedSoFar - row.xp_paid),
      verified: false,
      label: `${row.title} (${value}/${target} ${row.progress_unit ?? ''})`.trim(),
    })
    const summary = rewards.finish()
    return { quest: questView(loadQuest(userId, row.id), { level: summary.progress.level }), rewards: summary }
  })
}

/** Ticks or unticks a milestone. A step pays once, the first time it is ticked. */
export function setMilestone(userId, questId, indexInput, done) {
  return transaction(() => {
    const row = loadQuest(userId, questId)
    if (row.progress_kind !== 'milestones') throw conflict('This quest has no milestones.', 'wrong_kind')
    requireOpen(row, playerLevel(userId))
    const list = parseMilestones(row) ?? []
    const index = Math.round(Number(indexInput))
    if (!Number.isInteger(index) || index < 0 || index >= list.length) throw notFound('That milestone')
    const now = new Date().toISOString()
    list[index] = { ...list[index], doneAt: done ? list[index].doneAt ?? now : null }
    const doneCount = list.filter((m) => m.doneAt).length
    db.run(
      `UPDATE quests SET milestones = ?, progress_value = ?, status = 'in_progress', started_at = COALESCE(started_at, ?), updated_at = ?
       WHERE id = ? AND user_id = ?`,
      [JSON.stringify(list), doneCount, now, now, row.id, userId],
    )
    if (doneCount >= list.length) return finishQuest(userId, row.id, 'self')

    const rewards = startRewards(userId)
    if (done) {
      const perStep = Math.floor(row.xp_reward / list.length)
      payToward(rewards, row, {
        source: 'quest_step',
        sourceId: `${row.id}:m${index}`,
        amount: perStep,
        verified: false,
        label: `${row.title}: ${list[index].title}`,
      })
    }
    const summary = rewards.finish()
    return { quest: questView(loadQuest(userId, row.id), { level: summary.progress.level }), rewards: summary }
  })
}

/**
 * Adds server-timed focus minutes to a minutes quest, completing it when full.
 * Called from the focus session's settlement, inside its transaction.
 */
export function addFocusMinutes(userId, questId, minutes, rewards) {
  const row = db.get('SELECT * FROM quests WHERE id = ? AND user_id = ?', [questId, userId])
  if (!row) return null
  const status = deriveStatus(row, Date.now(), playerLevel(userId))
  if (!OPEN.has(status)) return null
  const now = new Date().toISOString()

  if (row.progress_kind === 'minutes') {
    const target = row.progress_target ?? row.duration_min
    const value = Math.min(target, row.progress_value + Math.max(0, minutes))
    db.run(
      `UPDATE quests SET progress_value = ?, status = 'in_progress', started_at = COALESCE(started_at, ?), updated_at = ? WHERE id = ? AND user_id = ?`,
      [value, now, now, row.id, userId],
    )
    if (value >= target) return finishQuest(userId, row.id, 'focus', { rewards }).quest
    return questView(db.get('SELECT * FROM quests WHERE id = ?', [row.id]))
  }

  // A check quest done in one sitting of focus at least as long as its own
  // estimate counts as measured, not self-reported.
  if (row.progress_kind === 'check' && minutes >= Math.max(5, Math.floor(row.duration_min * 0.9))) {
    return finishQuest(userId, row.id, 'focus', { rewards }).quest
  }
  db.run(`UPDATE quests SET status = 'in_progress', started_at = COALESCE(started_at, ?), updated_at = ? WHERE id = ? AND user_id = ?`, [
    now,
    now,
    row.id,
    userId,
  ])
  return questView(db.get('SELECT * FROM quests WHERE id = ?', [row.id]))
}

/**
 * Proof was accepted for a quest: record it, complete the quest if it was not
 * already, and pay the bonus plus anything the daily ceiling held back.
 */
export function rewardProof(userId, questId, kind, note) {
  return transaction(() => {
    const row = loadQuest(userId, questId)
    if (row.verified_at) throw conflict('This quest has already been verified.', 'already_verified')
    const status = deriveStatus(row, Date.now(), playerLevel(userId))
    if (status !== 'completed' && !OPEN.has(status)) throw conflict(`This quest is ${status.replace('_', ' ')}.`, `quest_${status}`)
    const now = new Date().toISOString()
    db.run(
      `UPDATE quests SET verified_by = ?, verified_at = ?, verification_note = ?, updated_at = ? WHERE id = ? AND user_id = ? AND verified_at IS NULL`,
      [kind, now, String(note ?? '').slice(0, 300) || null, now, row.id, userId],
    )
    const rewards = startRewards(userId)
    if (status !== 'completed') {
      db.run(
        `UPDATE quests SET status = 'completed', completed_at = ?, pinned = 0, progress_value = COALESCE(progress_target, progress_value)
         WHERE id = ? AND user_id = ?`,
        [now, row.id, userId],
      )
    }
    const shortfall = Math.max(0, row.xp_reward - row.xp_paid)
    const bonus = VERIFY_BONUS[kind] ?? 0
    const paid = rewards.pay({ source: 'quest_verify', sourceId: row.id, xp: shortfall + bonus, label: `Proof: ${row.title}`, verified: true, streak: true })
    if (paid) db.run('UPDATE quests SET xp_paid = xp_paid + ? WHERE id = ? AND user_id = ?', [Math.min(paid, shortfall), row.id, userId])
    if (status !== 'completed') track(userId, 'quest_completed', { type: row.type, rarity: row.rarity, via: 'proof' })
    const summary = rewards.finish()
    return { quest: questView(loadQuest(userId, row.id), { level: summary.progress.level }), rewards: summary }
  })
}

/* --- lists ---------------------------------------------------------------- */

const SORT = { in_progress: 0, active: 1, upcoming: 2, locked: 3, completed: 4, expired: 5, failed: 6 }

/** Open quests plus what was finished today. */
export function questBoard(userId) {
  const progress = getProgressRow(userId)
  const level = progress ? levelFromXp(progress.xp) : 1
  const tz = safeTimezone(progress?.timezone)
  const today = dayKey(tz)
  const now = Date.now()
  const since = new Date(now - 36 * 3_600_000).toISOString()
  const rows = db.all(
    `SELECT * FROM quests WHERE user_id = ? AND (
       status IN ('active', 'in_progress', 'upcoming', 'locked') OR (status = 'completed' AND completed_at > ?)
     )`,
    [userId, since],
  )
  persistExpiry(rows, now)
  const views = rows
    .filter((r) => r.status !== 'expired' && !(r.status === 'completed' && dayKey(tz, new Date(r.completed_at)) !== today))
    .map((r) => questView(r, { now, level }))
  views.sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1
    const s = (SORT[a.status] ?? 9) - (SORT[b.status] ?? 9)
    if (s) return s
    const da = a.deadlineAt ? Date.parse(a.deadlineAt) : Infinity
    const dbb = b.deadlineAt ? Date.parse(b.deadlineAt) : Infinity
    if (da !== dbb) return da - dbb
    return b.xp - a.xp
  })
  return views
}

/** Finished, failed and expired quests, newest first. */
export function questHistory(userId, { before = null, limit = 30 } = {}) {
  const capped = Math.min(100, Math.max(1, limit))
  const rows = db.all(
    `SELECT * FROM quests WHERE user_id = ? AND status IN ('completed', 'failed', 'expired')
       ${before ? 'AND COALESCE(completed_at, updated_at) < ?' : ''}
     ORDER BY COALESCE(completed_at, updated_at) DESC LIMIT ?`,
    before ? [userId, before, capped + 1] : [userId, capped + 1],
  )
  return { quests: rows.slice(0, capped).map((r) => questView(r)), more: rows.length > capped }
}

export function getQuestView(userId, questId) {
  return questView(loadQuest(userId, questId), { level: playerLevel(userId) })
}

/** The quest Home should put in front of the player. */
export function featuredQuest(board) {
  const open = board.filter((q) => q.status === 'active' || q.status === 'in_progress')
  return (
    open.find((q) => q.pinned) ??
    open.find((q) => q.type === 'main' && q.status === 'in_progress') ??
    open.find((q) => q.type === 'main') ??
    open.find((q) => q.status === 'in_progress') ??
    [...open].sort((a, b) => b.xp - a.xp)[0] ??
    null
  )
}
