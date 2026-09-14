import type { AppState } from '../types'
import type { ActivityDay } from './api'
import { dailyKey, startOfDay } from './period'

/**
 * Daily history, for the habit tracker's graphs.
 *
 * The one rule that makes this a habit tracker rather than a summary: every
 * calendar day in the window gets a row, including the days nothing happened.
 * A chart built only from the days with data draws a solid wall of activity and
 * hides exactly the thing you opened it to see. The gaps are the information.
 *
 * Habit ticks come from the notebook; quests, optional quests, proof and focus
 * come from the server's activity record, which the tracker fetches.
 */

export interface DayPoint {
  /** `YYYY-MM-DD`, local time — the same key the rest of the app uses. */
  date: string
  /** 0 = Sunday, matching Date.getDay(). */
  weekday: number
  quests: number
  verified: number
  todos: number
  sessions: number
  /** Hand-ticked habit boxes. */
  habits: number
  focusMs: number
  /** Quests + to-dos + sessions + habit ticks. What "did I show up" means. */
  total: number
}

function emptyDay(date: Date): DayPoint {
  return {
    date: dailyKey(date),
    weekday: date.getDay(),
    quests: 0,
    verified: 0,
    todos: 0,
    sessions: 0,
    habits: 0,
    focusMs: 0,
    total: 0,
  }
}

/** One row per day for the last `days` days, oldest first, today last. */
export function dailySeries(state: AppState, days: number, now: Date = new Date(), activity: ActivityDay[] = []): DayPoint[] {
  const start = startOfDay(now).getTime() - (days - 1) * 86400000
  const byDate = new Map<string, DayPoint>()
  const series: DayPoint[] = []

  for (let i = 0; i < days; i++) {
    const point = emptyDay(new Date(start + i * 86400000))
    series.push(point)
    byDate.set(point.date, point)
  }

  // Server activity arrives already bucketed by the player's own day; a day
  // outside the window lands on no bucket and is dropped.
  for (const record of activity) {
    const day = byDate.get(record.date)
    if (!day) continue
    day.quests += record.quests
    day.verified += record.verified
    day.todos += record.todos
    day.sessions += record.sessions
    day.focusMs += record.focusMs
    day.total += record.quests + record.todos + record.sessions
  }

  // Hand-ticked habits count the same as anything else the app tracks — they
  // are days the user showed up, and leaving them out would make the graphs
  // disagree with the grid printed directly above them.
  //
  // Marks are already stored as day keys, so they land on a bucket without a
  // Date round-trip. Ticks on a deleted habit cannot appear: DELETE_HABIT drops
  // that habit's marks with it.
  for (const marks of Object.values(state.habitMarks ?? {})) {
    for (const mark of marks) {
      const point = byDate.get(mark)
      if (point) {
        point.habits++
        point.total++
      }
    }
  }

  return series
}

export interface HabitSummary {
  /** Days in the window with at least one completion. */
  activeDays: number
  windowDays: number
  /** activeDays / windowDays as a whole percentage. */
  consistency: number
  totalCompletions: number
  totalFocusMs: number
  /** Best single day in the window. */
  bestDay: DayPoint | null
  /** The longest unbroken run of active days *inside this window*. Not the
   * all-time streak on state, which is a different number and says so. */
  bestRun: number
  /** How the window compares with the one before it, as a percentage change in
   * completions. Null when there is no earlier window to compare against. */
  trendPct: number | null
}

export function summarise(
  state: AppState,
  series: DayPoint[],
  now: Date = new Date(),
  activity: ActivityDay[] = [],
): HabitSummary {
  const activeDays = series.filter((d) => d.total > 0).length
  const totalCompletions = series.reduce((sum, d) => sum + d.total, 0)

  let bestRun = 0
  let run = 0
  for (const day of series) {
    run = day.total > 0 ? run + 1 : 0
    if (run > bestRun) bestRun = run
  }

  const bestDay = series.reduce<DayPoint | null>(
    (best, day) => (day.total > 0 && (!best || day.total > best.total) ? day : best),
    null,
  )

  // The window immediately before this one, same length, for the trend.
  const previous = dailySeries(state, series.length * 2, now, activity).slice(0, series.length)
  const previousTotal = previous.reduce((sum, d) => sum + d.total, 0)

  return {
    activeDays,
    windowDays: series.length,
    consistency: series.length ? Math.round((activeDays / series.length) * 100) : 0,
    totalCompletions,
    totalFocusMs: series.reduce((sum, d) => sum + d.focusMs, 0),
    bestDay,
    bestRun,
    trendPct: previousTotal
      ? Math.round(((totalCompletions - previousTotal) / previousTotal) * 100)
      : null,
  }
}

export interface WeekdayBucket {
  weekday: number
  label: string
  completions: number
  /** Days of this weekday in the window that saw any activity. */
  activeDays: number
  totalDays: number
}

const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

/**
 * Which days of the week you actually show up.
 *
 * Reported as a rate rather than a count, because a window rarely holds the
 * same number of each weekday — five Mondays against four Tuesdays would make
 * Monday look stronger than it is.
 */
export function weekdayProfile(series: DayPoint[]): WeekdayBucket[] {
  const buckets: WeekdayBucket[] = WEEKDAY_LABELS.map((label, weekday) => ({
    weekday,
    label,
    completions: 0,
    activeDays: 0,
    totalDays: 0,
  }))

  for (const day of series) {
    const bucket = buckets[day.weekday]
    bucket.totalDays++
    bucket.completions += day.total
    if (day.total > 0) bucket.activeDays++
  }

  return buckets
}

/**
 * The series cut into calendar weeks for the heatmap, Sunday at the top.
 *
 * The first and last weeks are padded with nulls so every column is seven cells
 * and the rows line up with their weekday labels. Without the padding the grid
 * shears by a day or two and the row labels become a lie.
 */
export function heatmapWeeks(series: DayPoint[]): (DayPoint | null)[][] {
  if (!series.length) return []

  const weeks: (DayPoint | null)[][] = []
  let week: (DayPoint | null)[] = Array(series[0].weekday).fill(null)

  for (const day of series) {
    week.push(day)
    if (week.length === 7) {
      weeks.push(week)
      week = []
    }
  }
  if (week.length) weeks.push([...week, ...Array(7 - week.length).fill(null)])

  return weeks
}

/**
 * Which shade a heatmap cell gets, 0–4.
 *
 * Bucketed against the busiest day in the window rather than a fixed scale, so
 * the grid reads for someone finishing two things a day and for someone
 * finishing twenty. Any activity at all is at least a 1 — a day you showed up
 * must never look like a day you did not.
 */
export function heatLevel(total: number, max: number): number {
  if (total <= 0) return 0
  if (max <= 1) return 4
  return Math.min(4, 1 + Math.floor((total / max) * 3.999))
}
