/**
 * Everything the progress tracker shows that can be counted rather than judged.
 *
 * The server adds these up from its own records of quests and focus sessions
 * (GET /api/progress/stats), so the figures shown and the figures fed to the
 * outlook are the true ones. Only the success probability needs the model.
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
