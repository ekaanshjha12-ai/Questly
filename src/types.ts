export type GoalCategory =
  | 'fitness'
  | 'learning'
  | 'career'
  | 'creative'
  | 'wellness'
  | 'finance'
  | 'social'
  | 'general'

/** Quests written for one specific goal, replacing the generic category
 * templates. Absent when the server has no key to generate them. */
export interface QuestPool {
  daily: string[]
  weekly: string[]
  monthly: string[]
}

export interface Goal {
  id: string
  title: string
  category: GoalCategory
  /** Optional user-supplied specifics ("3 runs a week, by October"). Fed to the
   * quest writer, where it matters more than the title — it reveals level,
   * constraints and intent. */
  detail?: string
  createdAt: string
  archived: boolean
  /** Written for this goal when the server can. */
  questPool?: QuestPool
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

/** One line of a focus session's plan, tickable while the session runs. */
export interface PlanItem {
  id: string
  text: string
  done: boolean
}

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
  /** What the session was for, written before starting. */
  plan?: PlanItem[]
}

export interface Flashcard {
  id: string
  front: string
  back: string
  /** Which area of the topic it came from. Shown as a hint on the card. */
  subtopic?: string
}

export interface Deck {
  id: string
  topic: string
  cards: Flashcard[]
  createdAt: string
}

/** The marked result of one teach-back attempt. */
export interface ExplainReport {
  id: string
  topic: string
  score: number
  verdict: string
  strengths: string[]
  gaps: string[]
  misconceptions: string[]
  nextSteps: string[]
  createdAt: string
}

export type PlannerView = 'daily' | 'weekly' | 'monthly'

/** A placement of an existing task onto a day. The task itself always lives in
 * `todos` or `quests` — the planner only records *where* it sits, so completion
 * and XP stay governed by a single source of truth.
 *
 * The anchor is a real date, not a view. Daily, weekly and monthly are three
 * lenses over the same field, so a task placed once is visible in all of them.
 * Storing a view here instead meant a day assigned in one view was invisible in
 * the other two, which let the same task be scheduled again on a second day. */
export interface ScheduleEntry {
  id: string
  refType: 'todo' | 'quest'
  refId: string
  /** The day it sits on, as `YYYY-MM-DD`. */
  date: string
  /** Time-of-day block. Absent means "sometime that day" — weekly and monthly
   * cells have no time to assign, so placements made there carry none. */
  block?: string
  createdAt: string
}

/** Legacy shape, kept only so `hydrate` can convert states saved before entries
 * were anchored to dates. Never written. */
export interface LegacyScheduleEntry {
  id: string
  refType: 'todo' | 'quest'
  refId: string
  view: PlannerView
  periodKey: string
  slot: string
  createdAt: string
}

/** Where an AI-planned task lands once placed — the same coordinates a manual
 * drag onto the Planner would produce. */
export interface PlanPlacement {
  date: string
  block?: string
}

/** One task from a generated plan, ready to become a to-do. Dated tasks carry
 * a placement so they show up already scheduled instead of sitting unplaced. */
export interface PlanItemInput {
  title: string
  placement?: PlanPlacement
}

export interface OutlookQuote {
  text: string
  /** Absent when the line is unattributed — a wrong attribution is worse than
   * none, so the writer leaves it off unless it is certain. */
  author?: string
}

export interface GoalOutlook {
  title: string
  probability: number
  note: string
}

/** The model's read on whether the player is on track. Cached on state rather
 * than regenerated per render, since each one costs an API call. */
export interface SuccessOutlook {
  probability: number
  confidence: 'low' | 'medium' | 'high'
  verdict: string
  drivers: string[]
  risks: string[]
  perGoal: GoalOutlook[]
  quotes: OutlookQuote[]
  createdAt: string
}

/**
 * A habit the user tracks by hand, ticked day by day.
 *
 * Deliberately separate from goals and quests. Those are generated, carry XP
 * and are marked complete through the app's own machinery; a habit is a row the
 * user wrote themselves and ticks themselves, and nothing else touches it.
 */
export interface Habit {
  id: string
  name: string
  /** Key into HABIT_COLORS — stored as a key rather than a hex value so the
   * palette can be adjusted later without rewriting everyone's saved habits. */
  color: string
  createdAt: string
  archived: boolean
}

/** Habit id → the days it was ticked, as `YYYY-MM-DD`.
 *
 * A set of ticked days per habit rather than a row per day: the grid is mostly
 * empty for most people, and storing only the marks keeps a year of tracking to
 * a few kilobytes instead of a few hundred. */
export type HabitMarks = Record<string, string[]>

export type MoodSlot = 'am' | 'pm'

/** `YYYY-MM-DD` → the mood recorded for each half of that day. */
export type MoodLog = Record<string, Partial<Record<MoodSlot, string>>>

/** Which piece of the profile a card element shows. */
export type CardField =
  | 'avatar'
  | 'name'
  | 'username'
  | 'bio'
  | 'rank'
  | 'level'
  | 'xp'
  | 'birthday'
  | 'joined'
  | 'email'

interface CardItemBase {
  id: string
  /** Centre of the element, as a share of the card's width and height, so a
   * design looks the same at any size the card is drawn. */
  x: number
  y: number
  scale: number
  /** Degrees. */
  rotate: number
}

export type CardItem =
  | (CardItemBase & { kind: 'field'; field: CardField })
  | (CardItemBase & { kind: 'text'; text: string; color: string })
  | (CardItemBase & { kind: 'sticker'; emoji: string })

/** A freehand line. Points are a flat `[x0, y0, x1, y1, …]` list in a
 * 1000×1400 space — whole numbers, which keep a drawing a few kilobytes. */
export interface CardStroke {
  color: string
  size: number
  points: number[]
}

export interface CardDesign {
  background: string
  items: CardItem[]
  strokes: CardStroke[]
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
  decks: Deck[]
  reports: ExplainReport[]
  /** Null until the player asks for their first analysis. */
  outlook: SuccessOutlook | null
  collection: Collection
  progression: Progression
  /** Hand-tracked habits and their ticks. */
  habits: Habit[]
  habitMarks: HabitMarks
  moods: MoodLog
  /** The player's decorated profile card. Null until they first change it —
   * until then the default layout is drawn. */
  card: CardDesign | null
}
