/**
 * Levels and ranks, derived by the server from XP alone.
 *
 * XP is the only input and the ledger is the only thing that moves it, so a
 * level can never be claimed — only reached. The curve is the one the app has
 * always used, so nobody's standing changes when this became authoritative.
 */

export const MAX_LEVEL = 500

/** XP needed to go from `level` to `level + 1`. Early levels come quickly. */
export function xpForLevel(level) {
  return Math.round(50 * Math.pow(level, 1.55))
}

/** Where a total of XP puts someone: their level and how far into it they are. */
export function levelInfo(totalXp) {
  let level = 1
  let remaining = Math.max(0, Math.floor(Number(totalXp) || 0))
  // Bounded so a garbage total cannot spin here.
  while (level < MAX_LEVEL && remaining >= xpForLevel(level)) {
    remaining -= xpForLevel(level)
    level += 1
  }
  return { level, xpIntoLevel: remaining, xpForNext: xpForLevel(level) }
}

export function levelFromXp(totalXp) {
  return levelInfo(totalXp).level
}

/** Total XP from zero to the start of `level`. */
export function xpToReachLevel(level) {
  let total = 0
  for (let n = 1; n < Math.min(level, MAX_LEVEL); n += 1) total += xpForLevel(n)
  return total
}

/**
 * The rank ladder. Ids are stable — items and saved data refer to them — and
 * the names are what players see.
 */
export const RANKS = [
  { id: 'recruit', name: 'Initiate', minLevel: 1 },
  { id: 'soldier', name: 'Apprentice', minLevel: 3 },
  { id: 'knight', name: 'Journeyman', minLevel: 6 },
  { id: 'champion', name: 'Adept', minLevel: 10 },
  { id: 'monarch', name: 'Expert', minLevel: 14 },
  { id: 'king', name: 'Master', minLevel: 18 },
  { id: 'celestial', name: 'Grandmaster', minLevel: 24 },
  { id: 'god', name: 'Legend', minLevel: 30 },
  { id: 'heisenberg', name: 'Mythic', minLevel: 40 },
]

export function rankForLevel(level) {
  let current = RANKS[0]
  for (const rank of RANKS) if (level >= rank.minLevel) current = rank
  return current
}

export function rankName(level) {
  return rankForLevel(level).name
}

export function nextRank(level) {
  return RANKS.find((rank) => rank.minLevel > level) ?? null
}

/** Coins paid once for reaching each level. */
export function levelCoins(level) {
  return 20 + level * 5
}
