import { randomUUID } from 'node:crypto'
import { db } from '../db.js'
import { periodEnd, safeTimezone, weekKey } from './clock.js'
import { conflict, invalid, notFound } from './errors.js'
import { levelFromXp } from './levels.js'
import { notify } from './notify.js'
import { onboardingSteps, setFlag } from './onboarding.js'
import { getQuestView, questView, questXp, rarityFor } from './quests.js'
import { getProgressRow, progressView, startRewards, transaction } from './rewards.js'

/**
 * The Questly world: regions to explore, what opens them, the quests each
 * one offers this week, and the events that run across the month.
 *
 * Nothing here is decoration. A region's lock is judged from the player's own
 * record; its quests are real quests, paid by the same rules as any other;
 * an event's progress is counted from what the server saw happen, and its
 * reward goes through the ledger once.
 */

/* --- regions -------------------------------------------------------------- */

/**
 * Ids are stable — quests and clubs refer to them — while the names are the
 * places on the painted map.
 *
 * Requirement kinds:
 *   level        reach a level
 *   elite_quests completed quests of epic or legendary rarity
 *   first_quests the four first quests every new player is given
 */
export const REGIONS = [
  { id: 'focus_sanctum', name: 'Verdant Woods', requires: [] },
  { id: 'scholars_sanctuary', name: 'Mistveil Swamp', requires: [] },
  { id: 'builders_district', name: 'Golden Plains', requires: [] },
  { id: 'creators_quarter', name: 'Coastal Crown', requires: [] },
  { id: 'training_grounds', name: 'Frostpeak', requires: [] },
  { id: 'archive', name: 'The Lost Ruins', requires: [] },
  { id: 'digital_workshop', name: 'Emberlands', requires: [{ type: 'level', level: 3 }] },
  { id: 'innovation_district', name: 'Sunscorch', requires: [{ type: 'level', level: 8 }, { type: 'first_quests' }] },
  { id: 'elite_region', name: 'The Summit', requires: [{ type: 'level', level: 15 }, { type: 'elite_quests', count: 3 }] },
]

const REGION_IDS = new Set(REGIONS.map((r) => r.id))

/**
 * Two quests a week per region, the same for everyone. Minutes are filled only
 * by focus sessions the server timed; checks, counts and steps are
 * self-reported and share the daily ceiling like any other.
 */
const REGION_QUESTS = {
  focus_sanctum: [
    { key: 'vigil', title: 'Sanctum Vigil', description: 'Ninety minutes of timed focus this week, on anything that matters.', type: 'side', difficulty: 'normal', durationMin: 90, progressKind: 'minutes', target: 90, category: 'wellness' },
    { key: 'deep-current', title: 'The Deep Current', description: 'Forty-five minutes of deep, distraction-free focus.', type: 'side', difficulty: 'hard', durationMin: 45, progressKind: 'minutes', target: 45, category: 'wellness' },
  ],
  scholars_sanctuary: [
    { key: 'tome', title: 'Tome of Recall', description: 'An hour of study timed in Focus Mode: flashcards, reading or practice.', type: 'side', difficulty: 'normal', durationMin: 60, progressKind: 'minutes', target: 60, category: 'learning' },
    { key: 'lecture', title: 'Lecture Notes', description: 'Take one topic from this week and make it yours.', type: 'side', difficulty: 'normal', durationMin: 30, progressKind: 'milestones', milestones: ['Pick a topic', 'Summarise it in five points', 'Test yourself on it'], category: 'learning' },
  ],
  builders_district: [
    { key: 'blueprint', title: 'The Blueprint', description: 'Plan the week: place five quests on days in the Planner.', type: 'side', difficulty: 'easy', durationMin: 20, progressKind: 'check', category: 'career' },
    { key: 'foundation', title: 'Lay a Foundation', description: 'Two hours on your biggest project, timed in Focus Mode.', type: 'side', difficulty: 'normal', durationMin: 120, progressKind: 'minutes', target: 120, category: 'career' },
  ],
  creators_quarter: [
    { key: 'make', title: 'Make Something', description: 'Finish one small creative piece and share it on the Adventure Log.', type: 'side', difficulty: 'normal', durationMin: 45, progressKind: 'check', category: 'creative' },
    { key: 'studio', title: 'Studio Hours', description: 'Ninety minutes of creative work, timed in Focus Mode.', type: 'side', difficulty: 'normal', durationMin: 90, progressKind: 'minutes', target: 90, category: 'creative' },
  ],
  training_grounds: [
    { key: 'drills', title: 'Daily Drills', description: 'Train on four days this week and log each one.', type: 'side', difficulty: 'normal', durationMin: 80, progressKind: 'count', target: 4, unit: 'sessions', category: 'fitness' },
    { key: 'endurance', title: 'Endurance Trial', description: 'One long session: an hour of training.', type: 'side', difficulty: 'hard', durationMin: 60, progressKind: 'check', category: 'fitness' },
  ],
  archive: [
    { key: 'chronicle', title: "Chronicler's Duty", description: 'Look back on your week before the next one starts.', type: 'side', difficulty: 'easy', durationMin: 20, progressKind: 'milestones', milestones: ['What worked', 'What did not', 'What comes next'], category: 'wellness' },
    { key: 'restore', title: 'Restore an Old Quest', description: 'Finish something you abandoned or kept putting off.', type: 'side', difficulty: 'normal', durationMin: 45, progressKind: 'check', category: 'general' },
  ],
  digital_workshop: [
    { key: 'automate', title: 'Automate the Grind', description: 'Turn a goal into a dated plan with the AI Planner.', type: 'side', difficulty: 'easy', durationMin: 20, progressKind: 'check', category: 'career' },
    { key: 'forge', title: 'Code Forge', description: 'Two focused hours building something digital.', type: 'side', difficulty: 'normal', durationMin: 120, progressKind: 'minutes', target: 120, category: 'learning' },
  ],
  innovation_district: [
    { key: 'prototype', title: 'Prototype', description: 'Two and a half hours of timed work on a new idea.', type: 'side', difficulty: 'hard', durationMin: 150, progressKind: 'minutes', target: 150, category: 'career' },
    { key: 'pitch', title: 'The Pitch', description: 'Put your idea on one page.', type: 'side', difficulty: 'normal', durationMin: 60, progressKind: 'milestones', milestones: ['The problem', 'Your idea', 'The first step'], category: 'career' },
  ],
  elite_region: [
    { key: 'trial', title: 'Elite Trial', description: 'Four hours of timed focus in a single week.', type: 'main', difficulty: 'heroic', durationMin: 240, progressKind: 'minutes', target: 240, category: 'general' },
    { key: 'mastery', title: 'Mark of Mastery', description: 'Finish a legendary quest from your board.', type: 'main', difficulty: 'hard', durationMin: 120, progressKind: 'check', category: 'general' },
  ],
}

