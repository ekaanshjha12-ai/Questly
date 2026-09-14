import { useCallback, useEffect, useReducer, useRef, useState } from 'react'
import type {
  AppState,
  CardDesign,
  CharacterId,
  Deck,
  ExplainReport,
  Goal,
  GoalCategory,
  Habit,
  MoodSlot,
  NewGoalInput,
  QuestPool,
  ScheduleEntry,
  SuccessOutlook,
} from '../types'
import { hydrate, saveCachedState } from '../lib/storage'
import { ApiError, generateQuestPool as generateQuestPoolRemote, refreshGoalQuests, saveState as saveStateRemote, type RewardSummary } from '../lib/api'
import { tidyCard } from '../lib/card'

/**
 * The player's notebook: goals, habits, moods, the planner's placements,
 * study decks, reports, the progress outlook and the card design.
 *
 * Kept in the browser and saved to the server as one document. Nothing here
 * earns anything — quests, focus sessions, XP and items belong to the server
 * (see game/GameProvider.tsx). A save can still unlock an achievement (a first
 * goal, a designed card); the server says so in its reply and `onRewards`
 * passes that on.
 */

type Action =
  | { type: 'ONBOARD'; name: string; character: CharacterId; goals: NewGoalInput[] }
  | { type: 'ADD_GOAL'; title: string; category: GoalCategory; detail?: string }
  | { type: 'ARCHIVE_GOAL'; goalId: string }
  | { type: 'SET_QUEST_POOL'; goalId: string; pool: QuestPool }
  | { type: 'ADD_DECK'; topic: string; cards: { front: string; back: string; subtopic?: string }[] }
  | { type: 'DELETE_DECK'; deckId: string }
  | { type: 'UPDATE_CARD'; deckId: string; cardId: string; front: string; back: string }
  | { type: 'DELETE_CARD'; deckId: string; cardId: string }
  | { type: 'ADD_CARD'; deckId: string }
  | { type: 'ADD_REPORT'; report: Omit<ExplainReport, 'id' | 'createdAt'> }
  | { type: 'DELETE_REPORT'; reportId: string }
  | { type: 'SET_OUTLOOK'; outlook: Omit<SuccessOutlook, 'createdAt'> }
  | { type: 'SCHEDULE_TASK'; refType: 'todo' | 'quest'; refId: string; date: string; block?: string }
  | { type: 'ADD_SCHEDULE_ENTRIES'; entries: { refId: string; date: string; block?: string }[] }
  /** `block: null` clears the time of day; omitting it keeps what the entry had. */
  | { type: 'MOVE_SCHEDULE_ENTRY'; entryId: string; date: string; block?: string | null }
  | { type: 'UNSCHEDULE'; entryId: string }
  | { type: 'RENAME_PLAYER'; name: string }
  | { type: 'SET_CARD'; card: CardDesign | null }
  | { type: 'ADD_HABIT'; name: string; color: string }
  | { type: 'RENAME_HABIT'; habitId: string; name: string }
  | { type: 'RECOLOR_HABIT'; habitId: string; color: string }
  | { type: 'DELETE_HABIT'; habitId: string }
  | { type: 'TOGGLE_HABIT_MARK'; habitId: string; date: string }
  | { type: 'SET_MOOD'; date: string; slot: MoodSlot; moodId: string | null }
  | { type: 'HYDRATE'; state: AppState }

function makeEntry(refType: 'todo' | 'quest', refId: string, date: string, block?: string): ScheduleEntry {
  return {
    id: crypto.randomUUID(),
    refType,
    refId,
    date,
    ...(block ? { block } : {}),
    createdAt: new Date().toISOString(),
  }
}

function makeGoal(title: string, category: GoalCategory, detail?: string): Goal {
  const trimmedDetail = detail?.trim()
  return {
    id: crypto.randomUUID(),
    title: title.trim(),
    category,
    ...(trimmedDetail ? { detail: trimmedDetail } : {}),
    createdAt: new Date().toISOString(),
    archived: false,
  }
}

function makeHabit(name: string, color: string): Habit {
  return {
    id: crypto.randomUUID(),
    name: name.trim(),
    color,
    createdAt: new Date().toISOString(),
    archived: false,
  }
}

