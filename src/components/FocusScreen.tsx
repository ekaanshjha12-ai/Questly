import { useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Play, Pause, RotateCcw, Save, Trash2, Timer as TimerIcon, Watch, Zap, Plus, X, ListChecks, Check } from 'lucide-react'
import type { AppState, FocusSession } from '../types'
import type { FocusClock } from '../hooks/useFocusClock'
import { formatClock, formatDuration, sessionXp } from '../lib/time'
import { dailyKey } from '../lib/period'
import { getCategoryMeta } from '../data/categories'

interface Props {
  state: AppState
  clock: FocusClock
  onDeleteSession: (sessionId: string) => void
}

const PRESETS = [5, 15, 25, 50]

function SessionRow({
  session,
  goalLabel,
  onDelete,
}: {
  session: FocusSession
  goalLabel: string | null
  onDelete: () => void
}) {
  const when = new Date(session.endedAt)
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, height: 0 }}
      className="group flex items-center gap-3 rounded-xl border border-ink-600 bg-ink-800/60 px-4 py-2.5"
    >
      <span className="text-base">{session.kind === 'timer' ? '⏱️' : '⏲️'}</span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm text-slate-100">{session.label}</p>
        <p className="text-[11px] text-slate-500">
          {when.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} ·{' '}
          {when.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}
          {goalLabel ? ` · ${goalLabel}` : ''}
          {session.completed ? ' · finished' : ''}
        </p>
      </div>
      <span className="shrink-0 text-sm font-semibold text-slate-200">{formatDuration(session.durationMs)}</span>
      <button
        type="button"
        onClick={onDelete}
        aria-label={`Delete session "${session.label}"`}
        className="shrink-0 rounded-lg p-1.5 text-slate-600 transition-opacity sm:opacity-0 hover:text-ember-400 sm:group-hover:opacity-100"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </motion.div>
  )
}

