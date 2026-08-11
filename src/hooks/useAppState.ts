import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react'
import type {
  AppState,
  CharacterId,
  Goal,
  GoalCategory,
  FocusSession,
  NewGoalInput,
  PlannerView,
  SessionKind,
  ScheduleEntry,
  StreakState,
  Deck,
  PlanItem,
  QuestPool,
  Todo,
  VerificationKind,
} from '../types'
import { hydrate, saveCachedState } from '../lib/storage'
import { generateQuestPool as generateQuestPoolRemote, saveState as saveStateRemote } from '../lib/api'
import { ensureCurrentQuests } from '../lib/quests'
import { dailyKey, isYesterday, periodKey } from '../lib/period'
import { advanceProgression, levelFromXp, proofsOutstanding, PROOFS_PER_LEVEL } from '../lib/leveling'
import { evaluateAchievements, ACHIEVEMENTS } from '../lib/achievements'
import { findModel, isModelUnlocked, rankForLevel } from '../data/ranks'
import { sessionXp } from '../lib/time'

export type AppEvent =
  | { id: string; type: 'xp'; amount: number }
  | { id: string; type: 'levelup'; level: number }
  | { id: string; type: 'achievement'; achievementId: string }
  | { id: string; type: 'streak'; days: number }
  | { id: string; type: 'rank'; rankId: string }

type Action =
  | { type: 'ONBOARD'; name: string; character: CharacterId; goals: NewGoalInput[] }
  | { type: 'ADD_GOAL'; title: string; category: GoalCategory }
  | { type: 'ARCHIVE_GOAL'; goalId: string }
  | { type: 'SYNC_QUESTS' }
  | { type: 'COMPLETE_QUEST'; questId: string }
  | { type: 'UNCOMPLETE_QUEST'; questId: string }
  | { type: 'SET_QUEST_POOL'; goalId: string; pool: QuestPool }
  | { type: 'ADD_DECK'; topic: string; cards: { front: string; back: string; subtopic?: string }[] }
  | { type: 'DELETE_DECK'; deckId: string }
  | { type: 'UPDATE_CARD'; deckId: string; cardId: string; front: string; back: string }
  | { type: 'DELETE_CARD'; deckId: string; cardId: string }
  | { type: 'ADD_CARD'; deckId: string }
  | { type: 'BUY_MODEL'; modelId: string }
  | { type: 'EQUIP_MODEL'; modelId: string | null }
  | { type: 'ADD_TODO'; title: string }
  | { type: 'TOGGLE_TODO'; todoId: string }
  | { type: 'DELETE_TODO'; todoId: string }
  | { type: 'CLEAR_DONE_TODOS' }
  | {
      type: 'SCHEDULE_TASK'
      refType: 'todo' | 'quest'
      refId: string
      view: PlannerView
      periodKey: string
      slot: string
    }
  | { type: 'MOVE_SCHEDULE_ENTRY'; entryId: string; periodKey: string; slot: string }
  | { type: 'UNSCHEDULE'; entryId: string }
  | { type: 'ADD_PLANNED_TODO'; title: string; view: PlannerView; periodKey: string; slot: string }
  | {
      type: 'SAVE_SESSION'
      kind: SessionKind
      label: string
      plan: PlanItem[]
      goalId: string | null
      durationMs: number
      targetMs: number | null
      completed: boolean
      startedAt: string
    }
  | { type: 'DELETE_SESSION'; sessionId: string }
  | { type: 'VERIFY_QUEST'; questId: string; kind: VerificationKind; note: string }
  | { type: 'HYDRATE'; state: AppState }

export const TODO_XP = 10
const TODO_COINS = Math.round(TODO_XP / 3)

/** Bonus for backing a completed quest with evidence. A photo is stronger
 * proof than a self-reported description, so it's worth more. */
export const VERIFY_BONUS_XP: Record<VerificationKind, number> = {
  photo: 15,
  voice: 8,
}

function makeTodo(title: string): Todo {
  return {
    id: crypto.randomUUID(),
    title: title.trim(),
    done: false,
    createdAt: new Date().toISOString(),
    completedAt: null,
  }
}

