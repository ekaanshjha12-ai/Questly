import type { Progression } from '../types'

/** What the UI needs to describe a player's standing, including whether their
 * next level is blocked awaiting photo proof. */
export interface LevelInfo {
  level: number
  xpIntoLevel: number
  xpForNext: number
  awaitingProof: boolean
  proofsNeeded: number
  proofsBanked: number
  proofsRequired: number
}

/** Photo proofs required to actually claim each new level. XP gets you to the
 * door; proof opens it. */
export const PROOFS_PER_LEVEL = 2

// XP required to go from level N to N+1 grows so early levels feel fast.
export function xpForLevel(level: number): number {
  return Math.round(50 * Math.pow(level, 1.55))
}

export function levelFromXp(totalXp: number): { level: number; xpIntoLevel: number; xpForNext: number } {
  let level = 1
  let remaining = totalXp
  while (remaining >= xpForLevel(level)) {
    remaining -= xpForLevel(level)
    level += 1
  }
  return { level, xpIntoLevel: remaining, xpForNext: xpForLevel(level) }
}

/**
 * Spends banked proofs to claim levels the player's XP has already earned.
 *
 * Cascades, so someone sitting on three levels' worth of XP who then submits
 * six photos claims all three at once. When `required` is 0 the gate is off and
 * levels follow XP directly.
 */
export function advanceProgression(
  progression: Progression,
  xpLevel: number,
  required: number = PROOFS_PER_LEVEL,
): Progression {
  if (required <= 0) {
    return progression.level >= xpLevel ? progression : { ...progression, level: xpLevel }
  }

  let { level, proofs } = progression
  while (xpLevel > level && proofs >= required) {
    level += 1
    proofs -= required
  }
  return level === progression.level ? progression : { level, proofs }
}

/** What the player still owes before the next level opens. */
export function proofsOutstanding(
  progression: Progression,
  xpLevel: number,
  required: number = PROOFS_PER_LEVEL,
): number {
  if (required <= 0 || xpLevel <= progression.level) return 0
  return Math.max(0, required - progression.proofs)
}

/** Total XP needed to reach a given level from zero — used by the roadmap to
 * show how far away each rank is. */
export function xpToReachLevel(level: number): number {
  let total = 0
  for (let n = 1; n < level; n += 1) total += xpForLevel(n)
  return total
}
