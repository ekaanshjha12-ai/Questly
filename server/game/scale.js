/**
 * One scale for every quest, wherever it comes from — a goal's daily slate, a
 * region's board, a plan or a player's own pen. A quest's level is how long it
 * takes; its reward follows from that and its type, and its rarity from the
 * reward. Nothing else sets them, so two quests of the same size and type
 * always show the same level and pay the same.
 *
 *   Easy    up to 20 minutes
 *   Normal  up to an hour
 *   Hard    up to two and a half hours
 *   Heroic  longer than that
 *
 * Pure functions, kept apart from the database so they can be checked on
 * their own. src/lib/questFormat.ts mirrors them for the reward preview.
 */

export const DIFFICULTIES = ['easy', 'normal', 'hard', 'heroic']

const RATE = { main: 2, side: 1.5, daily: 1.5, optional: 1, club: 1.5, challenge: 1.5 }
const DIFFICULTY = { easy: 0.75, normal: 1, hard: 1.25, heroic: 1.5 }

export function difficultyFor(durationMin) {
  const minutes = Math.round(Number(durationMin) || 0)
  if (minutes <= 20) return 'easy'
  if (minutes <= 60) return 'normal'
  if (minutes <= 150) return 'hard'
  return 'heroic'
}

export function questXp({ type, durationMin }) {
  const minutes = Math.min(480, Math.max(5, Math.round(durationMin)))
  const raw = minutes * (RATE[type] ?? 1) * DIFFICULTY[difficultyFor(minutes)]
  return Math.min(900, Math.max(10, Math.round(raw / 5) * 5))
}

export function rarityFor(xp) {
  if (xp >= 300) return 'legendary'
  if (xp >= 150) return 'epic'
  if (xp >= 60) return 'rare'
  return 'common'
}

/** Level, reward and rarity for a quest of this type and length. */
export function questScale({ type, durationMin }) {
  const xp = questXp({ type, durationMin })
  return { difficulty: difficultyFor(durationMin), xp, rarity: rarityFor(xp) }
}

/** How long a day's, a week's and a month's quest usually takes, and the range it is kept in. */
export const CADENCE_MINUTES = {
  daily: { usual: 20, min: 5, max: 45 },
  weekly: { usual: 60, min: 15, max: 150 },
  monthly: { usual: 90, min: 30, max: 240 },
}

const WORD_HOURS = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4 }

/**
 * How long a written quest takes, read from its own words — "25 focused
 * minutes", "a 15-minute walk", "2 hours" — or the usual length for its
 * cadence when it does not say. Quoted text is the goal's own title, not the
 * task, and hours of sleep are rest rather than effort, so neither counts.
 */
export function estimateMinutes(text, cadence) {
  const band = CADENCE_MINUTES[cadence] ?? CADENCE_MINUTES.daily
  const words = String(text ?? '')
    .toLowerCase()
    .replace(/"[^"]*"|“[^”]*”/g, ' ')
    .replace(/\bhalf an hour\b/g, '30 minutes')
  let found = 0
  if (!/\bsleep\b/.test(words)) {
    for (const m of words.matchAll(/(\d+(?:\.\d+)?)\s*\+?\s*-?\s*(?:(?:focused|full|quiet|deep|uninterrupted)\s+)?(?:minutes?|mins?)\b/g)) {
      found = Math.max(found, Number(m[1]))
    }
    for (const m of words.matchAll(/(\d+(?:\.\d+)?|\ban?\b|\bone\b|\btwo\b|\bthree\b|\bfour\b)\s*\+?\s*-?\s*(?:hours?|hrs?)\b/g)) {
      found = Math.max(found, (Number(m[1]) || WORD_HOURS[m[1]] || 0) * 60)
    }
  }
  return Math.min(band.max, Math.max(band.min, Math.round(found || band.usual)))
}
