import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, type ReactNode } from 'react'
import {
  ApiError,
  game,
  type AchievementView,
  type FocusSessionView,
  type GameQuest,
  type GameSnapshot,
  type Look,
  type Progress,
  type QuestInput,
  type QuestResult,
  type RewardSummary,
} from '../lib/api'
import type { PlanItem } from '../types'
import { loadCachedGame, saveCachedGame } from '../lib/storage'
import { rankForLevel } from '../data/ranks'

/**
 * Everything the player has earned, as the server reports it.
 *
 * One store for the whole app: progress, the quest board, the open focus
 * session, what the character wears, unread notifications. Every change goes
 * to the server first and the store takes the server's answer — nothing here
 * adds XP or ticks a quest on its own. When an answer carries rewards they are
 * turned into celebrations (XP, level-ups, achievements, unlocks) for the
 * reward layer to show.
 */

export type Celebration =
  | { id: string; type: 'xp'; amount: number; coins: number; capped: boolean; label: string | null }
  | { id: string; type: 'level'; level: number; from: number; rankName: string; rankChanged: boolean }
  | { id: string; type: 'achievement'; achievement: AchievementView }
  | { id: string; type: 'item'; item: RewardSummary['items'][number] }
  | { id: string; type: 'streak'; days: number }

type Status = 'loading' | 'ready' | 'offline' | 'error'

interface StoreState {
  status: Status
  error: string | null
  snapshot: GameSnapshot | null
  celebrations: Celebration[]
  loadedAt: number
}

type StoreAction =
  | { type: 'loaded'; snapshot: GameSnapshot }
  | { type: 'failed'; error: string; cached: GameSnapshot | null }
  | { type: 'progress'; progress: Progress }
  | { type: 'quest'; quest: GameQuest }
  | { type: 'quest-removed'; id: string }
  | { type: 'quests'; quests: GameQuest[] }
  | { type: 'focus'; session: FocusSessionView | null }
  | { type: 'look'; look: Look }
  | { type: 'unread'; unread: number }
  | { type: 'achievements'; unlocked: AchievementView[] }
  | { type: 'celebrate'; items: Celebration[] }
  | { type: 'dismiss'; id: string }

/** The quest Home puts first — the same choice the server makes. */
export function pickFeatured(quests: GameQuest[]): GameQuest | null {
  const open = quests.filter((q) => q.status === 'active' || q.status === 'in_progress')
  return (
    open.find((q) => q.pinned) ??
    open.find((q) => q.type === 'main' && q.status === 'in_progress') ??
    open.find((q) => q.type === 'main') ??
    open.find((q) => q.status === 'in_progress') ??
    [...open].sort((a, b) => b.xp - a.xp)[0] ??
    null
  )
}

function withQuests(snapshot: GameSnapshot, quests: GameQuest[]): GameSnapshot {
  return { ...snapshot, quests, featuredQuestId: pickFeatured(quests)?.id ?? null }
}