function makeEntry(
  refType: 'todo' | 'quest',
  refId: string,
  view: PlannerView,
  periodKey: string,
  slot: string,
): ScheduleEntry {
  return {
    id: crypto.randomUUID(),
    refType,
    refId,
    view,
    periodKey,
    slot,
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

function withSyncedQuests(state: AppState): AppState {
  const quests = ensureCurrentQuests(state.goals, state.quests)
  return quests === state.quests ? state : { ...state, quests }
}

/** Advances the streak the first time anything is completed on a given day;
 * repeat completions the same day leave it untouched. */
function advanceStreak(streak: StreakState, now: Date): StreakState {
  const today = dailyKey(now)
  if (streak.lastCompletedDay === today) return streak
  const continued = streak.lastCompletedDay ? isYesterday(streak.lastCompletedDay, now) : false
  const current = continued ? streak.current + 1 : 1
  return { current, longest: Math.max(streak.longest, current), lastCompletedDay: today }
}

/**
 * Wraps the reducer so every state change gets a chance to claim levels the
 * player has earned. Done here rather than in each case so no action can
 * accidentally leave XP and level out of step.
 */
function makeReducer(proofsRequired: number) {
  return function reducerWithProgression(state: AppState, action: Action): AppState {
    const next = reducer(state, action)
    if (next === state) return next

    const xpLevel = levelFromXp(next.player.xp).level
    const progression = advanceProgression(next.progression, xpLevel, proofsRequired)
    return progression === next.progression ? next : { ...next, progression }
  }
}

function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'HYDRATE':
      return withSyncedQuests(action.state)

    case 'ONBOARD': {
      const goals = action.goals
        .filter((g) => g.title.trim())
        .map((g) => makeGoal(g.title, g.category, g.detail))
      const next: AppState = {
        ...state,
        onboarded: true,
        player: { ...state.player, name: action.name.trim() || 'Adventurer', character: action.character },
        goals: [...state.goals, ...goals],
      }
      return withSyncedQuests(next)
    }

    case 'ADD_GOAL': {
      const goal = makeGoal(action.title, action.category)
      const next: AppState = { ...state, goals: [...state.goals, goal] }
      return withSyncedQuests(next)
    }

    case 'ARCHIVE_GOAL': {
      return {
        ...state,
        goals: state.goals.map((g) => (g.id === action.goalId ? { ...g, archived: true } : g)),
      }
    }

    case 'SYNC_QUESTS':
      return withSyncedQuests(state)

    case 'COMPLETE_QUEST': {
      const quest = state.quests.find((q) => q.id === action.questId)
      if (!quest || quest.completed) return state

      const now = new Date()
      const quests = state.quests.map((q) =>
        q.id === quest.id ? { ...q, completed: true, completedAt: now.toISOString() } : q,
      )

      return withSyncedQuests({
        ...state,
        quests,
        streak: advanceStreak(state.streak, now),
        player: { ...state.player, xp: state.player.xp + quest.xp, coins: state.player.coins + Math.round(quest.xp / 3) },
      })
    }

    case 'UNCOMPLETE_QUEST': {
      const quest = state.quests.find((q) => q.id === action.questId)
      if (!quest || !quest.completed) return state
      // A verified quest is locked: un-ticking it would refund the base XP but
      // not the verification bonus, so re-completing could mint XP.
      if (quest.verifiedBy) return state
      const quests = state.quests.map((q) => (q.id === quest.id ? { ...q, completed: false, completedAt: null } : q))
      return withSyncedQuests({
        ...state,
        quests,
        player: {
          ...state.player,
          xp: Math.max(0, state.player.xp - quest.xp),
          coins: Math.max(0, state.player.coins - Math.round(quest.xp / 3)),
        },
      })
    }

    case 'ADD_TODO': {
      if (!action.title.trim()) return state
      return { ...state, todos: [makeTodo(action.title), ...state.todos] }
    }

    case 'TOGGLE_TODO': {
      const todo = state.todos.find((t) => t.id === action.todoId)
      if (!todo) return state
      const now = new Date()

      if (todo.done) {
        return withSyncedQuests({
          ...state,
          todos: state.todos.map((t) => (t.id === todo.id ? { ...t, done: false, completedAt: null } : t)),
          player: {
            ...state.player,
            xp: Math.max(0, state.player.xp - TODO_XP),
            coins: Math.max(0, state.player.coins - TODO_COINS),
          },
        })
      }

      return withSyncedQuests({
        ...state,
        todos: state.todos.map((t) =>
          t.id === todo.id ? { ...t, done: true, completedAt: now.toISOString() } : t,
        ),
        streak: advanceStreak(state.streak, now),
        player: {
          ...state.player,
          xp: state.player.xp + TODO_XP,
          coins: state.player.coins + TODO_COINS,
        },
      })
    }

    case 'DELETE_TODO':
      return {
        ...state,
        todos: state.todos.filter((t) => t.id !== action.todoId),
        schedule: state.schedule.filter((e) => !(e.refType === 'todo' && e.refId === action.todoId)),
      }

    case 'CLEAR_DONE_TODOS': {
      const cleared = new Set(state.todos.filter((t) => t.done).map((t) => t.id))
      return {
        ...state,
        todos: state.todos.filter((t) => !t.done),
        schedule: state.schedule.filter((e) => !(e.refType === 'todo' && cleared.has(e.refId))),
      }
    }

    case 'SCHEDULE_TASK': {
      const exists = state.schedule.some(
        (e) =>
          e.refType === action.refType &&
          e.refId === action.refId &&
          e.view === action.view &&
          e.periodKey === action.periodKey &&
          e.slot === action.slot,
      )
      if (exists) return state
      const entry = makeEntry(action.refType, action.refId, action.view, action.periodKey, action.slot)
      return { ...state, schedule: [...state.schedule, entry] }
    }

    case 'MOVE_SCHEDULE_ENTRY':
      return {
        ...state,
        schedule: state.schedule.map((e) =>
          e.id === action.entryId ? { ...e, periodKey: action.periodKey, slot: action.slot } : e,
        ),
      }

    case 'UNSCHEDULE':
      return { ...state, schedule: state.schedule.filter((e) => e.id !== action.entryId) }

    case 'ADD_PLANNED_TODO': {
      if (!action.title.trim()) return state
      const todo = makeTodo(action.title)
      const entry = makeEntry('todo', todo.id, action.view, action.periodKey, action.slot)
      return {
        ...state,
        todos: [todo, ...state.todos],
        schedule: [...state.schedule, entry],
      }
    }

    case 'SAVE_SESSION': {
      // Ignore trivial taps so a mis-click can't farm XP.
      if (action.durationMs < 1000) return state
      const now = new Date()
      const session: FocusSession = {
        id: crypto.randomUUID(),
        kind: action.kind,
        label: action.label.trim() || (action.kind === 'timer' ? 'Focus session' : 'Stopwatch session'),
        goalId: action.goalId,
        durationMs: action.durationMs,
        targetMs: action.targetMs,
        completed: action.completed,
        startedAt: action.startedAt,
        endedAt: now.toISOString(),
        ...(action.plan?.length ? { plan: action.plan } : {}),
      }
      const xp = sessionXp(action.durationMs)
      return withSyncedQuests({
        ...state,
        sessions: [session, ...state.sessions],
        streak: advanceStreak(state.streak, now),
        player: {
          ...state.player,
          xp: state.player.xp + xp,
          coins: state.player.coins + Math.round(xp / 3),
        },
      })
    }

    case 'DELETE_SESSION':
      // History only — XP already earned is not clawed back.
      return { ...state, sessions: state.sessions.filter((s) => s.id !== action.sessionId) }

    case 'VERIFY_QUEST': {
      const quest = state.quests.find((q) => q.id === action.questId)
      // Only ever pays out once per quest.
      if (!quest || quest.verifiedBy) return state

      const now = new Date()
      const bonus = VERIFY_BONUS_XP[action.kind]
      const quests = state.quests.map((q) =>
        q.id === quest.id
          ? {
              ...q,
              completed: true,
              completedAt: q.completedAt ?? now.toISOString(),
              verifiedBy: action.kind,
              verifiedAt: now.toISOString(),
              verificationNote: action.note,
            }
          : q,
      )

      // Verifying an unfinished quest completes it too, so it must also pay the
      // quest's own XP — not just the bonus.
      const baseXp = quest.completed ? 0 : quest.xp
      const gained = baseXp + bonus

      return withSyncedQuests({
        ...state,
        quests,
        streak: advanceStreak(state.streak, now),
        // Only photos count toward the level gate — a spoken confirmation is
        // self-reported, so it still pays XP but never unlocks a level.
        progression:
          action.kind === 'photo'
            ? { ...state.progression, proofs: state.progression.proofs + 1 }
            : state.progression,
        player: {
          ...state.player,
          xp: state.player.xp + gained,
          coins: state.player.coins + Math.round(gained / 3),
        },
      })
    }

    case 'SET_QUEST_POOL': {
      const goal = state.goals.find((g) => g.id === action.goalId)
      if (!goal || goal.questPool) return state

      const goals = state.goals.map((g) => (g.id === action.goalId ? { ...g, questPool: action.pool } : g))

      // Drop this goal's unfinished quests for the current periods so the newly
      // written ones show up now. Waiting until tomorrow would leave the user
      // staring at the generic quests they just complained about. Completed
      // quests stay — their XP is already banked.
      const quests = state.quests.filter(
        (q) => q.goalId !== action.goalId || q.completed || q.periodKey !== periodKey(q.period),
      )

      return withSyncedQuests({ ...state, goals, quests })
    }

    case 'ADD_DECK': {
      const cards = action.cards.map((c) => ({
        id: crypto.randomUUID(),
        front: c.front,
        back: c.back,
        ...(c.subtopic ? { subtopic: c.subtopic } : {}),
      }))
      if (!cards.length) return state
      const deck: Deck = {
        id: crypto.randomUUID(),
        topic: action.topic,
        cards,
        createdAt: new Date().toISOString(),
      }
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
          d.id !== action.deckId
            ? d
            : { ...d, cards: d.cards.map((c) => (c.id === action.cardId ? { ...c, front, back } : c)) },
        ),
      }
    }

    case 'DELETE_CARD':
      return {
        ...state,
        decks: state.decks.map((d) =>
          d.id !== action.deckId ? d : { ...d, cards: d.cards.filter((c) => c.id !== action.cardId) },
        ),
      }

    case 'ADD_CARD':
      return {
        ...state,
        decks: state.decks.map((d) =>
          d.id !== action.deckId
            ? d
            : { ...d, cards: [...d.cards, { id: crypto.randomUUID(), front: 'New card', back: '' }] },
        ),
      }

    case 'BUY_MODEL': {
      const model = findModel(action.modelId)
      if (!model || state.collection.unlocked.includes(model.id)) return state

      const { level } = levelFromXp(state.player.xp)
      if (!isModelUnlocked(model, level)) return state
      if (state.player.coins < model.price) return state

      // Buying also wears it — nobody buys a look to leave it in the drawer.
      return {
        ...state,
        player: { ...state.player, coins: state.player.coins - model.price },
        collection: {
          unlocked: [...state.collection.unlocked, model.id],
          active: model.id,
        },
      }
    }

    case 'EQUIP_MODEL': {
      if (action.modelId === null) {
        return { ...state, collection: { ...state.collection, active: null } }
      }
      if (!state.collection.unlocked.includes(action.modelId)) return state
      return { ...state, collection: { ...state.collection, active: action.modelId } }
    }

    default:
      return state
  }
}

