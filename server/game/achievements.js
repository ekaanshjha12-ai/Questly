/**
 * Achievements, judged by the server from its own records.
 *
 * Each one is a test over counts the server keeps — quests completed, focus
 * time, streak, level, duels, clubs, posts — never over anything the client
 * reports. The ids of the original eighteen are unchanged, so everything
 * players had already unlocked carries over.
 *
 * `xp` is paid once, through the ledger, when the achievement unlocks. Level
 * achievements pay nothing: reaching a level already pays coins, and XP for
 * reaching a level would only feed itself.
 */

export const ACHIEVEMENTS = [
  { id: 'first_quest', title: 'First Steps', description: 'Complete your first quest.', icon: 'boot', xp: 25, test: (s) => s.questsCompleted >= 1 },
  { id: 'quests_10', title: 'Quest Runner', description: 'Complete 10 quests.', icon: 'map', xp: 50, test: (s) => s.questsCompleted >= 10 },
  { id: 'quests_50', title: 'Quest Master', description: 'Complete 50 quests.', icon: 'trophy', xp: 150, test: (s) => s.questsCompleted >= 50 },
  { id: 'quests_100', title: 'Legendary Adventurer', description: 'Complete 100 quests.', icon: 'crown', xp: 300, test: (s) => s.questsCompleted >= 100 },
  { id: 'monthly_complete', title: 'Boss Slayer', description: 'Complete a monthly quest.', icon: 'dragon', xp: 50, test: (s) => s.monthlyCompleted >= 1 },
  { id: 'legendary_quest', title: 'Legend in the Making', description: 'Complete a legendary quest.', icon: 'elixir', xp: 100, test: (s) => s.legendaryCompleted >= 1 },
  { id: 'streak_3', title: 'Warming Up', description: 'Reach a 3-day streak.', icon: 'flame', xp: 25, test: (s) => s.streakLongest >= 3 },
  { id: 'streak_7', title: 'On Fire', description: 'Reach a 7-day streak.', icon: 'flame', xp: 75, test: (s) => s.streakLongest >= 7 },
  { id: 'streak_14', title: 'Unbroken', description: 'Reach a 14-day streak.', icon: 'owl', xp: 120, test: (s) => s.streakLongest >= 14 },
  { id: 'streak_30', title: 'Unstoppable', description: 'Reach a 30-day streak.', icon: 'comet', xp: 250, test: (s) => s.streakLongest >= 30 },
  { id: 'level_5', title: 'Rising Star', description: 'Reach level 5.', icon: 'star', xp: 0, test: (s) => s.level >= 5 },
  { id: 'level_10', title: 'Seasoned Hero', description: 'Reach level 10.', icon: 'star', xp: 0, test: (s) => s.level >= 10 },
  { id: 'level_20', title: 'Living Legend', description: 'Reach level 20.', icon: 'star', xp: 0, test: (s) => s.level >= 20 },
  { id: 'first_goal', title: 'Quest Giver', description: 'Set your first goal.', icon: 'scroll', xp: 10, test: (s) => s.goals >= 1 },
  { id: 'three_goals', title: 'Multi-Class', description: 'Pursue 3 goals at once.', icon: 'target', xp: 25, test: (s) => s.activeGoals >= 3 },
  { id: 'focus_first', title: 'In the Zone', description: 'Finish your first focus session.', icon: 'hourglass', xp: 15, test: (s) => s.focusSessions >= 1 },
  { id: 'focus_10', title: 'Focused Mind', description: 'Finish 10 focus sessions.', icon: 'target', xp: 60, test: (s) => s.focusSessions >= 10 },
  { id: 'focus_deep', title: 'Deep Work', description: 'Focus for 60 minutes in one session.', icon: 'brain', xp: 60, test: (s) => s.deepFocus >= 1 },
  { id: 'focus_hours_10', title: 'Lamplighter', description: 'Focus for 10 hours in total.', icon: 'lantern', xp: 120, test: (s) => s.focusMs >= 10 * 3_600_000 },
  { id: 'verify_first', title: 'Show Your Work', description: 'Verify a quest with proof.', icon: 'camera', xp: 20, test: (s) => s.questsVerified >= 1 },
  { id: 'verify_10', title: 'Receipts', description: 'Verify 10 quests with proof.', icon: 'magnifier', xp: 100, test: (s) => s.questsVerified >= 10 },
  { id: 'week_warrior', title: 'Week Warrior', description: 'Make progress on 7 different days.', icon: 'shield', xp: 50, test: (s) => s.activeDays >= 7 },
  { id: 'duel_first', title: 'Duelist', description: 'Meet the objective in a duel.', icon: 'swords', xp: 50, test: (s) => s.duelsMet >= 1 },
  { id: 'duel_5', title: 'Arena Veteran', description: 'Meet the objective in 5 duels.', icon: 'swords', xp: 150, test: (s) => s.duelsMet >= 5 },
  { id: 'club_join', title: 'Guild Member', description: 'Join a club.', icon: 'banner', xp: 30, test: (s) => s.clubsJoined >= 1 },
  { id: 'club_trials', title: 'Trial by Fire', description: 'Pass a club’s entry trials.', icon: 'gate', xp: 60, test: (s) => s.trialsPassed >= 1 },
  { id: 'post_first', title: 'Herald', description: 'Share progress in the Adventure Log.', icon: 'horn', xp: 15, test: (s) => s.posts >= 1 },
  { id: 'card_designer', title: 'Identity Forged', description: 'Customise your Questly Card.', icon: 'card', xp: 15, test: (s) => s.cardDesigned },
]

export const ACHIEVEMENT_IDS = new Set(ACHIEVEMENTS.map((a) => a.id))

export function findAchievement(id) {
  return ACHIEVEMENTS.find((a) => a.id === id) ?? null
}

/** Ids that the stats now satisfy and are not in `unlocked`. */
export function newlyEarned(stats, unlocked) {
  return ACHIEVEMENTS.filter((a) => !unlocked.has(a.id) && a.test(stats)).map((a) => a.id)
}

/** What a client may see of a definition — never the test. */
export function achievementView(a, unlockedAt = null) {
  return { id: a.id, title: a.title, description: a.description, icon: a.icon, xp: a.xp, unlockedAt }
}