export default function FocusScreen({ state, clock, onDeleteSession }: Props) {
  const [planDraft, setPlanDraft] = useState('')
  const {
    mode,
    setMode,
    targetMs,
    setTargetMs,
    label,
    setLabel,
    plan,
    addPlanItem,
    togglePlanItem,
    removePlanItem,
    goalId,
    setGoalId,
    running,
    elapsedMs,
    remainingMs,
    hasStarted,
    start,
    pause,
    reset,
    save,
  } = clock

  const activeGoals = useMemo(() => state.goals.filter((g) => !g.archived), [state.goals])
  const goalsById = useMemo(() => new Map(state.goals.map((g) => [g.id, g])), [state.goals])

  const todayTotal = useMemo(() => {
    const today = dailyKey(new Date())
    return state.sessions
      .filter((s) => dailyKey(new Date(s.endedAt)) === today)
      .reduce((sum, s) => sum + s.durationMs, 0)
  }, [state.sessions])

  const allTimeTotal = useMemo(
    () => state.sessions.reduce((sum, s) => sum + s.durationMs, 0),
    [state.sessions],
  )

  const display = mode === 'timer' ? remainingMs : elapsedMs
  const progress = mode === 'timer' && targetMs > 0 ? Math.min(1, elapsedMs / targetMs) : 0

  const RADIUS = 92
  const CIRC = 2 * Math.PI * RADIUS

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display text-lg font-semibold text-slate-100">Focus</h2>
        <div className="flex gap-1 rounded-xl border border-ink-600 bg-ink-850/70 p-1">
          <button
            type="button"
            onClick={() => setMode('timer')}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
              mode === 'timer'
                ? 'bg-gradient-to-r from-gold-500 to-ember-500 text-ink-950'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <TimerIcon className="h-3.5 w-3.5" /> Timer
          </button>
          <button
            type="button"
            onClick={() => setMode('stopwatch')}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
              mode === 'stopwatch'
                ? 'bg-gradient-to-r from-gold-500 to-ember-500 text-ink-950'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Watch className="h-3.5 w-3.5" /> Stopwatch
          </button>
        </div>
      </div>

      <div className="rounded-2xl border border-ink-600 bg-ink-850/70 p-6">
        <div className="flex flex-col items-center">
          <div className="relative" style={{ width: 220, height: 220 }}>
            <svg viewBox="0 0 220 220" className="h-full w-full -rotate-90">
              <circle cx="110" cy="110" r={RADIUS} fill="none" stroke="#232336" strokeWidth="12" />
              {mode === 'timer' && (
                <circle
                  cx="110"
                  cy="110"
                  r={RADIUS}
                  fill="none"
                  stroke="url(#focusGrad)"
                  strokeWidth="12"
                  strokeLinecap="round"
                  strokeDasharray={CIRC}
                  strokeDashoffset={CIRC * (1 - progress)}
                  style={{ transition: running ? 'stroke-dashoffset 0.2s linear' : 'none' }}
                />
              )}
              <defs>
                <linearGradient id="focusGrad" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0%" stopColor="#f5b800" />
                  <stop offset="100%" stopColor="#ff6b3d" />
                </linearGradient>
              </defs>
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="font-display text-4xl font-bold tabular-nums text-slate-50">{formatClock(display)}</span>
              <span className="mt-1 text-[11px] uppercase tracking-wide text-slate-500">
                {mode === 'timer' ? (running ? 'remaining' : 'ready') : running ? 'elapsed' : 'stopped'}
              </span>
              {hasStarted && (
                <span className="mt-1 flex items-center gap-1 text-[11px] text-gold-400">
                  <Zap className="h-3 w-3" />+{sessionXp(mode === 'timer' ? targetMs : elapsedMs)} XP
                </span>
              )}
            </div>
          </div>

          {mode === 'timer' && !hasStarted && (
            <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
              {PRESETS.map((min) => {
                const active = targetMs === min * 60 * 1000
                return (
                  <button
                    key={min}
                    type="button"
                    onClick={() => setTargetMs(min * 60 * 1000)}
                    className={`rounded-lg border px-3 py-1.5 text-xs transition-colors ${
                      active
                        ? 'border-gold-500/60 bg-gold-500/10 text-gold-300'
                        : 'border-ink-600 bg-ink-800/60 text-slate-300 hover:border-ink-500'
                    }`}
                  >
                    {min}m
                  </button>
                )
              })}
              <label className="flex items-center gap-1.5 rounded-lg border border-ink-600 bg-ink-800/60 px-2.5 py-1.5">
                <input
                  type="number"
                  min={1}
                  max={480}
                  value={Math.round(targetMs / 60000)}
                  onChange={(e) => {
                    const minutes = Math.max(1, Math.min(480, Number(e.target.value) || 1))
                    setTargetMs(minutes * 60 * 1000)
                  }}
                  aria-label="Custom minutes"
                  className="w-12 bg-transparent text-center text-xs text-slate-100 outline-none"
                />
                <span className="text-[11px] text-slate-500">min</span>
              </label>
            </div>
          )}

          <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
            {!running ? (
              <button
                type="button"
                onClick={start}
                className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-gold-500 to-ember-500 px-5 py-2.5 font-semibold text-ink-950 hover:opacity-90"
              >
                <Play className="h-4 w-4" /> {hasStarted ? 'Resume' : 'Start'}
              </button>
            ) : (
              <button
                type="button"
                onClick={pause}
                className="flex items-center gap-2 rounded-xl border border-ink-500 bg-ink-800 px-5 py-2.5 font-semibold text-slate-100 hover:bg-ink-700"
              >
                <Pause className="h-4 w-4" /> Pause
              </button>
            )}

            <button
              type="button"
              onClick={save}
              disabled={elapsedMs < 1000}
              className="flex items-center gap-2 rounded-xl border border-ink-600 px-4 py-2.5 text-sm text-slate-200 transition-colors disabled:cursor-not-allowed disabled:opacity-40 hover:bg-ink-800"
            >
              <Save className="h-4 w-4" /> Save session
            </button>

            <button
              type="button"
              onClick={reset}
              disabled={!hasStarted}
              aria-label="Reset"
              className="rounded-xl border border-ink-600 p-2.5 text-slate-400 transition-colors disabled:cursor-not-allowed disabled:opacity-40 hover:bg-ink-800 hover:text-slate-100"
            >
              <RotateCcw className="h-4 w-4" />
            </button>
          </div>

          <div className="mt-5 w-full space-y-2">
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="What are you focusing on?"
              maxLength={80}
              autoComplete="off"
              name="questly-focus-label"
              className="w-full rounded-xl border border-ink-600 bg-ink-900 px-4 py-2.5 text-sm text-slate-100 placeholder-slate-500 outline-none focus:border-gold-500/60"
            />
            <div className="rounded-xl border border-ink-600 bg-ink-900/60 p-3 text-left">
              <p className="mb-2 flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-slate-500">
                <ListChecks className="h-3 w-3" />
                Session plan
                {plan.length > 0 && (
                  <span className="ml-auto text-slate-400">
                    {plan.filter((i) => i.done).length}/{plan.length}
                  </span>
                )}
              </p>

              {plan.length > 0 && (
                <ul className="mb-2 space-y-1">
                  {plan.map((item) => (
                    <li key={item.id} className="group flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => togglePlanItem(item.id)}
                        aria-label={item.done ? `Mark "${item.text}" as not done` : `Mark "${item.text}" as done`}
                        className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors ${
                          item.done
                            ? 'border-mystic-400 bg-mystic-500 text-white'
                            : 'border-ink-500 bg-ink-900 text-transparent hover:border-slate-400'
                        }`}
                      >
                        <Check className="h-3 w-3" strokeWidth={4} />
                      </button>
                      <span
                        className={`flex-1 text-xs ${item.done ? 'text-slate-500 line-through' : 'text-slate-200'}`}
                      >
                        {item.text}
                      </span>
                      <button
                        type="button"
                        onClick={() => removePlanItem(item.id)}
                        aria-label={`Remove "${item.text}" from the plan`}
                        className="shrink-0 rounded p-0.5 text-slate-600 transition-opacity hover:text-ember-400 sm:opacity-0 sm:group-hover:opacity-100"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}

              <form
                onSubmit={(e) => {
                  e.preventDefault()
                  addPlanItem(planDraft)
                  setPlanDraft('')
                }}
                className="flex gap-1.5"
              >
                <input
                  value={planDraft}
                  onChange={(e) => setPlanDraft(e.target.value)}
                  placeholder={plan.length ? 'Add another step…' : 'What will you get done?'}
                  maxLength={120}
                  autoComplete="off"
                  name="questly-plan-item"
                  className="flex-1 rounded-lg border border-ink-600 bg-ink-950 px-2.5 py-1.5 text-xs text-slate-100 placeholder-slate-500 outline-none focus:border-gold-500/60"
                />
                <button
                  type="submit"
                  disabled={!planDraft.trim()}
                  aria-label="Add to the session plan"
                  className="shrink-0 rounded-lg border border-ink-600 px-2 text-slate-400 transition-colors hover:border-gold-500/50 hover:text-gold-300 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <Plus className="h-3.5 w-3.5" />
                </button>
              </form>
            </div>

            {activeGoals.length > 0 && (
              <select
                value={goalId ?? ''}
                onChange={(e) => setGoalId(e.target.value || null)}
                aria-label="Link to a goal"
                className="w-full rounded-xl border border-ink-600 bg-ink-900 px-4 py-2.5 text-sm text-slate-100 outline-none focus:border-gold-500/60"
              >
                <option value="">No linked goal</option>
                {activeGoals.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.title}
                  </option>
                ))}
              </select>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-xl border border-ink-600 bg-ink-850/70 p-4 text-center">
          <p className="text-[11px] uppercase tracking-wide text-slate-500">Today</p>
          <p className="mt-1 font-display text-xl font-bold text-gold-300">{formatDuration(todayTotal)}</p>
        </div>
        <div className="rounded-xl border border-ink-600 bg-ink-850/70 p-4 text-center">
          <p className="text-[11px] uppercase tracking-wide text-slate-500">All time</p>
          <p className="mt-1 font-display text-xl font-bold text-mystic-400">{formatDuration(allTimeTotal)}</p>
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="font-display text-sm font-semibold text-slate-100">Saved sessions</h3>
          <span className="text-xs text-slate-400">{state.sessions.length}</span>
        </div>

        {state.sessions.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-ink-600 bg-ink-850/40 p-8 text-center">
            <TimerIcon className="mx-auto h-7 w-7 text-gold-400" />
            <p className="mt-2 text-sm text-slate-300">No sessions saved yet.</p>
            <p className="mt-1 text-xs text-slate-500">Finish a timer or save a stopwatch run to log it here.</p>
          </div>
        ) : (
          <AnimatePresence initial={false}>
            {state.sessions.slice(0, 30).map((session) => {
              const goal = session.goalId ? goalsById.get(session.goalId) : null
              return (
                <SessionRow
                  key={session.id}
                  session={session}
                  goalLabel={goal ? `${getCategoryMeta(goal.category).icon} ${goal.title}` : null}
                  onDelete={() => onDeleteSession(session.id)}
                />
              )
            })}
          </AnimatePresence>
        )}
      </div>
    </div>
  )
}