function playerRecord(userId) {
  const progress = getProgressRow(userId)
  const level = levelFromXp(progress?.xp ?? 0)
  const eliteQuests =
    db.get("SELECT COUNT(*) AS n FROM quests WHERE user_id = ? AND status = 'completed' AND rarity IN ('epic', 'legendary')", [userId])?.n ?? 0
  let firstQuests = false
  try {
    firstQuests = Boolean(JSON.parse(progress?.flags ?? '{}').onboardingDone) || onboardingSteps(userId).complete
  } catch {
    firstQuests = false
  }
  return { progress, level, eliteQuests, firstQuests }
}

function requirementView(req, record) {
  if (req.type === 'level') {
    return { type: 'level', label: `Reach level ${req.level}`, current: Math.min(record.level, req.level), target: req.level, met: record.level >= req.level }
  }
  if (req.type === 'elite_quests') {
    return {
      type: 'elite_quests',
      label: `Complete ${req.count} elite quests`,
      current: Math.min(record.eliteQuests, req.count),
      target: req.count,
      met: record.eliteQuests >= req.count,
    }
  }
  return { type: 'first_quests', label: 'Complete your first quests', current: record.firstQuests ? 1 : 0, target: 1, met: record.firstQuests }
}

function regionView(region, record) {
  const requirements = region.requires.map((r) => requirementView(r, record))
  return { id: region.id, name: region.name, unlocked: requirements.every((r) => r.met), requirements }
}

/* --- region quests ------------------------------------------------------------ */

function genKey(regionId, week, key) {
  return `world|${regionId}|${week}|${key}`
}

function templateXp(t) {
  return questXp({ type: t.type, difficulty: t.difficulty, durationMin: t.durationMin })
}

function offeredQuests(userId, regionId, tz, now) {
  const week = weekKey(tz, now)
  const level = levelFromXp(getProgressRow(userId)?.xp ?? 0)
  return (REGION_QUESTS[regionId] ?? []).map((t) => {
    const row = db.get('SELECT * FROM quests WHERE user_id = ? AND gen_key = ?', [userId, genKey(regionId, week, t.key)])
    const xp = templateXp(t)
    return {
      key: t.key,
      title: t.title,
      description: t.description,
      type: t.type,
      difficulty: t.difficulty,
      durationMin: t.durationMin,
      progressKind: t.progressKind,
      target: t.progressKind === 'check' ? 1 : t.progressKind === 'milestones' ? t.milestones.length : t.target,
      unit: t.progressKind === 'count' ? t.unit ?? null : null,
      xp,
      rarity: rarityFor(xp),
      quest: row ? questView(row, { now: now.getTime(), level }) : null,
    }
  })
}