function reducer(state: StoreState, action: StoreAction): StoreState {
  const snap = state.snapshot
  switch (action.type) {
    case 'loaded':
      return { ...state, status: 'ready', error: null, snapshot: action.snapshot, loadedAt: Date.now() }
    case 'failed':
      return {
        ...state,
        status: state.snapshot || action.cached ? 'offline' : 'error',
        error: action.error,
        snapshot: state.snapshot ?? action.cached,
      }
    case 'progress':
      return snap ? { ...state, snapshot: { ...snap, progress: action.progress } } : state
    case 'quest': {
      if (!snap) return state
      const exists = snap.quests.some((q) => q.id === action.quest.id)
      const quests = exists ? snap.quests.map((q) => (q.id === action.quest.id ? action.quest : action.quest.pinned ? { ...q, pinned: false } : q)) : [action.quest, ...snap.quests]
      return { ...state, snapshot: withQuests(snap, quests) }
    }
    case 'quest-removed':
      return snap ? { ...state, snapshot: withQuests(snap, snap.quests.filter((q) => q.id !== action.id)) } : state
    case 'quests':
      return snap ? { ...state, snapshot: withQuests(snap, action.quests) } : state
    case 'focus':
      return snap ? { ...state, snapshot: { ...snap, focus: action.session } } : state
    case 'look':
      return snap ? { ...state, snapshot: { ...snap, look: action.look } } : state
    case 'unread':
      return snap ? { ...state, snapshot: { ...snap, notifications: { unread: action.unread } } } : state
    case 'achievements': {
      if (!snap || !action.unlocked.length) return state
      const recent = [...action.unlocked, ...snap.achievements.recent].slice(0, 3)
      return {
        ...state,
        snapshot: { ...snap, achievements: { ...snap.achievements, unlocked: snap.achievements.unlocked + action.unlocked.length, recent } },
      }
    }
    case 'celebrate':
      return { ...state, celebrations: [...state.celebrations, ...action.items] }
    case 'dismiss':
      return { ...state, celebrations: state.celebrations.filter((c) => c.id !== action.id) }
    default:
      return state
  }
}

let celebrationSeq = 0
const nextId = () => `c${Date.now().toString(36)}${(celebrationSeq += 1)}`

/** The moments worth showing from one reward summary. */
export function celebrationsFor(summary: RewardSummary, { includeXp = true } = {}): Celebration[] {
  const items: Celebration[] = []
  if (includeXp && (summary.xp > 0 || summary.capped)) {
    const main = summary.entries.find((e) => e.xp > 0 && e.source !== 'achievement')
    items.push({ id: nextId(), type: 'xp', amount: summary.xp, coins: summary.coins, capped: summary.capped, label: main?.label ?? null })
  }
  if (summary.streak?.extended && summary.streak.current > 1) items.push({ id: nextId(), type: 'streak', days: summary.streak.current })
  for (const achievement of summary.achievements) items.push({ id: nextId(), type: 'achievement', achievement })
  if (summary.levelAfter > summary.levelBefore) {
    items.push({
      id: nextId(),
      type: 'level',
      level: summary.levelAfter,
      from: summary.levelBefore,
      rankName: summary.progress.rank.name,
      rankChanged: rankForLevel(summary.levelBefore).id !== rankForLevel(summary.levelAfter).id,
    })
  }
  for (const item of summary.items) items.push({ id: nextId(), type: 'item', item })
  return items
}

export interface FinishedFocus {
  session: FocusSessionView
  rewards: RewardSummary
  quest: GameQuest | null
}

interface GameContextValue {
  status: Status
  error: string | null
  snapshot: GameSnapshot | null
  celebrations: Celebration[]
  refresh: () => Promise<void>
  refreshQuests: () => Promise<void>
  /** Folds a reward summary into progress; celebrates it unless told not to. */
  applyRewards: (summary: RewardSummary | null | undefined, options?: { celebrate?: boolean; includeXp?: boolean }) => void
  celebrate: (summary: RewardSummary, options?: { includeXp?: boolean }) => void
  dismissCelebration: (id: string) => void
  setLook: (look: Look) => void
  setUnread: (unread: number) => void

  createQuest: (input: QuestInput) => Promise<GameQuest>
  updateQuest: (id: string, input: Partial<QuestInput>) => Promise<GameQuest>
  deleteQuest: (id: string) => Promise<void>
  startQuest: (id: string) => Promise<GameQuest>
  pinQuest: (id: string, pinned: boolean) => Promise<GameQuest>
  abandonQuest: (id: string) => Promise<GameQuest>
  completeQuest: (id: string) => Promise<QuestResult>
  logProgress: (id: string, delta: number) => Promise<QuestResult>
  setMilestone: (id: string, index: number, done: boolean) => Promise<QuestResult>
  applyQuestResult: (result: QuestResult) => void

