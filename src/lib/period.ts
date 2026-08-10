import type { QuestPeriod } from '../types'

function pad(n: number): string {
  return n.toString().padStart(2, '0')
}

export function dailyKey(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

export function weeklyKey(date: Date): string {
  // ISO 8601 week number
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
  const dayNum = d.getUTCDay() || 7
  d.setUTCDate(d.getUTCDate() + 4 - dayNum)
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  const weekNo = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7)
  return `${d.getUTCFullYear()}-W${pad(weekNo)}`
}

export function monthlyKey(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}`
}

export function periodKey(period: QuestPeriod, date: Date = new Date()): string {
  if (period === 'daily') return dailyKey(date)
  if (period === 'weekly') return weeklyKey(date)
  return monthlyKey(date)
}

/** A counter that increases by one each period. Used to rotate which goals get
 * picked, so when there are more goals than quest slots every goal comes up in
 * turn instead of the same one winning every day. */
export function periodOrdinal(period: QuestPeriod, date: Date = new Date()): number {
  if (period === 'daily') {
    return Math.floor(startOfDay(date).getTime() / 86400000)
  }
  if (period === 'weekly') {
    const [year, week] = weeklyKey(date).split('-W')
    return Number(year) * 53 + Number(week)
  }
  return date.getFullYear() * 12 + date.getMonth()
}

export function startOfDay(date: Date = new Date()): Date {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  return d
}

export function isYesterday(dayKey: string, today: Date = new Date()): boolean {
  const y = new Date(today)
  y.setDate(y.getDate() - 1)
  return dailyKey(y) === dayKey
}

export const PERIOD_LABEL: Record<QuestPeriod, string> = {
  daily: 'Daily',
  weekly: 'Weekly',
  monthly: 'Monthly',
}

export const PERIOD_XP: Record<QuestPeriod, number> = {
  daily: 15,
  weekly: 60,
  monthly: 200,
}
