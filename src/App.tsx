import { useCallback, useEffect, useState } from 'react'
import { Swords, Loader2, LogOut, Cloud, CloudOff, RefreshCw } from 'lucide-react'
import { useAppState, type SyncStatus } from './hooks/useAppState'
import type { AppState } from './types'
import { ApiError, fetchState, logout as logoutRequest, me, type AuthUser } from './lib/api'
import { clearCachedState, loadCachedState } from './lib/storage'
import AuthScreen from './components/AuthScreen'
import Onboarding from './components/Onboarding'
import Dashboard from './components/Dashboard'
import GoalsManager from './components/GoalsManager'
import Achievements from './components/Achievements'
import AvatarScreen from './components/AvatarScreen'
import TodoList from './components/TodoList'
import Planner from './components/Planner'
import FocusScreen from './components/FocusScreen'
import { VerifyModalHost } from './components/VerifyModal'
import { useFocusClock } from './hooks/useFocusClock'
import { useNoise } from './hooks/useNoise'
import NoiseButton from './components/NoiseButton'
import { formatClock } from './lib/time'
import Nav, { type View } from './components/Nav'
import { ToastStack, LevelUpModal } from './components/EventToasts'

type Boot =
  | { phase: 'loading' }
  | { phase: 'anonymous' }
  | { phase: 'ready'; user: AuthUser; initialState: AppState | null }
  | { phase: 'error'; message: string }

function SyncBadge({ status }: { status: SyncStatus }) {
  if (status === 'idle') return null
  const map = {
    saving: { icon: RefreshCw, text: 'Saving…', className: 'text-slate-400', spin: true },
    saved: { icon: Cloud, text: 'Saved', className: 'text-slate-500', spin: false },
    error: { icon: CloudOff, text: 'Offline — changes not saved', className: 'text-ember-400', spin: false },
  } as const
  const { icon: Icon, text, className, spin } = map[status]
  return (
    <span className={`flex items-center gap-1 text-[11px] ${className}`} title={text}>
      <Icon className={`h-3 w-3 ${spin ? 'animate-spin' : ''}`} />
      <span className="hidden sm:inline">{text}</span>
    </span>
  )
}

function FullScreenMessage({ children }: { children: React.ReactNode }) {
  return <div className="flex min-h-screen items-center justify-center px-4 text-center text-sm text-slate-400">{children}</div>
}