/** Puts one of a region's quests for this week on the player's board. */
export function takeRegionQuest(userId, regionId, key, now = new Date()) {
  if (!REGION_IDS.has(regionId)) throw notFound('That region does not exist.')
  const template = (REGION_QUESTS[regionId] ?? []).find((t) => t.key === key)
  if (!template) throw notFound('That quest is not offered here.')
  const record = playerRecord(userId)
  const region = REGIONS.find((r) => r.id === regionId)
  if (!regionView(region, record).unlocked) throw conflict(`${region.name} is still locked.`, 'region_locked')

  const tz = safeTimezone(record.progress?.timezone)
  const week = weekKey(tz, now)
  const gen = genKey(regionId, week, key)
  const existing = db.get('SELECT id FROM quests WHERE user_id = ? AND gen_key = ?', [userId, gen])
  if (existing) throw conflict('You have already taken this quest this week.', 'already_taken')

  const xp = templateXp(template)
  const iso = now.toISOString()
  const id = randomUUID()
  const milestones = template.progressKind === 'milestones' ? JSON.stringify(template.milestones.map((title) => ({ title, doneAt: null }))) : null
  const target = template.progressKind === 'check' ? null : template.progressKind === 'milestones' ? template.milestones.length : template.target
  const inserted = db.run(
    `INSERT OR IGNORE INTO quests (id, user_id, type, origin, gen_key, title, description, category, difficulty, duration_min, xp_reward, rarity,
       progress_kind, progress_target, progress_unit, milestones, status, deadline_at, created_at, updated_at)
     VALUES (?, ?, ?, 'world', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?)`,
    [
      id, userId, template.type, gen, template.title, `${region.name} · ${template.description}`, template.category, template.difficulty,
      template.durationMin, xp, rarityFor(xp), template.progressKind, target, template.progressKind === 'count' ? template.unit ?? null : null,
      milestones, periodEnd('weekly', tz, now), iso, iso,
    ],
  )
  if (!inserted.changes) throw conflict('You have already taken this quest this week.', 'already_taken')
  return getQuestView(userId, id)
}

/* --- events --------------------------------------------------------------------- */

/**
 * The monthly calendar, in UTC so everyone shares the same event at the same
 * time. Goals:
 *   focus_minutes  minutes of focus the server timed inside the window
 *   quests         quests completed inside the window
 *   posts          Adventure Log posts shared inside the window (and not deleted)
 */
const EVENT_CALENDAR = [
  { slug: 'focus-festival', title: '7-Day Focus Festival', region: 'focus_sanctum', from: 1, to: 7, goal: { kind: 'focus_minutes', target: 300 }, xp: 150, blurb: 'Five hours of timed focus across the festival week.' },
  { slug: 'scholars-challenge', title: "Scholar's Challenge", region: 'scholars_sanctuary', from: 8, to: 14, goal: { kind: 'quests', target: 8 }, xp: 120, blurb: 'Complete eight quests while the challenge runs.' },
  { slug: 'creator-week', title: 'Creator Week', region: 'creators_quarter', from: 15, to: 21, goal: { kind: 'posts', target: 3 }, xp: 100, blurb: 'Share three things you made or learned on the Adventure Log.' },
  { slug: 'startup-sprint', title: 'Startup Sprint', region: 'builders_district', from: 22, to: 31, goal: { kind: 'focus_minutes', target: 240 }, xp: 120, blurb: 'Four hours of timed work on what you are building.' },
]

const GOAL_LABEL = {
  focus_minutes: (n) => `${n} minutes of timed focus`,
  quests: (n) => `${n} quests completed`,
  posts: (n) => `${n} posts shared`,
}

function monthEvents(year, month) {
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate()
  const mm = String(month + 1).padStart(2, '0')
  return EVENT_CALENDAR.map((e) => ({
    ...e,
    id: `${e.slug}-${year}-${mm}`,
    startsAt: new Date(Date.UTC(year, month, e.from)).toISOString(),
    endsAt: new Date(Date.UTC(year, month, Math.min(e.to, lastDay) + 1)).toISOString(),
  }))
}

