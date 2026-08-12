import type { LegacyScheduleEntry, PlannerView } from '../types'
import { dailyKey, weeklyKey, monthlyKey } from './period'

export interface DayBlock {
  id: string
  label: string
  hint: string
}

/** Time-of-day buckets rather than hourly rows — fewer, larger drop targets
 * that still read as a real day plan. */
export const DAY_BLOCKS: DayBlock[] = [
  { id: 'early', label: 'Early', hint: '6–9 AM' },
  { id: 'morning', label: 'Morning', hint: '9 AM–12 PM' },
  { id: 'midday', label: 'Midday', hint: '12–3 PM' },
  { id: 'afternoon', label: 'Afternoon', hint: '3–6 PM' },
  { id: 'evening', label: 'Evening', hint: '6–9 PM' },
  { id: 'night', label: 'Night', hint: '9 PM–12 AM' },
]

export const WEEKDAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

export function startOfDay(date: Date): Date {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  return d
}

/** Monday-based week start, matching the ISO week keys used elsewhere. */
export function startOfWeek(date: Date): Date {
  const d = startOfDay(date)
  const isoDay = d.getDay() || 7
  d.setDate(d.getDate() - (isoDay - 1))
  return d
}

export function shiftDays(date: Date, delta: number): Date {
  const d = new Date(date)
  d.setDate(d.getDate() + delta)
  return d
}

export function shiftMonths(date: Date, delta: number): Date {
  const d = new Date(date.getFullYear(), date.getMonth() + delta, 1)
  return d
}

export function shiftPeriod(view: PlannerView, date: Date, delta: number): Date {
  if (view === 'daily') return shiftDays(date, delta)
  if (view === 'weekly') return shiftDays(date, delta * 7)
  return shiftMonths(date, delta)
}

export function weekDays(date: Date): Date[] {
  const start = startOfWeek(date)
  return Array.from({ length: 7 }, (_, i) => shiftDays(start, i))
}

/** Month laid out as Monday-start rows; nulls pad the leading/trailing gaps. */
export function monthGrid(date: Date): (Date | null)[] {
  const year = date.getFullYear()
  const month = date.getMonth()
  const first = new Date(year, month, 1)
  const lead = (first.getDay() || 7) - 1
  const daysInMonth = new Date(year, month + 1, 0).getDate()

  const cells: (Date | null)[] = []
  for (let i = 0; i < lead; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d))
  while (cells.length % 7 !== 0) cells.push(null)
  return cells
}

export function periodKeyFor(view: PlannerView, date: Date): string {
  if (view === 'daily') return dailyKey(date)
  if (view === 'weekly') return weeklyKey(date)
  return monthlyKey(date)
}

export function periodLabel(view: PlannerView, date: Date): string {
  if (view === 'daily') {
    return date.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })
  }
  if (view === 'weekly') {
    const days = weekDays(date)
    const start = days[0]
    const end = days[6]
    const sameMonth = start.getMonth() === end.getMonth()
    const startText = start.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
    const endText = end.toLocaleDateString(undefined, sameMonth ? { day: 'numeric' } : { month: 'short', day: 'numeric' })
    return `${startText} – ${endText}`
  }
  return date.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
}

export function isSameDay(a: Date, b: Date): boolean {
  return dailyKey(a) === dailyKey(b)
}

/** The Monday starting a given ISO week. ISO week 1 is the one containing
 * Jan 4th, which is what `weeklyKey` encodes. */
export function isoWeekMonday(year: number, week: number): Date {
  const jan4 = new Date(year, 0, 4)
  const weekOneMonday = shiftDays(jan4, -((jan4.getDay() || 7) - 1))
  return shiftDays(weekOneMonday, (week - 1) * 7)
}

/**
 * Converts a pre-date schedule entry into the day it actually meant.
 *
 * Entries used to be filed under a view plus a slot within it, so the same
 * placement meant three different things depending on which tab you were on.
 * All three encodings still point at exactly one day, so they migrate cleanly.
 */
export function dateFromLegacyEntry(entry: LegacyScheduleEntry): { date: string; block?: string } | null {
  if (entry.view === 'daily') {
    // periodKey was already the day; slot was the time block.
    if (!/^\d{4}-\d{2}-\d{2}$/.test(entry.periodKey)) return null
    const known = DAY_BLOCKS.some((b) => b.id === entry.slot)
    return { date: entry.periodKey, ...(known ? { block: entry.slot } : {}) }
  }

  if (entry.view === 'weekly') {
    // periodKey `2026-W33`, slot a Monday-based weekday index.
    const match = /^(\d{4})-W(\d{1,2})$/.exec(entry.periodKey)
    const weekday = Number(entry.slot)
    if (!match || !Number.isInteger(weekday) || weekday < 0 || weekday > 6) return null
    return { date: dailyKey(shiftDays(isoWeekMonday(Number(match[1]), Number(match[2])), weekday)) }
  }

  // periodKey `2026-08`, slot the day of the month.
  const match = /^(\d{4})-(\d{2})$/.exec(entry.periodKey)
  const day = Number(entry.slot)
  if (!match || !Number.isInteger(day) || day < 1 || day > 31) return null
  const date = new Date(Number(match[1]), Number(match[2]) - 1, day)
  // A day past the end of that month rolls over, which would silently move the
  // task rather than drop it.
  if (date.getMonth() !== Number(match[2]) - 1) return null
  return { date: dailyKey(date) }
}
