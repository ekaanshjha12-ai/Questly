export type GoalCategory =
  | 'fitness'
  | 'learning'
  | 'career'
  | 'creative'
  | 'wellness'
  | 'finance'
  | 'social'
  | 'general'

export interface Goal {
  id: string
  title: string
  category: GoalCategory
  /** Optional user-supplied specifics ("3 runs a week, by October") that make
   * the goal concrete. Purely descriptive — quests are generated from title. */
  detail?: string
  createdAt: string
  archived: boolean
}

export interface NewGoalInput {
  title: string
  category: GoalCategory
  detail?: string
}

export type QuestPeriod = 'daily' | 'weekly' | 'monthly'

export type VerificationKind = 'photo' | 'voice'

export interface Quest {
  id: string
  goalId: string
  period: QuestPeriod
  periodKey: string
  title: string
  xp: number
  completed: boolean
  completedAt: string | null
  /** Set once a photo or spoken confirmation has been accepted as proof. */
  verifiedBy?: VerificationKind
  verifiedAt?: string
  verificationNote?: string
}

export type CharacterId = 'male' | 'female'

export interface Player {
  name: string
  character: CharacterId
  xp: number
  coins: number
  createdAt: string
}

export interface Progression {
  /** Highest level actually unlocked. XP can run ahead of this while the player
   * still owes photo proof. */
  level: number
  /** Photo proofs banked toward the next level. */
  proofs: number
}

export interface Collection {
  /** Ids of character models the player has bought. */
  unlocked: string[]
  /** Currently worn model id, or null for the starter character. */
  active: string | null
}

export interface StreakState {
  current: number
  longest: number
  lastCompletedDay: string | null
}

export interface Todo {
  id: string
  title: string
  done: boolean
  createdAt: string
  completedAt: string | null
}

export type SessionKind = 'timer' | 'stopwatch'

/** A recorded stretch of focused work. `completed` means a countdown timer
 * actually reached zero, as opposed to being saved early. */
export interface FocusSession {
  id: string
  kind: SessionKind
  label: string
  goalId: string | null
  durationMs: number
  targetMs: number | null
  completed: boolean
  startedAt: string
  endedAt: string
}

export type PlannerView = 'daily' | 'weekly' | 'monthly'

/** A placement of an existing task into a planner slot. The task itself always
 * lives in `todos` or `quests` — the planner only records *where* it sits, so
 * completion and XP stay governed by a single source of truth. */
export interface ScheduleEntry {
  id: string
  refType: 'todo' | 'quest'
  refId: string
  view: PlannerView
  periodKey: string
  slot: string
  createdAt: string
}

export interface Achievement {
  id: string
  title: string
  description: string
  icon: string
}

export interface AppState {
  onboarded: boolean
  player: Player
  goals: Goal[]
  quests: Quest[]
  todos: Todo[]
  schedule: ScheduleEntry[]
  sessions: FocusSession[]
  streak: StreakState
  unlockedAchievements: Record<string, string>
  collection: Collection
  progression: Progression
}