function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'HYDRATE':
      return action.state

    case 'ONBOARD': {
      const goals = action.goals.filter((g) => g.title.trim()).map((g) => makeGoal(g.title, g.category, g.detail))
      return {
        ...state,
        onboarded: true,
        player: { ...state.player, name: action.name.trim() || 'Adventurer', character: action.character },
        goals: [...state.goals, ...goals],
      }
    }

    case 'ADD_GOAL': {
      if (!action.title.trim()) return state
      return { ...state, goals: [...state.goals, makeGoal(action.title, action.category, action.detail)] }
    }

    case 'ARCHIVE_GOAL':
      return { ...state, goals: state.goals.map((g) => (g.id === action.goalId ? { ...g, archived: true } : g)) }

    case 'SET_QUEST_POOL': {
      const goal = state.goals.find((g) => g.id === action.goalId)
      if (!goal || goal.questPool) return state
      return { ...state, goals: state.goals.map((g) => (g.id === action.goalId ? { ...g, questPool: action.pool } : g)) }
    }

    case 'RENAME_PLAYER': {
      const name = action.name.trim().slice(0, 24)
      if (!name || name === state.player.name) return state
      return { ...state, player: { ...state.player, name } }
    }

    case 'SET_CARD':
      return { ...state, card: action.card ? tidyCard(action.card) : null }

    case 'ADD_HABIT': {
      const name = action.name.trim()
      if (!name) return state
      return { ...state, habits: [...state.habits, makeHabit(name, action.color)] }
    }

    case 'RENAME_HABIT': {
      const name = action.name.trim()
      if (!name) return state
      return { ...state, habits: state.habits.map((h) => (h.id === action.habitId ? { ...h, name } : h)) }
    }

    case 'RECOLOR_HABIT':
      return { ...state, habits: state.habits.map((h) => (h.id === action.habitId ? { ...h, color: action.color } : h)) }

    case 'DELETE_HABIT': {
      // The marks go with it, or reusing the id later would resurrect them.
      const { [action.habitId]: _dropped, ...marks } = state.habitMarks
      return { ...state, habits: state.habits.filter((h) => h.id !== action.habitId), habitMarks: marks }
    }

    case 'TOGGLE_HABIT_MARK': {
      const marked = state.habitMarks[action.habitId] ?? []
      const next = marked.includes(action.date) ? marked.filter((d) => d !== action.date) : [...marked, action.date].sort()
      return { ...state, habitMarks: { ...state.habitMarks, [action.habitId]: next } }
    }

    case 'SET_MOOD': {
      const day = { ...(state.moods[action.date] ?? {}) }
      if (action.moodId === null) delete day[action.slot]
      else day[action.slot] = action.moodId
      const moods = { ...state.moods }
      if (Object.keys(day).length) moods[action.date] = day
      else delete moods[action.date]
      return { ...state, moods }
    }

    case 'SCHEDULE_TASK': {
      // A quest sits on exactly one day; placing it again moves it.
      const others = state.schedule.filter((e) => !(e.refId === action.refId))
      return { ...state, schedule: [...others, makeEntry(action.refType, action.refId, action.date, action.block)] }
    }

    case 'ADD_SCHEDULE_ENTRIES': {
      if (!action.entries.length) return state
      const ids = new Set(action.entries.map((e) => e.refId))
      return {
        ...state,
        schedule: [...state.schedule.filter((e) => !ids.has(e.refId)), ...action.entries.map((e) => makeEntry('quest', e.refId, e.date, e.block))],
      }
    }

    case 'MOVE_SCHEDULE_ENTRY':
      return {
        ...state,
        schedule: state.schedule.map((e) => {
          if (e.id !== action.entryId) return e
          const block = action.block === undefined ? e.block : (action.block ?? undefined)
          return { ...e, date: action.date, ...(block ? { block } : { block: undefined }) }
        }),
      }

    case 'UNSCHEDULE':
      return { ...state, schedule: state.schedule.filter((e) => e.id !== action.entryId) }

    case 'ADD_DECK': {
      const cards = action.cards.map((c) => ({
        id: crypto.randomUUID(),
        front: c.front,
        back: c.back,
        ...(c.subtopic ? { subtopic: c.subtopic } : {}),
      }))
      if (!cards.length) return state
      const deck: Deck = { id: crypto.randomUUID(), topic: action.topic, cards, createdAt: new Date().toISOString() }
      return { ...state, decks: [deck, ...state.decks] }
    }

    case 'DELETE_DECK':
      return { ...state, decks: state.decks.filter((d) => d.id !== action.deckId) }

    case 'UPDATE_CARD': {
      const front = action.front.trim()
      const back = action.back.trim()
      if (!front) return state
      return {
        ...state,
        decks: state.decks.map((d) =>
          d.id !== action.deckId ? d : { ...d, cards: d.cards.map((c) => (c.id === action.cardId ? { ...c, front, back } : c)) },
        ),
      }
    }

    case 'DELETE_CARD':
      return {
        ...state,
        decks: state.decks.map((d) => (d.id !== action.deckId ? d : { ...d, cards: d.cards.filter((c) => c.id !== action.cardId) })),
      }

    case 'ADD_CARD':
      return {
        ...state,
        decks: state.decks.map((d) =>
          d.id !== action.deckId ? d : { ...d, cards: [...d.cards, { id: crypto.randomUUID(), front: 'New card', back: '' }] },
        ),
      }

    case 'ADD_REPORT': {
      const report: ExplainReport = { ...action.report, id: crypto.randomUUID(), createdAt: new Date().toISOString() }
      return { ...state, reports: [report, ...state.reports].slice(0, 50) }
    }

    case 'DELETE_REPORT':
      return { ...state, reports: state.reports.filter((r) => r.id !== action.reportId) }

    case 'SET_OUTLOOK':
      return { ...state, outlook: { ...action.outlook, createdAt: new Date().toISOString() } }

    default:
      return state
  }
}