/** This month's events and last month's final one, in order. */
function eventsAround(now) {
  const y = now.getUTCFullYear()
  const m = now.getUTCMonth()
  const previous = monthEvents(m === 0 ? y - 1 : y, m === 0 ? 11 : m - 1)
  const next = monthEvents(m === 11 ? y + 1 : y, m === 11 ? 0 : m + 1)
  return [previous[previous.length - 1], ...monthEvents(y, m), next[0]]
}

function eventProgress(userId, event) {
  const args = [userId, event.startsAt, event.endsAt]
  if (event.goal.kind === 'focus_minutes') {
    const ms = db.get(
      "SELECT COALESCE(SUM(active_ms), 0) AS n FROM focus_sessions WHERE user_id = ? AND status IN ('completed', 'ended') AND ended_at >= ? AND ended_at < ?",
      args,
    )?.n ?? 0
    return Math.floor(ms / 60_000)
  }
  if (event.goal.kind === 'quests') {
    return db.get("SELECT COUNT(*) AS n FROM quests WHERE user_id = ? AND status = 'completed' AND completed_at >= ? AND completed_at < ?", args)?.n ?? 0
  }
  return db.get('SELECT COUNT(*) AS n FROM posts WHERE user_id = ? AND deleted_at IS NULL AND created_at >= ? AND created_at < ?', args)?.n ?? 0
}

function eventView(userId, event, now) {
  const current = eventProgress(userId, event)
  const settled = Boolean(db.get("SELECT 1 AS x FROM xp_ledger WHERE user_id = ? AND source = 'event' AND source_id = ?", [userId, event.id]))
  const state = now < Date.parse(event.startsAt) ? 'upcoming' : now < Date.parse(event.endsAt) ? 'active' : 'ended'
  return {
    id: event.id,
    title: event.title,
    region: event.region,
    blurb: event.blurb,
    startsAt: event.startsAt,
    endsAt: event.endsAt,
    state,
    goal: { kind: event.goal.kind, label: GOAL_LABEL[event.goal.kind](event.goal.target), current: Math.min(current, event.goal.target), target: event.goal.target },
    xp: event.xp,
    completed: settled || current >= event.goal.target,
  }
}

/**
 * Pays any event goal the player has reached — including one reached before
 * an event ended that is only being looked at now — and announces the event
 * that is running, once each. Returns the reward summary when something paid.
 */
export function settleWorldEvents(userId, now = new Date()) {
  const progress = getProgressRow(userId)
  if (!progress) return null
  const at = now.getTime()
  const events = eventsAround(now).filter((e) => Date.parse(e.startsAt) <= at && at - Date.parse(e.endsAt) < 14 * 86_400_000)
  let summary = null
  for (const event of events) {
    if (eventProgress(userId, event) < event.goal.target) continue
    const paid = transaction(() => {
      const rewards = startRewards(userId)
      if (rewards.isSettled('event', event.id)) return null
      rewards.pay({ source: 'event', sourceId: event.id, xp: event.xp, label: event.title })
      return rewards.finish()
    })
    if (paid) {
      summary = paid
      notify(userId, {
        kind: 'world_event',
        title: `Event complete: ${event.title}`,
        body: `You reached the goal. +${event.xp} XP`,
        link: '/world',
        data: { eventId: event.id },
      })
    }
  }

  const running = eventsAround(now).find((e) => Date.parse(e.startsAt) <= at && at < Date.parse(e.endsAt))
  let flags = {}
  try {
    flags = JSON.parse(progress.flags ?? '{}') ?? {}
  } catch {
    flags = {}
  }
  if (running && flags.lastEventNotice !== running.id) {
    setFlag(userId, 'lastEventNotice', running.id)
    notify(userId, {
      kind: 'world_event',
      title: `${running.title} has begun`,
      body: `${running.blurb} Reward: +${running.xp} XP.`,
      link: '/world',
      data: { eventId: running.id },
    })
  }
  return summary
}

/* --- the whole world, as one player sees it -------------------------------------- */

export function worldView(userId, now = new Date()) {
  const record = playerRecord(userId)
  const tz = safeTimezone(record.progress?.timezone)
  const regions = REGIONS.map((region) => {
    const view = regionView(region, record)
    return { ...view, quests: view.unlocked ? offeredQuests(userId, region.id, tz, now) : [] }
  })
  const at = now.getTime()
  const events = eventsAround(now)
    .filter((e) => at - Date.parse(e.endsAt) < 3 * 86_400_000 && Date.parse(e.startsAt) - at < 10 * 86_400_000)
    .map((e) => eventView(userId, e, at))
  return {
    level: record.level,
    progress: progressView(record.progress),
    regions,
    events,
  }
}

export function assertRegion(regionId) {
  if (!REGION_IDS.has(regionId)) throw invalid('That region does not exist.', 'region')
}
