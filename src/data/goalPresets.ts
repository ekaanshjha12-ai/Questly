import type { GoalCategory } from '../types'

export interface GoalPreset {
  id: string
  title: string
  category: GoalCategory
  /** Shown as the placeholder on the specifics step — hints at the kind of
   * detail that makes this goal concrete. */
  specHint: string
  /** Who it is offered to: everyone unless it says. */
  for?: 'adults' | 'teens'
  /** A better hint for someone under 18, where the general one assumes an adult life. */
  teenHint?: string
}

export const GOAL_PRESETS: GoalPreset[] = [
  // Fitness
  { id: 'p-run', title: 'Run a half marathon', category: 'fitness', specHint: 'e.g. by October, 3 runs a week' },
  { id: 'p-gym', title: 'Build a gym routine', category: 'fitness', specHint: 'e.g. 4 days a week, upper/lower split' },
  { id: 'p-shape', title: 'Get in better shape', category: 'fitness', specHint: 'e.g. lose 5 kg, feel stronger by summer', teenHint: 'e.g. run 5 km without stopping by summer' },
  { id: 'p-team', title: 'Make the team', category: 'fitness', specHint: 'e.g. football trials in the spring', for: 'teens' },

  // Learning
  { id: 'p-language', title: 'Learn a new language', category: 'learning', specHint: 'e.g. Spanish, conversational by June' },
  { id: 'p-read', title: 'Read more books', category: 'learning', specHint: 'e.g. 2 books a month, non-fiction' },
  { id: 'p-code', title: 'Learn to code', category: 'learning', specHint: 'e.g. Python, build a small app' },
  { id: 'p-exam', title: 'Ace my exams', category: 'learning', specHint: 'e.g. chemistry final in June, an hour a day' },
  { id: 'p-grades', title: 'Get better grades', category: 'learning', specHint: 'e.g. a B in maths by the end of term', for: 'teens' },

  // Career
  { id: 'p-promo', title: 'Get promoted', category: 'career', specHint: 'e.g. senior role by year end', for: 'adults' },
  { id: 'p-job', title: 'Get my first part-time job', category: 'career', specHint: 'e.g. weekend work by the summer holidays', for: 'teens' },
  { id: 'p-skill', title: 'Build a skill for my future', category: 'career', specHint: 'e.g. coding, design or public speaking', for: 'teens' },
  { id: 'p-business', title: 'Launch my business', category: 'career', specHint: 'e.g. first paying customer in 3 months', for: 'adults' },
  { id: 'p-network', title: 'Grow my network', category: 'career', specHint: 'e.g. 2 new contacts a week', for: 'adults' },

  // Creative
  { id: 'p-write', title: 'Write a book', category: 'creative', specHint: 'e.g. 500 words a day, finish draft by spring' },
  { id: 'p-music', title: 'Learn an instrument', category: 'creative', specHint: 'e.g. guitar, play a full song' },
  { id: 'p-art', title: 'Draw more often', category: 'creative', specHint: 'e.g. one sketch a day' },
  { id: 'p-portfolio', title: 'Build a portfolio', category: 'creative', specHint: 'e.g. ten finished pieces by December' },

  // Wellness
  { id: 'p-meditate', title: 'Meditate regularly', category: 'wellness', specHint: 'e.g. 10 minutes every morning' },
  { id: 'p-sleep', title: 'Sleep better', category: 'wellness', specHint: 'e.g. in bed by 11, 7+ hours', teenHint: 'e.g. phone away by 10, 8 to 10 hours' },
  { id: 'p-stress', title: 'Manage stress better', category: 'wellness', specHint: 'e.g. journal nightly, fewer late shifts', teenHint: 'e.g. journal nightly, a calmer exam season' },

  // Finance
  { id: 'p-save', title: 'Save money', category: 'finance', specHint: 'e.g. $5,000 by December', teenHint: 'e.g. $200 for a bike by the summer' },
  { id: 'p-debt', title: 'Pay off debt', category: 'finance', specHint: 'e.g. clear the credit card this year', for: 'adults' },
  { id: 'p-budget', title: 'Stick to a budget', category: 'finance', specHint: 'e.g. track every expense, cap eating out', teenHint: 'e.g. make pocket money last the month' },

  // Social
  { id: 'p-friends', title: 'Strengthen friendships', category: 'social', specHint: 'e.g. call one friend a week' },
  { id: 'p-family', title: 'More time with family', category: 'social', specHint: 'e.g. a proper dinner every Sunday' },
  { id: 'p-meet', title: 'Meet new people', category: 'social', specHint: 'e.g. one event a month', for: 'adults' },
  { id: 'p-club', title: 'Join a club or team', category: 'social', specHint: 'e.g. one new club this term', for: 'teens' },
]

export function presetsByCategory(category: GoalCategory): GoalPreset[] {
  return GOAL_PRESETS.filter((p) => p.category === category)
}

/**
 * The goal ideas offered to a player, by whether they are under 18: no
 * promotions, debt or networking for a fifteen-year-old, and grades, a first
 * job and making the team instead, with hints that fit their life.
 */
export function presetsForAge(teen: boolean): GoalPreset[] {
  return GOAL_PRESETS.filter((p) => !p.for || p.for === (teen ? 'teens' : 'adults')).map((p) => (teen && p.teenHint ? { ...p, specHint: p.teenHint } : p))
}
