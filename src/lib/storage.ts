import type { AppState } from '../types'
import { levelFromXp } from './leveling'

/** The server is the source of truth; this is only an offline read cache.
 * It is keyed per user so two accounts sharing a browser can never see each
 * other's progress. */
const PREFIX = 'questly:v1'

function cacheKey(userId: string): string {
  return `${PREFIX}:${userId}`
}

export function defaultState(): AppState {
  return {
    onboarded: false,
    player: {
      name: 'Adventurer',
      character: 'female',
      xp: 0,
      coins: 0,
      createdAt: new Date().toISOString(),
    },
    goals: [],
    quests: [],
    todos: [],
    schedule: [],
    sessions: [],
    streak: {
      current: 0,
      longest: 0,
      lastCompletedDay: null,
    },
    unlockedAchievements: {},
    collection: {
      unlocked: [],
      active: null,
    },
    progression: {
      level: 1,
      proofs: 0,
    },
  }
}

/** Fields written by older versions that no longer exist. Dropped on load so
 * they stop being round-tripped back to the server on every save. */
const RETIRED_FIELDS = ['equipment', 'activePowers'] as const

/** Merges onto defaultState so states saved by older versions of the app
 * (missing newer fields like `collection`) still load cleanly. */
export function hydrate(partial: Partial<AppState> | null | undefined): AppState {
  const merged = { ...defaultState(), ...(partial ?? {}) } as AppState & Record<string, unknown>
  for (const field of RETIRED_FIELDS) delete merged[field]

  // Accounts that predate the proof gate have no progression record. Seeding it
  // from their XP grandfathers the level they already earned — defaulting to 1
  // would silently demote everyone.
  if (!partial || !(partial as Partial<AppState>).progression) {
    merged.progression = { level: levelFromXp(merged.player.xp).level, proofs: 0 }
  }

  return merged
}

export function loadCachedState(userId: string): AppState | null {
  try {
    const raw = localStorage.getItem(cacheKey(userId))
    if (!raw) return null
    return hydrate(JSON.parse(raw) as Partial<AppState>)
  } catch {
    return null
  }
}

export function saveCachedState(userId: string, state: AppState): void {
  try {
    localStorage.setItem(cacheKey(userId), JSON.stringify(state))
  } catch {
    // localStorage unavailable (private mode, quota) — the server still has it.
  }
}

export function clearCachedState(userId: string): void {
  try {
    localStorage.removeItem(cacheKey(userId))
  } catch {
    // Nothing to do if storage is unavailable.
  }
}
