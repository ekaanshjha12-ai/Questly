import {
  BookOpen,
  Briefcase,
  Coins,
  Compass,
  Dumbbell,
  Leaf,
  Palette,
  Swords,
  UsersRound,
  type LucideIcon,
} from 'lucide-react'
import type { GoalCategory } from '../types'
import type { Difficulty, GameQuest, QuestInput, Rarity } from './api'

export const CATEGORY_ICON: Record<GoalCategory, LucideIcon> = {
  fitness: Dumbbell,
  learning: BookOpen,
  career: Briefcase,
  creative: Palette,
  wellness: Leaf,
  finance: Coins,
  social: UsersRound,
  general: Compass,
}

export const CATEGORY_LABEL: Record<GoalCategory, string> = {
  fitness: 'Fitness',
  learning: 'Learning',
  career: 'Career',
  creative: 'Creative',
  wellness: 'Wellness',
  finance: 'Finance',
  social: 'Social',
  general: 'General',
}

export function questIcon(quest: Pick<GameQuest, 'category' | 'type'>): LucideIcon {
  if (quest.type === 'challenge') return Swords
  return CATEGORY_ICON[quest.category] ?? Compass
}

export const DIFFICULTY_LABEL: Record<Difficulty, string> = { easy: 'Easy', normal: 'Normal', hard: 'Hard', heroic: 'Heroic' }

const RATE = { main: 2, side: 1.5, daily: 1.5, optional: 1, club: 1.5, challenge: 1.5 } as const
const DIFFICULTY = { easy: 0.75, normal: 1, hard: 1.25, heroic: 1.5 } as const

/**
 * A quest's level from how long it takes: up to 20 minutes Easy, up to an hour
 * Normal, up to two and a half hours Hard, longer Heroic. The server uses the
 * same scale for every quest, wherever it came from.
 */
export function difficultyFor(minutes: number): Difficulty {
  const m = Math.round(minutes || 0)
  if (m <= 20) return 'easy'
  if (m <= 60) return 'normal'
  if (m <= 150) return 'hard'
  return 'heroic'
}

/**
 * What the server will pay for a quest of this shape — shown while writing
 * one. It mirrors the server's formula for the preview only; the server works
 * the reward out again when the quest is saved.
 */
export function previewXp(input: Pick<QuestInput, 'type' | 'durationMin'>): { xp: number; rarity: Rarity; difficulty: Difficulty } {
  const minutes = Math.min(480, Math.max(5, Math.round(input.durationMin || 0)))
  const difficulty = difficultyFor(minutes)
  const raw = minutes * RATE[input.type] * DIFFICULTY[difficulty]
  const xp = Math.min(900, Math.max(10, Math.round(raw / 5) * 5))
  const rarity: Rarity = xp >= 300 ? 'legendary' : xp >= 150 ? 'epic' : xp >= 60 ? 'rare' : 'common'
  return { xp, rarity, difficulty }
}

export function formatMinutes(minutes: number): string {
  if (minutes < 60) return `${minutes} min`
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return m ? `${h}h ${m}m` : `${h}h`
}

/** "Due 2:00 PM", "Due tomorrow", "Due Sep 20", or null. */
export function dueLabel(iso: string | null, now = new Date()): string | null {
  if (!iso) return null
  const due = new Date(iso)
  if (Number.isNaN(due.getTime())) return null
  const sameDay = due.toDateString() === now.toDateString()
  // A deadline of midnight reads as "today" for the day that ends then.
  const endOfToday = new Date(now)
  endOfToday.setHours(24, 0, 0, 0)
  if (sameDay || due.getTime() === endOfToday.getTime()) {
    return due.getTime() === endOfToday.getTime() ? 'Due today' : `Due ${due.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`
  }
  const tomorrow = new Date(now)
  tomorrow.setDate(tomorrow.getDate() + 1)
  const endOfTomorrow = new Date(endOfToday)
  endOfTomorrow.setDate(endOfTomorrow.getDate() + 1)
  if (due.toDateString() === tomorrow.toDateString() || due.getTime() === endOfTomorrow.getTime()) return 'Due tomorrow'
  return `Due ${due.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`
}

/** "45% complete", "4 / 7 milestones", "52 / 100 km", "20 / 60 min". */
export function progressLabel(quest: GameQuest): string {
  const p = quest.progress
  if (quest.status === 'completed') return 'Complete'
  switch (p.kind) {
    case 'minutes':
      return `${p.value} / ${p.target} min`
    case 'count':
      return `${p.value.toLocaleString()} / ${p.target.toLocaleString()} ${p.unit ?? ''}`.trim()
    case 'milestones':
      return `${p.value} / ${p.target} milestones`
    default:
      return quest.status === 'in_progress' ? 'In progress' : 'Not started'
  }
}

/** Whether Focus Mode is the natural way to work on this quest. */
export function isFocusQuest(quest: GameQuest): boolean {
  return (quest.status === 'active' || quest.status === 'in_progress') && (quest.progress.kind === 'minutes' || quest.progress.kind === 'check')
}

export function greeting(date = new Date()): string {
  const h = date.getHours()
  if (h < 5) return 'Burning the midnight oil'
  if (h < 12) return 'Good morning'
  if (h < 17) return 'Good afternoon'
  return 'Good evening'
}

export function formatDurationMs(ms: number): string {
  const minutes = Math.round(ms / 60_000)
  if (minutes < 60) return `${minutes}m`
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return m ? `${h}h ${m}m` : `${h}h`
}
