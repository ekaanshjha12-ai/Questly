import type { AppState } from '../types'
import { findModel, rankForLevel } from '../data/ranks'
import { characterById } from '../data/gear'

export interface Appearance {
  modelUrl: string
  accent: string
  level: number
  rankName: string
}

/** Resolves everything the avatar needs to render: the worn model (falling back
 * to the starter character) and the current rank's accent colour. */
export function appearanceFor(state: AppState): Appearance {
  // The claimed level, not what XP alone would give. Using the XP level here
  // showed players a rank they had not actually unlocked yet.
  const level = state.progression.level
  const rank = rankForLevel(level)
  const owned = findModel(state.collection.active)

  return {
    modelUrl: owned?.modelUrl ?? characterById(state.player.character).modelUrl,
    accent: rank.color,
    level,
    rankName: rank.name,
  }
}