export default function App() {
  const [boot, setBoot] = useState<Boot>({ phase: 'loading' })

  const loadForUser = useCallback(async (user: AuthUser) => {
    try {
      const { state } = await fetchState()
      setBoot({ phase: 'ready', user, initialState: state })
    } catch {
      // Server unreachable — fall back to this user's own cached copy so the
      // app still opens offline.
      setBoot({ phase: 'ready', user, initialState: loadCachedState(user.id) })
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const { user } = await me()
        if (cancelled) return
        await loadForUser(user)
      } catch (err) {
        if (cancelled) return
        if (err instanceof ApiError && err.status === 401) {
          setBoot({ phase: 'anonymous' })
        } else {
          setBoot({ phase: 'error', message: 'Could not reach the server. Is it running?' })
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [loadForUser])

  if (boot.phase === 'loading') {
    return (
      <FullScreenMessage>
        <Loader2 className="h-5 w-5 animate-spin text-gold-400" />
      </FullScreenMessage>
    )
  }

  if (boot.phase === 'error') {
    return <FullScreenMessage>{boot.message}</FullScreenMessage>
  }

  if (boot.phase === 'anonymous') {
    return <AuthScreen onAuthed={(user) => void loadForUser(user)} />
  }

  return (
    // Remounting per user guarantees no state bleeds between accounts.
    <AuthedApp
      key={boot.user.id}
      user={boot.user}
      initialState={boot.initialState}
      onSignedOut={() => setBoot({ phase: 'anonymous' })}
    />
  )
}

function AuthedApp({
  user,
  initialState,
  onSignedOut,
}: {
  user: AuthUser
  initialState: AppState | null
  onSignedOut: () => void
}) {
  const {
    state,
    syncStatus,
    levelInfo,
    achievements,
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
    buyModel,
    equipModel,
  } = useAppState(user.id, initialState)
  const [view, setView] = useState<View>('dashboard')
  const [verifyingQuestId, setVerifyingQuestId] = useState<string | null>(null)
  const verifyingQuest = state.quests.find((q) => q.id === verifyingQuestId) ?? null

  // Lives here rather than inside FocusScreen so a running timer survives
  // switching tabs.
  const clock = useFocusClock({ onSave: saveSession })

  // Lives here rather than in a screen so ambient sound keeps playing while the
  // user moves between tabs.
  const noise = useNoise()

  async function handleSignOut() {
    try {
      await logoutRequest()
    } catch {
      // Even if the call fails, drop the local copy and return to sign-in.
    }
    clearCachedState(user.id)
    onSignedOut()
  }

  function toggleQuest(questId: string) {
    const quest = state.quests.find((q) => q.id === questId)
    if (!quest) return
    if (quest.completed) uncompleteQuest(questId)
    else completeQuest(questId)
  }

  if (!state.onboarded) {
    return <Onboarding onComplete={onboard} />
  }

  return (
    <div className="min-h-screen">
      <header className="border-b border-ink-700/60">
        <div className="mx-auto flex max-w-2xl items-center gap-2 px-4 py-4 [padding-left:max(1rem,env(safe-area-inset-left))] [padding-right:max(1rem,env(safe-area-inset-right))]">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-gold-500 to-ember-500">
            <Swords className="h-4.5 w-4.5 text-ink-950" />
          </div>
          <span className="font-display text-base font-bold tracking-wide text-gold-300">Questly</span>

          <div className="ml-auto flex items-center gap-3">
            {clock.running && (
              <button
                type="button"
                onClick={() => setView('focus')}
                title="Focus session running"
                className="flex items-center gap-1.5 rounded-lg border border-gold-500/40 bg-gold-500/10 px-2 py-1 text-[11px] font-semibold tabular-nums text-gold-300 transition-colors hover:bg-gold-500/20"
              >
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-gold-400" />
                {formatClock(clock.mode === 'timer' ? clock.remainingMs : clock.elapsedMs)}
              </button>
            )}
            <SyncBadge status={syncStatus} />
            <span className="hidden text-[11px] text-slate-500 sm:inline">{user.email}</span>
            <button
              type="button"
              onClick={handleSignOut}
              title="Sign out"
              aria-label="Sign out"
              className="rounded-lg p-1.5 text-slate-500 transition-colors hover:bg-ink-800 hover:text-slate-200"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-2xl space-y-5 px-4 py-6 [padding-bottom:calc(1.5rem+env(safe-area-inset-bottom))] [padding-left:max(1rem,env(safe-area-inset-left))] [padding-right:max(1rem,env(safe-area-inset-right))]">
        <Nav view={view} onChange={setView} />

        {view === 'dashboard' && (
          <Dashboard
            state={state}
            levelInfo={levelInfo}
            onToggleQuest={toggleQuest}
            onVerifyQuest={setVerifyingQuestId}
            onOpenAvatar={() => setView('avatar')}
          />
        )}
        {view === 'todos' && (
          <TodoList
            todos={state.todos}
            onAdd={addTodo}
            onToggle={toggleTodo}
            onDelete={deleteTodo}
            onClearDone={clearDoneTodos}
          />
        )}
        {view === 'schedule' && (
          <Planner
            state={state}
            onSchedule={scheduleTask}
            onMove={moveScheduleEntry}
            onUnschedule={unschedule}
            onAddPlanned={addPlannedTodo}
            onToggleTodo={toggleTodo}
            onToggleQuest={toggleQuest}
          />
        )}
        {view === 'focus' && <FocusScreen state={state} clock={clock} onDeleteSession={deleteSession} />}
        {view === 'goals' && <GoalsManager goals={state.goals} onAddGoal={addGoal} onArchiveGoal={archiveGoal} />}
        {view === 'avatar' && (
          <AvatarScreen
            state={state}
            levelInfo={levelInfo}
            onBuyModel={buyModel}
            onEquipModel={equipModel}
          />
        )}
        {view === 'achievements' && <Achievements achievements={achievements} />}
      </main>

      <VerifyModalHost
        quest={verifyingQuest}
        onClose={() => setVerifyingQuestId(null)}
        onVerified={(kind, note) => {
          if (verifyingQuestId) verifyQuest(verifyingQuestId, kind, note)
        }}
      />

      <NoiseButton noise={noise} />

      <ToastStack events={events} onDismiss={dismissEvent} />
      <LevelUpModal events={events} onDismiss={dismissEvent} />
    </div>
  )
}
