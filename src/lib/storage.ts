import type { AppState, LegacyScheduleEntry, ScheduleEntry } from '../types'
import type { GameSnapshot } from './api'
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
      createdAt: new Date().toISOString(),
    },
    goals: [],
    schedule: [],
    decks: [],
    reports: [],
    outlook: null,
    habits: [],
    habitMarks: {},
    moods: {},
    card: null,
  }
}

/**
 * Fields that used to live in the notebook and now belong to the server. An
 * older cached document still carries them; they are dropped on load so they
 * never ride along in a save again.
 */
const RETIRED_FIELDS = [
  'equipment',
  'activePowers',
  'quests',
  'todos',
  'sessions',
  'streak',
  'unlockedAchievements',
  'collection',
  'progression',
  'challengeRewards',
] as const

/**
 * Rewrites schedule entries saved before placements were anchored to a date.
 *
 * Two entries can collide (the same task placed in two views, which the old
 * model allowed), so the first one wins and the rest are dropped rather than
 * leaving a task sitting on two days.
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

/** Merges onto defaultState so documents saved by older versions of the app
 * still load cleanly. */
export function hydrate(partial: Partial<AppState> | null | undefined): AppState {
  const base = defaultState()
  const merged = { ...base, ...(partial ?? {}) } as AppState & Record<string, unknown>
  for (const field of RETIRED_FIELDS) delete merged[field]
  const player = (partial?.player ?? {}) as Partial<AppState['player']> & Record<string, unknown>
  merged.player = {
    name: typeof player.name === 'string' && player.name ? player.name : base.player.name,
    character: player.character === 'male' ? 'male' : 'female',
    createdAt: typeof player.createdAt === 'string' ? player.createdAt : base.player.createdAt,
  }
  merged.schedule = migrateSchedule(merged.schedule)
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

/** The last game snapshot, so an offline start can still show progress. */
export function loadCachedGame(userId: string): GameSnapshot | null {
  try {
    const raw = localStorage.getItem(`${PREFIX}:game:${userId}`)
    return raw ? (JSON.parse(raw) as GameSnapshot) : null
  } catch {
    return null
  }
}

export function saveCachedGame(userId: string, snapshot: GameSnapshot): void {
  try {
    localStorage.setItem(`${PREFIX}:game:${userId}`, JSON.stringify(snapshot))
  } catch {
    // Storage full or unavailable — only the offline copy is lost.
  }
}

/** The last account to sign in successfully. Kept so that an offline start can
 * find which cached state to open. */
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
    localStorage.removeItem(`${PREFIX}:game:${userId}`)
  } catch {
    // Nothing to do if storage is unavailable.
  }
}
