import type { Goal, Quest, QuestPeriod } from '../types'
import { TASK_TEMPLATES, fillTemplate } from '../data/taskTemplates'
import { periodKey, periodOrdinal, PERIOD_XP } from './period'
import { seededShuffle } from './rng'

/** Total quests handed out per period across *all* goals combined. Adding more
 * goals changes which quests you get, never how many. */
export const QUESTS_PER_PERIOD: Record<QuestPeriod, number> = {
  daily: 2,
  weekly: 1,
  monthly: 3,
}

/** Longest period first: monthly is fixed for a month and weekly for a week, so
 * the daily slate is the one that should bend to avoid duplicating them. */
const FILL_ORDER: QuestPeriod[] = ['monthly', 'weekly', 'daily']

/**
 * The nth quest for one goal in one period, or null once that goal has run out
 * of distinct templates. The shuffle is seeded per goal+period+key, so the same
 * index always yields the same quest — that keeps ids stable across reloads.
 */
function buildQuest(goal: Goal, period: QuestPeriod, key: string, index: number): Quest | null {
  const templates = TASK_TEMPLATES[goal.category][period]
  const ordered = seededShuffle(templates, `${goal.id}:${period}:${key}`)
  const template = ordered[index]
  if (!template) return null

  return {
    id: `${goal.id}-${period}-${key}-${index}`,
    goalId: goal.id,
    period,
    periodKey: key,
    title: fillTemplate(template, goal.title),
    xp: PERIOD_XP[period],
    completed: false,
    completedAt: null,
  }
}

/**
 * The quest slate for a period, drawn from every active goal but capped at a
 * fixed total.
 *
 * `covered` names goals already given a quest by a longer period this cycle.
 * Those are pushed to the back rather than removed, so the slate spreads across
 * as many different goals as possible but still fills every slot when there are
 * fewer goals than slots.
 */
export function generateQuestsForPeriod(
  goals: Goal[],
  period: QuestPeriod,
  date: Date = new Date(),
  covered: ReadonlySet<string> = new Set(),
): Quest[] {
  const active = goals.filter((g) => !g.archived)
  const cap = QUESTS_PER_PERIOD[period]
  if (!active.length || cap <= 0) return []

  const key = periodKey(period, date)
  const offset = periodOrdinal(period, date) % active.length
  const ordered = [...active.slice(offset), ...active.slice(0, offset)]

  // Uncovered goals first, then the rest as fallback.
  const pool = [...ordered.filter((g) => !covered.has(g.id)), ...ordered.filter((g) => covered.has(g.id))]

  const picked: Quest[] = []
  for (let round = 0; picked.length < cap; round++) {
    let addedThisRound = 0
    for (const goal of pool) {
      if (picked.length >= cap) break
      const quest = buildQuest(goal, period, key, round)
      if (!quest) continue
      picked.push(quest)
      addedThisRound++
    }
    // Every goal is out of templates — stop rather than loop forever.
    if (addedThisRound === 0) break
  }

  return picked
}

/**
 * Tops each period up to its cap for the current day/week/month.
 *
 * Monthly is filled first, then weekly avoiding whatever monthly claimed. Those
 * two are stable for a month and a week respectively, so between them they keep
 * four different goals permanently visible.
 *
 * Daily deliberately does NOT avoid them. It rotates freely across every goal by
 * day, because a daily quest's job is to feel different each morning. An earlier
 * version had daily dodge the goals monthly and weekly held, which sounds
 * tidier but was much worse: with five goals exactly one was left uncovered, and
 * since monthly and weekly never move, the daily slate locked onto that single
 * goal every day for weeks.
 *
 * Only ever adds. Quests already generated for a period hold their slots, so
 * adding a goal midway through a day cannot push you over the cap — the new goal
 * becomes eligible from the next period onward.
 */
export function ensureCurrentQuests(goals: Goal[], existing: Quest[], date: Date = new Date()): Quest[] {
  const activeIds = new Set(goals.filter((g) => !g.archived).map((g) => g.id))
  const existingIds = new Set(existing.map((q) => q.id))
  const additions: Quest[] = []
  const covered = new Set<string>()

  for (const period of FILL_ORDER) {
    const key = periodKey(period, date)
    // Quests belonging to archived goals don't hold a slot — archiving frees it.
    const live = existing.filter(
      (q) => q.period === period && q.periodKey === key && activeIds.has(q.goalId),
    )
    // Goals already represented here count as covered even when persisted from
    // an earlier run, so a stored monthly quest still steers today's daily pick.
    for (const quest of live) covered.add(quest.goalId)

    let slots = QUESTS_PER_PERIOD[period] - live.length
    if (slots <= 0) continue

    // Daily ignores what the longer periods hold — see the note above.
    const avoid = period === 'daily' ? new Set<string>() : covered

    for (const quest of generateQuestsForPeriod(goals, period, date, avoid)) {
      if (slots <= 0) break
      if (existingIds.has(quest.id)) continue
      additions.push(quest)
      existingIds.add(quest.id)
      covered.add(quest.goalId)
      slots--
    }
  }

  return additions.length ? [...existing, ...additions] : existing
}
