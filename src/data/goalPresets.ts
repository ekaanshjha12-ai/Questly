import type { GoalCategory } from '../types'

export interface GoalPreset {
  id: string
  title: string
  category: GoalCategory
  /** Shown as the placeholder on the specifics step — hints at the kind of
   * detail that makes this goal concrete. */
  specHint: string
}

export const GOAL_PRESETS: GoalPreset[] = [
  // Fitness
  { id: 'p-run', title: 'Run a half marathon', category: 'fitness', specHint: 'e.g. by October, 3 runs a week' },
  { id: 'p-gym', title: 'Build a gym routine', category: 'fitness', specHint: 'e.g. 4 days a week, upper/lower split' },
  { id: 'p-shape', title: 'Get in better shape', category: 'fitness', specHint: 'e.g. lose 5 kg, feel stronger by summer' },

  // Learning
  { id: 'p-language', title: 'Learn a new language', category: 'learning', specHint: 'e.g. Spanish, conversational by June' },
  { id: 'p-read', title: 'Read more books', category: 'learning', specHint: 'e.g. 2 books a month, non-fiction' },
  { id: 'p-code', title: 'Learn to code', category: 'learning', specHint: 'e.g. Python, build a small app' },

  // Career
  { id: 'p-promo', title: 'Get promoted', category: 'career', specHint: 'e.g. senior role by year end' },
  { id: 'p-business', title: 'Launch my business', category: 'career', specHint: 'e.g. first paying customer in 3 months' },
  { id: 'p-network', title: 'Grow my network', category: 'career', specHint: 'e.g. 2 new contacts a week' },

  // Creative
  { id: 'p-write', title: 'Write a book', category: 'creative', specHint: 'e.g. 500 words a day, finish draft by spring' },
  { id: 'p-music', title: 'Learn an instrument', category: 'creative', specHint: 'e.g. guitar, play a full song' },
  { id: 'p-art', title: 'Draw more often', category: 'creative', specHint: 'e.g. one sketch a day' },

  // Wellness
  { id: 'p-meditate', title: 'Meditate regularly', category: 'wellness', specHint: 'e.g. 10 minutes every morning' },
  { id: 'p-sleep', title: 'Sleep better', category: 'wellness', specHint: 'e.g. in bed by 11, 7+ hours' },
  { id: 'p-stress', title: 'Manage stress better', category: 'wellness', specHint: 'e.g. journal nightly, fewer late shifts' },

  // Finance
  { id: 'p-save', title: 'Save money', category: 'finance', specHint: 'e.g. $5,000 by December' },
  { id: 'p-debt', title: 'Pay off debt', category: 'finance', specHint: 'e.g. clear the credit card this year' },
  { id: 'p-budget', title: 'Stick to a budget', category: 'finance', specHint: 'e.g. track every expense, cap eating out' },

  // Social
  { id: 'p-friends', title: 'Strengthen friendships', category: 'social', specHint: 'e.g. call one friend a week' },
  { id: 'p-family', title: 'More time with family', category: 'social', specHint: 'e.g. a proper dinner every Sunday' },
  { id: 'p-meet', title: 'Meet new people', category: 'social', specHint: 'e.g. one event a month' },
]

export function presetsByCategory(category: GoalCategory): GoalPreset[] {
  return GOAL_PRESETS.filter((p) => p.category === category)
}
