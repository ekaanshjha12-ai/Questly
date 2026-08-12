import type { AppState } from '../types'
import { dailyKey, startOfDay } from './period'

/**
 * Everything the progress tracker shows that can be counted rather than judged.
 *
 * All of it comes straight from state, so the tiles work with no API key and
 * cost nothing to display. Only the success probability needs the model.
 */
export interface ProgressStats {
  totalFocusMs: number
  focusSessions: number
  currentStreak: number
  longestStreak: number
  questsCompleted: number
  questsVerified: number
  todosCompleted: number
  todosOpen: number
  level: number
  xp: number
  /** Whole days since the account was made, minimum 1. */
  accountAgeDays: number
  /** Distinct days that saw at least one completion — the honest measure of
   * consistency, since a streak only reflects the current run. */
  activeDays: number
  activeDaysLast14: number
  completionsLast7: number
  completionsLast30: number
  /** Days since anything was completed, or null if nothing ever has been. */
  daysSinceLastActivity: number | null
}

export interface GoalProgress {
  id: string
  title: string
  category: string
  detail?: string
  ageDays: number
  questsCompleted: number
  questsVerified: number
  focusMinutes: number
}

function daysBetween(fromIso: string, to: Date): number {
  const from = startOfDay(new Date(fromIso)).getTime()
  if (!Number.isFinite(from)) return 0
  return Math.max(0, Math.round((startOfDay(to).getTime() - from) / 86400000))
}

/** Every day on which the player finished something, newest first. */
function completionDays(state: AppState): string[] {
  const days = new Set<string>()
  for (const quest of state.quests) {
    if (quest.completedAt) days.add(dailyKey(new Date(quest.completedAt)))
  }
  for (const todo of state.todos) {
    if (todo.completedAt) days.add(dailyKey(new Date(todo.completedAt)))
  }
  for (const session of state.sessions) {
    if (session.endedAt) days.add(dailyKey(new Date(session.endedAt)))
  }
  return [...days].sort().reverse()
}

function countCompletionsSince(state: AppState, cutoff: number): number {
  let n = 0
  for (const quest of state.quests) {
    if (quest.completedAt && new Date(quest.completedAt).getTime() >= cutoff) n++
  }
  for (const todo of state.todos) {
    if (todo.completedAt && new Date(todo.completedAt).getTime() >= cutoff) n++
  }
  for (const session of state.sessions) {
    if (session.endedAt && new Date(session.endedAt).getTime() >= cutoff) n++
  }
  return n
}

export function computeStats(state: AppState, now: Date = new Date()): ProgressStats {
  const days = completionDays(state)
  const last14Cutoff = dailyKey(new Date(now.getTime() - 13 * 86400000))

  return {
    totalFocusMs: state.sessions.reduce((sum, s) => sum + Math.max(0, s.durationMs), 0),
    focusSessions: state.sessions.length,
    currentStreak: state.streak.current,
    longestStreak: state.streak.longest,
    questsCompleted: state.quests.filter((q) => q.completed).length,
    questsVerified: state.quests.filter((q) => q.verifiedBy).length,
    todosCompleted: state.todos.filter((t) => t.done).length,
    todosOpen: state.todos.filter((t) => !t.done).length,
    level: state.progression.level,
    xp: state.player.xp,
    accountAgeDays: Math.max(1, daysBetween(state.player.createdAt, now)),
    activeDays: days.length,
    activeDaysLast14: days.filter((d) => d >= last14Cutoff).length,
    completionsLast7: countCompletionsSince(state, now.getTime() - 7 * 86400000),
    completionsLast30: countCompletionsSince(state, now.getTime() - 30 * 86400000),
    daysSinceLastActivity: days.length ? daysBetween(days[0], now) : null,
  }
}

export function goalProgress(state: AppState, now: Date = new Date()): GoalProgress[] {
  return state.goals
    .filter((g) => !g.archived)
    .map((goal) => {
      const quests = state.quests.filter((q) => q.goalId === goal.id)
      const focusMs = state.sessions
        .filter((s) => s.goalId === goal.id)
        .reduce((sum, s) => sum + Math.max(0, s.durationMs), 0)
      return {
        id: goal.id,
        title: goal.title,
        category: goal.category,
        ...(goal.detail ? { detail: goal.detail } : {}),
        ageDays: daysBetween(goal.createdAt, now),
        questsCompleted: quests.filter((q) => q.completed).length,
        questsVerified: quests.filter((q) => q.verifiedBy).length,
        focusMinutes: Math.round(focusMs / 60000),
      }
    })
}

/** Below this there is not enough behaviour to read anything into, and a
 * confident number would be invented rather than measured. A new account gets
 * told that plainly instead of being handed a discouraging score it did nothing
 * to earn. */
export const MIN_ACTIVE_DAYS = 3
export const MIN_COMPLETIONS = 5

export interface Evidence {
  enough: boolean
  activeDays: number
  completions: number
  /** What the user still needs to do before a score means anything. */
  shortfall: string | null
}

export function evidenceFor(stats: ProgressStats): Evidence {
  const completions = stats.questsCompleted + stats.todosCompleted + stats.focusSessions
  const enough = stats.activeDays >= MIN_ACTIVE_DAYS && completions >= MIN_COMPLETIONS

  let shortfall: string | null = null
  if (!enough) {
    const needDays = Math.max(0, MIN_ACTIVE_DAYS - stats.activeDays)
    const needDone = Math.max(0, MIN_COMPLETIONS - completions)
    const parts: string[] = []
    if (needDays) parts.push(needDays === 1 ? 'one more active day' : `${needDays} more active days`)
    if (needDone) parts.push(needDone === 1 ? 'one more finished task' : `${needDone} more finished tasks`)
    shortfall = parts.join(' and ')
  }

  return { enough, activeDays: stats.activeDays, completions, shortfall }
}

/** "148 hours" reads better than "147h 52m" on a headline tile. */
export function formatFocusTotal(ms: number): { value: string; unit: string } {
  const minutes = Math.round(ms / 60000)
  if (minutes < 60) return { value: String(minutes), unit: minutes === 1 ? 'minute' : 'minutes' }
  const hours = minutes / 60
  // One decimal below ten hours, so early progress doesn't sit on "0 hours".
  if (hours < 10) return { value: (Math.round(hours * 10) / 10).toString(), unit: 'hours' }
  return { value: String(Math.round(hours)), unit: 'hours' }
}
