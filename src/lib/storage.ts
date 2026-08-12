import type { AppState, LegacyScheduleEntry, ScheduleEntry } from '../types'
import { levelFromXp } from './leveling'
import { dateFromLegacyEntry } from './planner'

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
    decks: [],
    reports: [],
    outlook: null,
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

/**
 * Rewrites schedule entries saved before placements were anchored to a date.
 *
 * Without this, every existing placement would vanish from the planner — the
 * views read `entry.date`, and an old entry has none. Two entries can now
 * collide (the same task placed in two views, which the old model allowed and
 * this change is meant to prevent), so the first one wins and the rest are
 * dropped rather than leaving a task sitting on two days.
 */
function migrateSchedule(schedule: unknown): ScheduleEntry[] {
  if (!Array.isArray(schedule)) return []
  const out: ScheduleEntry[] = []
  const claimed = new Set<string>()

  for (const raw of schedule as (ScheduleEntry & LegacyScheduleEntry)[]) {
    if (!raw?.refId) continue
    const key = `${raw.refType}:${raw.refId}`
    if (claimed.has(key)) continue

    if (typeof raw.date === 'string' && raw.date) {
      claimed.add(key)
      out.push(raw)
      continue
    }

    const placed = dateFromLegacyEntry(raw)
    if (!placed) continue
    claimed.add(key)
    out.push({
      id: raw.id,
      refType: raw.refType,
      refId: raw.refId,
      date: placed.date,
      ...(placed.block ? { block: placed.block } : {}),
      createdAt: raw.createdAt,
    })
  }
  return out
}

/** Merges onto defaultState so states saved by older versions of the app
 * (missing newer fields like `collection`) still load cleanly. */
export function hydrate(partial: Partial<AppState> | null | undefined): AppState {
  const merged = { ...defaultState(), ...(partial ?? {}) } as AppState & Record<string, unknown>
  for (const field of RETIRED_FIELDS) delete merged[field]

  merged.schedule = migrateSchedule(merged.schedule)

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

/** The last account to sign in successfully. Kept so that an offline start can
 * find which cached state to open — without it the app cannot get past the
 * session check and the cache it already holds is unreachable. */
const LAST_USER_KEY = `${PREFIX}:last-user`

export interface RememberedUser {
  id: string
  email: string
}

export function rememberUser(user: RememberedUser): void {
  try {
    localStorage.setItem(LAST_USER_KEY, JSON.stringify(user))
  } catch {
    // Storage unavailable — offline start just won't be possible.
  }
}

export function recallUser(): RememberedUser | null {
  try {
    const raw = localStorage.getItem(LAST_USER_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as RememberedUser
    return parsed?.id ? parsed : null
  } catch {
    return null
  }
}

export function forgetUser(): void {
  try {
    localStorage.removeItem(LAST_USER_KEY)
  } catch {
    // Nothing to do.
  }
}

export function clearCachedState(userId: string): void {
  try {
    localStorage.removeItem(cacheKey(userId))
  } catch {
    // Nothing to do if storage is unavailable.
  }
}
