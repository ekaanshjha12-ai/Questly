import { BookOpen, Compass, Flame, Hammer, Palette, type LucideIcon } from 'lucide-react'
import type { GoalCategory } from '../types'

/**
 * The five paths a new player can start on. A path decides which goals are
 * suggested first and how the hero is introduced; it grants nothing and
 * limits nothing — every quest and item is open to every path.
 */

export type PathId = 'scholar' | 'builder' | 'creator' | 'discipline' | 'explorer'

export interface PathMeta {
  id: PathId
  name: string
  tagline: string
  /** Goal categories suggested first. Empty means all of them. */
  categories: GoalCategory[]
  icon: LucideIcon
  accent: string
}

export const PATHS: PathMeta[] = [
  { id: 'scholar', name: 'Scholar', tagline: 'Study, exams and new skills', categories: ['learning'], icon: BookOpen, accent: '#60a5fa' },
  { id: 'builder', name: 'Builder', tagline: 'Projects, career and money', categories: ['career', 'finance'], icon: Hammer, accent: '#f59e0b' },
  { id: 'creator', name: 'Creator', tagline: 'Art, music and writing', categories: ['creative'], icon: Palette, accent: '#c084fc' },
  { id: 'discipline', name: 'Discipline', tagline: 'Fitness, health and habits', categories: ['fitness', 'wellness'], icon: Flame, accent: '#34d399' },
  { id: 'explorer', name: 'Explorer', tagline: 'A little of everything', categories: [], icon: Compass, accent: '#fbbf24' },
]

export function findPath(id: unknown): PathMeta | null {
  return PATHS.find((p) => p.id === id) ?? null
}