let eventCounter = 0
function nextEventId(): string {
  eventCounter += 1
  return `evt-${Date.now()}-${eventCounter}`
}

export type SyncStatus = 'idle' | 'saving' | 'saved' | 'error'

const SAVE_DEBOUNCE_MS = 600

export function useAppState(
  userId: string,
  initialState: AppState | null,
  /** 0 disables the photo gate — used when the server has no verification key,
   * so levelling can never become impossible. */
  proofsRequired: number = PROOFS_PER_LEVEL,
) {
  const reducerWithGate = useMemo(() => makeReducer(proofsRequired), [proofsRequired])
  const [state, dispatch] = useReducer(reducerWithGate, initialState, (init) =>
    withSyncedQuests(hydrate(init)),
  )
  const [events, setEvents] = useState<AppEvent[]>([])
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('idle')
  const prevSnapshot = useRef({ xp: state.player.xp, level: state.progression.level, streak: state.streak.current })
  const hasHydrated = useRef(false)
  // The first effect run just mirrors what we already loaded from the server,
  // so there is nothing new to push.
  const skipFirstSave = useRef(true)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    saveCachedState(userId, state)

    if (skipFirstSave.current) {
      skipFirstSave.current = false
      return
    }

    if (saveTimer.current) clearTimeout(saveTimer.current)
    setSyncStatus('saving')
    saveTimer.current = setTimeout(() => {
      saveStateRemote(state)
        .then(() => setSyncStatus('saved'))
        .catch(() => setSyncStatus('error'))
    }, SAVE_DEBOUNCE_MS)

    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current)
    }
  }, [state, userId])

  // Re-check for newly-due quests when the tab regains focus (e.g. across midnight).
  useEffect(() => {
    const onFocus = () => dispatch({ type: 'SYNC_QUESTS' })
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [])

  useEffect(() => {
    if (!hasHydrated.current) {
      hasHydrated.current = true
      prevSnapshot.current = { xp: state.player.xp, level: state.progression.level, streak: state.streak.current }
      return
    }

    const prev = prevSnapshot.current
    const newEvents: AppEvent[] = []
    const xpDelta = state.player.xp - prev.xp
    // The claimed level, not what XP alone would allow — a gated level-up only
    // celebrates once the proof actually lands.
    const level = state.progression.level

    if (xpDelta > 0) {
      newEvents.push({ id: nextEventId(), type: 'xp', amount: xpDelta })
      if (state.streak.current > prev.streak && state.streak.current > 1) {
        newEvents.push({ id: nextEventId(), type: 'streak', days: state.streak.current })
      }
      const newlyUnlocked = evaluateAchievements(state)
      if (newlyUnlocked.length) {
        const stamp = new Date().toISOString()
        dispatch({
          type: 'HYDRATE',
          state: {
            ...state,
            unlockedAchievements: newlyUnlocked.reduce(
              (acc, id) => ({ ...acc, [id]: stamp }),
              { ...state.unlockedAchievements },
            ),
          },
        })
        for (const id of newlyUnlocked) newEvents.push({ id: nextEventId(), type: 'achievement', achievementId: id })
      }

    }

    // Outside the XP branch: a level can be claimed by submitting proof, which
    // is a separate moment from earning the XP that unlocked it.
    if (level > prev.level) {
      newEvents.push({ id: nextEventId(), type: 'levelup', level })
      const before = rankForLevel(prev.level)
      const after = rankForLevel(level)
      if (after.id !== before.id) {
        newEvents.push({ id: nextEventId(), type: 'rank', rankId: after.id })
      }
    }

    if (newEvents.length) setEvents((prevEvents) => [...prevEvents, ...newEvents])
    prevSnapshot.current = { xp: state.player.xp, level, streak: state.streak.current }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.player.xp, state.streak.current, state.progression.level])

  // Goals created before the server could write quests, or while it had no key,
  // are picked up here. Attempts are remembered so a failing server is not hit
  // once per render.
  const poolAttempts = useRef(new Set<string>())
  const unmounted = useRef(false)
  useEffect(
    () => () => {
      unmounted.current = true
    },
    [],
  )

  useEffect(() => {
    const pending = state.goals.filter(
      (g) => !g.archived && !g.questPool && !poolAttempts.current.has(g.id),
    )
    if (!pending.length) return

    // Deliberately no cleanup that aborts this loop. Each pool that arrives
    // changes state.goals, which re-runs the effect — and an abort-on-rerun
    // would throw away every goal after the first while still marking them
    // attempted, so with several goals only one would ever be written. The
    // re-run finds nothing pending because the ids are already recorded, so
    // letting the loop finish costs nothing and duplicates no work.
    void (async () => {
      for (const goal of pending) {
        poolAttempts.current.add(goal.id)
        try {
          const { pool } = await generateQuestPoolRemote({
            title: goal.title,
            detail: goal.detail,
            category: goal.category,
          })
          if (!unmounted.current) dispatch({ type: 'SET_QUEST_POOL', goalId: goal.id, pool })
        } catch {
          // No key, or the model failed. The generic templates still apply.
        }
      }
    })()
  }, [state.goals])

  const dismissEvent = useCallback((id: string) => {
    setEvents((prev) => prev.filter((e) => e.id !== id))
  }, [])

  const onboard = useCallback(
    (name: string, character: CharacterId, goals: NewGoalInput[]) => {
      dispatch({ type: 'ONBOARD', name, character, goals })
    },
    [],
  )

  const addGoal = useCallback((title: string, category: GoalCategory) => {
    dispatch({ type: 'ADD_GOAL', title, category })
  }, [])

  const archiveGoal = useCallback((goalId: string) => {
    dispatch({ type: 'ARCHIVE_GOAL', goalId })
  }, [])

  const completeQuest = useCallback((questId: string) => {
    dispatch({ type: 'COMPLETE_QUEST', questId })
  }, [])

  const uncompleteQuest = useCallback((questId: string) => {
    dispatch({ type: 'UNCOMPLETE_QUEST', questId })
  }, [])

  const addTodo = useCallback((title: string) => {
    dispatch({ type: 'ADD_TODO', title })
  }, [])

  const toggleTodo = useCallback((todoId: string) => {
    dispatch({ type: 'TOGGLE_TODO', todoId })
  }, [])

  const deleteTodo = useCallback((todoId: string) => {
    dispatch({ type: 'DELETE_TODO', todoId })
  }, [])

  const clearDoneTodos = useCallback(() => {
    dispatch({ type: 'CLEAR_DONE_TODOS' })
  }, [])

  const scheduleTask = useCallback(
    (refType: 'todo' | 'quest', refId: string, view: PlannerView, periodKey: string, slot: string) => {
      dispatch({ type: 'SCHEDULE_TASK', refType, refId, view, periodKey, slot })
    },
    [],
  )

  const moveScheduleEntry = useCallback((entryId: string, periodKey: string, slot: string) => {
    dispatch({ type: 'MOVE_SCHEDULE_ENTRY', entryId, periodKey, slot })
  }, [])

  const unschedule = useCallback((entryId: string) => {
    dispatch({ type: 'UNSCHEDULE', entryId })
  }, [])

  const addPlannedTodo = useCallback((title: string, view: PlannerView, periodKey: string, slot: string) => {
    dispatch({ type: 'ADD_PLANNED_TODO', title, view, periodKey, slot })
  }, [])

  const saveSession = useCallback(
    (input: {
      kind: SessionKind
      label: string
      plan: PlanItem[]
      goalId: string | null
      durationMs: number
      targetMs: number | null
      completed: boolean
      startedAt: string
    }) => {
      dispatch({ type: 'SAVE_SESSION', ...input })
    },
    [],
  )

  const deleteSession = useCallback((sessionId: string) => {
    dispatch({ type: 'DELETE_SESSION', sessionId })
  }, [])

  const verifyQuest = useCallback((questId: string, kind: VerificationKind, note: string) => {
    dispatch({ type: 'VERIFY_QUEST', questId, kind, note })
  }, [])

  const addDeck = useCallback((topic: string, cards: { front: string; back: string; subtopic?: string }[]) => {
    dispatch({ type: 'ADD_DECK', topic, cards })
  }, [])

  const deleteDeck = useCallback((deckId: string) => {
    dispatch({ type: 'DELETE_DECK', deckId })
  }, [])

  const updateCard = useCallback((deckId: string, cardId: string, front: string, back: string) => {
    dispatch({ type: 'UPDATE_CARD', deckId, cardId, front, back })
  }, [])

  const deleteCard = useCallback((deckId: string, cardId: string) => {
    dispatch({ type: 'DELETE_CARD', deckId, cardId })
  }, [])

  const addCard = useCallback((deckId: string) => {
    dispatch({ type: 'ADD_CARD', deckId })
  }, [])

  const buyModel = useCallback((modelId: string) => {
    dispatch({ type: 'BUY_MODEL', modelId })
  }, [])

  const equipModel = useCallback((modelId: string | null) => {
    dispatch({ type: 'EQUIP_MODEL', modelId })
  }, [])

  const levelInfo = useMemo(() => {
    const xpInfo = levelFromXp(state.player.xp)
    const needed = proofsOutstanding(state.progression, xpInfo.level, proofsRequired)
    return {
      // The level actually held. XP may have run ahead of it.
      level: state.progression.level,
      xpIntoLevel: xpInfo.xpIntoLevel,
      xpForNext: xpInfo.xpForNext,
      /** True when XP is banked but the level is locked behind photo proof. */
      awaitingProof: needed > 0,
      proofsNeeded: needed,
      proofsBanked: state.progression.proofs,
      proofsRequired,
    }
  }, [state.player.xp, state.progression, proofsRequired])

  const achievementsWithStatus = useMemo(
    () =>
      ACHIEVEMENTS.map((a) => ({
        ...a,
        unlockedAt: state.unlockedAchievements[a.id] ?? null,
      })),
    [state.unlockedAchievements],
  )

  return {
    state,
    syncStatus,
    levelInfo,
    achievements: achievementsWithStatus,
    events,
    dismissEvent,
    onboard,
    addGoal,
    archiveGoal,
    completeQuest,
    uncompleteQuest,
    addTodo,
    toggleTodo,
    deleteTodo,
    clearDoneTodos,
    scheduleTask,
    moveScheduleEntry,
    unschedule,
    addPlannedTodo,
    saveSession,
    deleteSession,
    verifyQuest,
    addDeck,
    deleteDeck,
    updateCard,
    deleteCard,
    addCard,
    buyModel,
    equipModel,
  }
}
