import type { GoalCategory } from '../types'

export interface CategoryMeta {
  id: GoalCategory
  label: string
  icon: string
  gradient: string
  keywords: string[]
}

export const CATEGORIES: CategoryMeta[] = [
  {
    id: 'fitness',
    label: 'Fitness & Strength',
    icon: '⚔️',
    gradient: 'from-ember-500 to-gold-500',
    keywords: ['run', 'gym', 'workout', 'weight', 'muscle', 'fit', 'exercise', 'strength', 'marathon', 'yoga', 'sport'],
  },
  {
    id: 'learning',
    label: 'Learning & Skills',
    icon: '📚',
    gradient: 'from-mystic-500 to-blue-400',
    keywords: ['learn', 'study', 'language', 'course', 'read', 'exam', 'skill', 'school', 'degree', 'code', 'programming'],
  },
  {
    id: 'career',
    label: 'Career & Business',
    icon: '💼',
    gradient: 'from-gold-500 to-ember-500',
    keywords: ['business', 'startup', 'career', 'job', 'sales', 'client', 'work', 'promotion', 'income', 'freelance', 'company'],
  },
  {
    id: 'creative',
    label: 'Creative & Craft',
    icon: '🎨',
    gradient: 'from-mystic-400 to-ember-400',
    keywords: ['write', 'novel', 'art', 'draw', 'paint', 'music', 'design', 'creative', 'photo', 'film', 'craft'],
  },
  {
    id: 'wellness',
    label: 'Wellness & Mind',
    icon: '🧘',
    gradient: 'from-mystic-500 to-mystic-400',
    keywords: ['meditat', 'sleep', 'health', 'mind', 'mental', 'anxiety', 'calm', 'therapy', 'journal', 'wellness', 'stress'],
  },
  {
    id: 'finance',
    label: 'Wealth & Finance',
    icon: '💰',
    gradient: 'from-gold-400 to-gold-600',
    keywords: ['save', 'money', 'budget', 'debt', 'invest', 'finance', 'wealth', 'financial', 'spend'],
  },
  {
    id: 'social',
    label: 'Relationships & Social',
    icon: '🤝',
    gradient: 'from-ember-400 to-mystic-400',
    keywords: ['friend', 'family', 'relationship', 'social', 'network', 'connect', 'partner', 'community'],
  },
  {
    id: 'general',
    label: 'General Quest',
    icon: '⭐',
    gradient: 'from-slate-400 to-slate-500',
    keywords: [],
  },
]

export function detectCategory(goalTitle: string): GoalCategory {
  const text = goalTitle.toLowerCase()
  for (const cat of CATEGORIES) {
    if (cat.id === 'general') continue
    if (cat.keywords.some((kw) => text.includes(kw))) return cat.id
  }
  return 'general'
}

export function getCategoryMeta(id: GoalCategory): CategoryMeta {
  return CATEGORIES.find((c) => c.id === id) ?? CATEGORIES[CATEGORIES.length - 1]
}
