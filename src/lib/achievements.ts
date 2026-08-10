import type { AppState, Achievement } from '../types'
import { levelFromXp } from './leveling'

export const ACHIEVEMENTS: Achievement[] = [
  { id: 'first_quest', title: 'First Steps', description: 'Complete your first quest', icon: '🥾' },
  { id: 'quests_10', title: 'Quest Runner', description: 'Complete 10 quests', icon: '🗺️' },
  { id: 'quests_50', title: 'Quest Master', description: 'Complete 50 quests', icon: '🏆' },
  { id: 'quests_100', title: 'Legendary Adventurer', description: 'Complete 100 quests', icon: '👑' },
  { id: 'streak_3', title: 'Warming Up', description: 'Reach a 3-day streak', icon: '🔥' },
  { id: 'streak_7', title: 'On Fire', description: 'Reach a 7-day streak', icon: '🔥' },
  { id: 'streak_30', title: 'Unstoppable', description: 'Reach a 30-day streak', icon: '☄️' },
  { id: 'level_5', title: 'Rising Star', description: 'Reach level 5', icon: '⭐' },
  { id: 'level_10', title: 'Seasoned Hero', description: 'Reach level 10', icon: '🌟' },
  { id: 'level_20', title: 'Living Legend', description: 'Reach level 20', icon: '💫' },
  { id: 'first_goal', title: 'Quest Giver', description: 'Create your first goal', icon: '📜' },
  { id: 'three_goals', title: 'Multi-Class', description: 'Pursue 3 goals at once', icon: '🎯' },
  { id: 'monthly_complete', title: 'Boss Slayer', description: 'Complete a monthly quest', icon: '🐉' },
  { id: 'focus_first', title: 'In the Zone', description: 'Save your first focus session', icon: '⏱️' },
  { id: 'focus_10', title: 'Focused Mind', description: 'Save 10 focus sessions', icon: '🎯' },
  { id: 'focus_deep', title: 'Deep Work', description: 'Focus for 60 minutes in one session', icon: '🧠' },
  { id: 'verify_first', title: 'Show Your Work', description: 'Verify a quest with proof', icon: '📸' },
  { id: 'verify_10', title: 'Receipts', description: 'Verify 10 quests with proof', icon: '🔍' },
]

export function evaluateAchievements(state: AppState): string[] {
  const unlocked = new Set(Object.keys(state.unlockedAchievements))
  const newlyUnlocked: string[] = []
  const completedQuests = state.quests.filter((q) => q.completed)
  const { level } = levelFromXp(state.player.xp)
  const activeGoals = state.goals.filter((g) => !g.archived)

  const check = (id: string, condition: boolean) => {
    if (!unlocked.has(id) && condition) newlyUnlocked.push(id)
  }

  check('first_quest', completedQuests.length >= 1)
  check('quests_10', completedQuests.length >= 10)
  check('quests_50', completedQuests.length >= 50)
  check('quests_100', completedQuests.length >= 100)
  check('streak_3', state.streak.longest >= 3)
  check('streak_7', state.streak.longest >= 7)
  check('streak_30', state.streak.longest >= 30)
  check('level_5', level >= 5)
  check('level_10', level >= 10)
  check('level_20', level >= 20)
  check('first_goal', state.goals.length >= 1)
  check('three_goals', activeGoals.length >= 3)
  check('monthly_complete', completedQuests.some((q) => q.period === 'monthly'))
  check('focus_first', state.sessions.length >= 1)
  check('focus_10', state.sessions.length >= 10)
  check('focus_deep', state.sessions.some((s) => s.durationMs >= 60 * 60 * 1000))

  const verifiedCount = state.quests.filter((q) => q.verifiedBy).length
  check('verify_first', verifiedCount >= 1)
  check('verify_10', verifiedCount >= 10)

  return newlyUnlocked
}