export type SyncStatus = 'idle' | 'saving' | 'saved' | 'error'

const WRITING_UNAVAILABLE_KEY = 'questly:quest-writing-unavailable'

function questWritingUnavailable(): boolean {
  try {
    return sessionStorage.getItem(WRITING_UNAVAILABLE_KEY) === '1'
  } catch {
    return false
  }
}

function markQuestWritingUnavailable(): void {
  try {
    sessionStorage.setItem(WRITING_UNAVAILABLE_KEY, '1')
  } catch {
    // Private mode: asked again next load, which is harmless.
  }
}

function goalSignature(state: AppState): string {
  return state.goals
    .filter((g) => !g.archived)
    .map((g) => g.id)
    .sort()
    .join(',')
}

const SAVE_DEBOUNCE_MS = 600

export function useAppState(
  userId: string,
  initialState: AppState | null,
  {
    onRewards,
    onGoalsSaved,
  }: {
    /** A save unlocked something (first goal, designed card). */
    onRewards?: (summary: RewardSummary) => void
    /** Goals, or their written quests, reached the server; the board should refresh. */
    onGoalsSaved?: () => void
  } = {},
) {
  const [state, dispatch] = useReducer(reducer, initialState, (init) => hydrate(init))
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('idle')
  const skipFirstSave = useRef(true)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pendingPoolRefresh = useRef(new Set<string>())
  const callbacks = useRef({ onRewards, onGoalsSaved })
  callbacks.current = { onRewards, onGoalsSaved }
  // The goals the server last saw, so a save that adds or archives one can
  // prompt the board to pick up (or drop) that goal's quests.
  const savedGoals = useRef(goalSignature(state))

  useEffect(() => {
    saveCachedState(userId, state)
    if (skipFirstSave.current) {
      skipFirstSave.current = false
      return
    }
    if (saveTimer.current) clearTimeout(saveTimer.current)
    setSyncStatus('saving')
    saveTimer.current = setTimeout(() => {
      const signature = goalSignature(state)
      saveStateRemote(state)
        .then(async (result) => {
          setSyncStatus('saved')
          if (result?.rewards) callbacks.current.onRewards?.(result.rewards)
          const goalsChanged = signature !== savedGoals.current
          savedGoals.current = signature
          // A goal that just got its written quests: swap today's template
          // quests for the written ones, now that the server has the pool.
          const goals = [...pendingPoolRefresh.current]
          pendingPoolRefresh.current.clear()
          for (const goalId of goals) {
            try {
              await refreshGoalQuests(goalId)
            } catch {
              // The next period picks up the written quests anyway.
            }
          }
          if (goals.length || goalsChanged) callbacks.current.onGoalsSaved?.()
        })
        .catch(() => setSyncStatus('error'))
    }, SAVE_DEBOUNCE_MS)
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current)
    }
  }, [state, userId])

  // Goals created before the server could write quests, or while it had no
  // key, are picked up here. Attempts are remembered so a failing server is
  // not asked again on every render.
  const poolAttempts = useRef(new Set<string>())
  const unmounted = useRef(false)
  useEffect(
    () => () => {
      unmounted.current = true
    },
    [],
  )

  useEffect(() => {
    if (questWritingUnavailable()) return
    const pending = state.goals.filter((g) => !g.archived && !g.questPool && !poolAttempts.current.has(g.id))
    if (!pending.length) return
    void (async () => {
      for (const goal of pending) {
        poolAttempts.current.add(goal.id)
        try {
          const { pool } = await generateQuestPoolRemote({ title: goal.title, detail: goal.detail, category: goal.category })
          if (unmounted.current) return
          pendingPoolRefresh.current.add(goal.id)
          dispatch({ type: 'SET_QUEST_POOL', goalId: goal.id, pool })
        } catch (err) {
          // No key, or the model failed. The plain wording still applies. A
          // server with no key says so with a 503; it is not asked again this
          // session.
          if (err instanceof ApiError && err.status === 503) {
            markQuestWritingUnavailable()
            return
          }
        }
      }
    })()
  }, [state.goals])

  const act = useCallback(<T extends Action>(action: T) => dispatch(action), [])

  return {
    state,
    syncStatus,
    onboard: useCallback((name: string, character: CharacterId, goals: NewGoalInput[]) => act({ type: 'ONBOARD', name, character, goals }), [act]),
    addGoal: useCallback((title: string, category: GoalCategory, detail?: string) => act({ type: 'ADD_GOAL', title, category, detail }), [act]),
    archiveGoal: useCallback((goalId: string) => act({ type: 'ARCHIVE_GOAL', goalId }), [act]),
    renamePlayer: useCallback((name: string) => act({ type: 'RENAME_PLAYER', name }), [act]),
    setCard: useCallback((card: CardDesign | null) => act({ type: 'SET_CARD', card }), [act]),
    addHabit: useCallback((name: string, color: string) => act({ type: 'ADD_HABIT', name, color }), [act]),
    renameHabit: useCallback((habitId: string, name: string) => act({ type: 'RENAME_HABIT', habitId, name }), [act]),
    recolorHabit: useCallback((habitId: string, color: string) => act({ type: 'RECOLOR_HABIT', habitId, color }), [act]),
    deleteHabit: useCallback((habitId: string) => act({ type: 'DELETE_HABIT', habitId }), [act]),
    toggleHabitMark: useCallback((habitId: string, date: string) => act({ type: 'TOGGLE_HABIT_MARK', habitId, date }), [act]),
    setMood: useCallback((date: string, slot: MoodSlot, moodId: string | null) => act({ type: 'SET_MOOD', date, slot, moodId }), [act]),
    scheduleTask: useCallback(
      (refType: 'todo' | 'quest', refId: string, date: string, block?: string) => act({ type: 'SCHEDULE_TASK', refType, refId, date, block }),
      [act],
    ),
    addScheduleEntries: useCallback((entries: { refId: string; date: string; block?: string }[]) => act({ type: 'ADD_SCHEDULE_ENTRIES', entries }), [act]),
    moveScheduleEntry: useCallback((entryId: string, date: string, block?: string | null) => act({ type: 'MOVE_SCHEDULE_ENTRY', entryId, date, block }), [act]),
    unschedule: useCallback((entryId: string) => act({ type: 'UNSCHEDULE', entryId }), [act]),
    addDeck: useCallback((topic: string, cards: { front: string; back: string; subtopic?: string }[]) => act({ type: 'ADD_DECK', topic, cards }), [act]),
    deleteDeck: useCallback((deckId: string) => act({ type: 'DELETE_DECK', deckId }), [act]),
    updateCard: useCallback((deckId: string, cardId: string, front: string, back: string) => act({ type: 'UPDATE_CARD', deckId, cardId, front, back }), [act]),
    deleteCard: useCallback((deckId: string, cardId: string) => act({ type: 'DELETE_CARD', deckId, cardId }), [act]),
    addCard: useCallback((deckId: string) => act({ type: 'ADD_CARD', deckId }), [act]),
    addReport: useCallback((report: Omit<ExplainReport, 'id' | 'createdAt'>) => act({ type: 'ADD_REPORT', report }), [act]),
    deleteReport: useCallback((reportId: string) => act({ type: 'DELETE_REPORT', reportId }), [act]),
    setOutlook: useCallback((outlook: Omit<SuccessOutlook, 'createdAt'>) => act({ type: 'SET_OUTLOOK', outlook }), [act]),
  }
}

export type Notebook = ReturnType<typeof useAppState>
