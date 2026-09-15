import { BookOpen, Cpu, Crown, Dumbbell, Hammer, Library, Lightbulb, Palette, Sparkles, type LucideIcon } from 'lucide-react'
import type { RegionId } from '../art/world'

/**
 * What each region of the world is for, and where entering it takes you.
 * Every destination is a real part of Questly; the region's weekly quests
 * and its lock come from the server.
 */

export interface RegionMeta {
  tagline: string
  description: string
  destination: { to: string; label: string }
  extra?: { to: string; label: string }
  accent: string
  icon: LucideIcon
}

export const REGION_META: Record<RegionId, RegionMeta> = {
  focus_sanctum: {
    tagline: 'Where deep work is done',
    description: 'The heart of the world. Every minute of focus timed here counts toward quests, duels and events.',
    destination: { to: '/focus', label: 'Enter Focus Mode' },
    extra: { to: '/sounds', label: 'Ambient sounds' },
    accent: '#3fe0a0',
    icon: Sparkles,
  },
  scholars_sanctuary: {
    tagline: 'Study, recall and understanding',
    description: 'Flashcards, explaining it back, and the patience to learn something properly.',
    destination: { to: '/study', label: 'Open Study' },
    accent: '#7fa4d8',
    icon: BookOpen,
  },
  builders_district: {
    tagline: 'Plans, projects and progress',
    description: 'Where weeks are planned and big things are built one day at a time.',
    destination: { to: '/planner', label: 'Open the Planner' },
    extra: { to: '/goals', label: 'Your goals' },
    accent: '#e0a060',
    icon: Hammer,
  },
  creators_quarter: {
    tagline: 'Make things and share them',
    description: 'Painted houses, bunting in the street, and the Adventure Log where work is shown.',
    destination: { to: '/social', label: 'Open the Adventure Log' },
    extra: { to: '/profile/card', label: 'Design your card' },
    accent: '#e86ad0',
    icon: Palette,
  },
  training_grounds: {
    tagline: 'Discipline, habits and duels',
    description: 'The arena where habits are drilled and rivals are met.',
    destination: { to: '/habits', label: 'Open Habits' },
    extra: { to: '/challenges', label: 'Duels' },
    accent: '#e8685a',
    icon: Dumbbell,
  },
  archive: {
    tagline: 'Your record, kept',
    description: 'Every deed and every reward, written down and kept.',
    destination: { to: '/profile/achievements', label: 'Hall of Achievements' },
    extra: { to: '/profile/history', label: 'XP history' },
    accent: '#c9b28a',
    icon: Library,
  },
  digital_workshop: {
    tagline: 'Tools that work for you',
    description: 'Screens glow late into the night. Turn a goal into a plan in minutes.',
    destination: { to: '/ai-plan', label: 'Open the AI Planner' },
    accent: '#6ee8f5',
    icon: Cpu,
  },
  innovation_district: {
    tagline: 'New ideas take shape',
    description: 'Glass towers for those who have found their footing and want something new.',
    destination: { to: '/goals', label: 'Chart a new goal' },
    accent: '#8cc0dc',
    icon: Lightbulb,
  },
  elite_region: {
    tagline: 'Where legends are named',
    description: 'The citadel above the clouds. Only the most dedicated climb the pass.',
    destination: { to: '/leaderboard', label: 'Hall of Legends' },
    accent: '#e8b84a',
    icon: Crown,
  },
}

export const REGION_ORDER: RegionId[] = [
  'focus_sanctum',
  'scholars_sanctuary',
  'builders_district',
  'creators_quarter',
  'training_grounds',
  'archive',
  'digital_workshop',
  'innovation_district',
  'elite_region',
]