  startFocus: (input: { kind: 'timer' | 'stopwatch'; targetMinutes?: number; label?: string; questId?: string | null; goalId?: string | null; plan?: PlanItem[] }) => Promise<FocusSessionView>
  pauseFocus: () => Promise<void>
  resumeFocus: () => Promise<void>
  finishFocus: () => Promise<FinishedFocus>
  abandonFocus: () => Promise<void>
  updateFocusPlan: (plan: PlanItem[]) => Promise<void>
}

const GameContext = createContext<GameContextValue | null>(null)

const UNREAD_POLL_MS = 60_000
const STALE_AFTER_MS = 2 * 60_000

export function GameProvider({ userId, children, onSignedOut }: { userId: string; children: ReactNode; onSignedOut: () => void }) {
  const [state, dispatch] = useReducer(reducer, undefined, (): StoreState => ({
    status: 'loading',
    error: null,
    snapshot: null,
    celebrations: [],
    loadedAt: 0,
  }))
  const signedOut = useRef(onSignedOut)
  signedOut.current = onSignedOut
  const latest = useRef(state)
  latest.current = state

  const guard = useCallback(async <T,>(work: () => Promise<T>): Promise<T> => {
    try {
      return await work()
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) signedOut.current()
      throw err
    }
  }, [])

  const refresh = useCallback(async () => {
    try {
      const snapshot = await game.snapshot()
      dispatch({ type: 'loaded', snapshot })
      saveCachedGame(userId, snapshot)
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        signedOut.current()
        return
      }
      dispatch({
        type: 'failed',
        error: err instanceof ApiError && err.status ? err.message : 'You are offline. Progress will update when you reconnect.',
        cached: loadCachedGame(userId),
      })
    }
  }, [userId])

  useEffect(() => {
    void refresh()
  }, [refresh])

  // Save each fresh snapshot for an offline start.
  useEffect(() => {
    if (state.status === 'ready' && state.snapshot) saveCachedGame(userId, state.snapshot)
  }, [state.snapshot, state.status, userId])

  // Coming back to the tab after a while picks up the day turning over,
  // duels settling and anything else the server did in the meantime.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return
      if (Date.now() - latest.current.loadedAt > STALE_AFTER_MS) void refresh()
    }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', onVisible)
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', onVisible)
    }
  }, [refresh])

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (document.visibilityState !== 'visible' || !latest.current.snapshot) return
      game
        .unread()
        .then(({ unread }) => dispatch({ type: 'unread', unread }))
        .catch(() => {
          // Checked again next minute.
        })
    }, UNREAD_POLL_MS)
    return () => window.clearInterval(timer)
  }, [])

  const celebrate = useCallback((summary: RewardSummary, options?: { includeXp?: boolean }) => {
    const items = celebrationsFor(summary, options)
    if (items.length) dispatch({ type: 'celebrate', items })
  }, [])

  const applyRewards = useCallback(
    (summary: RewardSummary | null | undefined, options: { celebrate?: boolean; includeXp?: boolean } = {}) => {
      if (!summary) return
      dispatch({ type: 'progress', progress: summary.progress })
      if (summary.achievements.length) dispatch({ type: 'achievements', unlocked: summary.achievements })
      if (options.celebrate !== false) celebrate(summary, { includeXp: options.includeXp })
    },
    [celebrate],
  )

  const applyQuestResult = useCallback(
    (result: QuestResult) => {
      dispatch({ type: 'quest', quest: result.quest })
      applyRewards(result.rewards)
    },
    [applyRewards],
  )

  const refreshQuests = useCallback(async () => {
    const { quests } = await guard(() => game.quests())
    dispatch({ type: 'quests', quests })
  }, [guard])

  const focusId = () => latest.current.snapshot?.focus?.id ?? null

  const value = useMemo<GameContextValue>(
    () => ({
      status: state.status,
      error: state.error,
      snapshot: state.snapshot,
      celebrations: state.celebrations,
      refresh,
      refreshQuests,
      applyRewards,
      celebrate,
      dismissCelebration: (id) => dispatch({ type: 'dismiss', id }),
      setLook: (look) => dispatch({ type: 'look', look }),
      setUnread: (unread) => dispatch({ type: 'unread', unread }),

      createQuest: async (input) => {
        const { quest } = await guard(() => game.createQuest(input))
        dispatch({ type: 'quest', quest })
        return quest
      },
      updateQuest: async (id, input) => {
        const { quest } = await guard(() => game.updateQuest(id, input))
        dispatch({ type: 'quest', quest })
        return quest
      },
      deleteQuest: async (id) => {
        await guard(() => game.deleteQuest(id))
        dispatch({ type: 'quest-removed', id })
      },
      startQuest: async (id) => {
        const { quest } = await guard(() => game.startQuest(id))
        dispatch({ type: 'quest', quest })
        return quest
      },
      pinQuest: async (id, pinned) => {
        const { quest } = await guard(() => game.pinQuest(id, pinned))
        dispatch({ type: 'quest', quest })
        return quest
      },
      abandonQuest: async (id) => {
        const { quest } = await guard(() => game.abandonQuest(id))
        dispatch({ type: 'quest', quest })
        return quest
      },
      completeQuest: async (id) => {
        const result = await guard(() => game.completeQuest(id))
        applyQuestResult(result)
        return result
      },
      logProgress: async (id, delta) => {
        const result = await guard(() => game.logProgress(id, delta))
        applyQuestResult(result)
        return result
      },
      setMilestone: async (id, index, done) => {
        const result = await guard(() => game.setMilestone(id, index, done))
        applyQuestResult(result)
        return result
      },
      applyQuestResult,

      startFocus: async (input) => {
        try {
          const { session } = await guard(() => game.startFocus(input))
          dispatch({ type: 'focus', session })
          if (input.questId) void refreshQuests().catch(() => undefined)
          return session
        } catch (err) {
          // A session already open elsewhere: adopt it rather than failing.
          if (err instanceof ApiError && err.code === 'session_open') {
            const { session } = await game.currentFocus()
            dispatch({ type: 'focus', session })
          }
          throw err
        }
      },
      pauseFocus: async () => {
        const id = focusId()
        if (!id) return
        const { session } = await guard(() => game.pauseFocus(id))
        dispatch({ type: 'focus', session })
      },
      resumeFocus: async () => {
        const id = focusId()
        if (!id) return
        const { session } = await guard(() => game.resumeFocus(id))
        dispatch({ type: 'focus', session })
      },
      finishFocus: async () => {
        const id = focusId()
        if (!id) throw new ApiError('There is no focus session running.', 409)
        const result = await guard(() => game.finishFocus(id))
        dispatch({ type: 'focus', session: null })
        if (result.quest) dispatch({ type: 'quest', quest: result.quest })
        // Shown on the victory screen first; the reward layer takes over after.
        applyRewards(result.rewards, { celebrate: false })
        void refresh()
        return result
      },
      abandonFocus: async () => {
        const id = focusId()
        if (!id) return
        await guard(() => game.abandonFocus(id))
        dispatch({ type: 'focus', session: null })
      },
      updateFocusPlan: async (plan) => {
        const id = focusId()
        if (!id) return
        const { session } = await guard(() => game.updateFocusPlan(id, plan))
        dispatch({ type: 'focus', session })
      },
    }),
    [state.status, state.error, state.snapshot, state.celebrations, refresh, refreshQuests, applyRewards, celebrate, guard, applyQuestResult],
  )

  return <GameContext.Provider value={value}>{children}</GameContext.Provider>
}

export function useGame(): GameContextValue {
  const value = useContext(GameContext)
  if (!value) throw new Error('useGame must be used inside GameProvider')
  return value
}

/** Progress, when loaded — most screens render nothing else without it. */
export function useProgress(): Progress | null {
  return useGame().snapshot?.progress ?? null
}
