import { useCallback, useEffect, useRef, useState } from 'react'
import type { PlanItem, SessionKind } from '../types'

export interface SessionDraft {
  kind: SessionKind
  label: string
  plan: PlanItem[]
  goalId: string | null
  durationMs: number
  targetMs: number | null
  completed: boolean
  startedAt: string
}

interface Options {
  onSave: (draft: SessionDraft) => void
}

const TICK_MS = 200
export const DEFAULT_TARGET_MS = 25 * 60 * 1000

/**
 * Timer/stopwatch driven by wall-clock timestamps rather than by counting
 * interval ticks, so throttled background tabs and slow frames can't make it
 * drift. The interval only exists to re-render the display.
 */
export function useFocusClock({ onSave }: Options) {
  const [mode, setModeRaw] = useState<SessionKind>('timer')
  const [targetMs, setTargetMs] = useState(DEFAULT_TARGET_MS)
  const [label, setLabel] = useState('')
  const [plan, setPlan] = useState<PlanItem[]>([])
  const [goalId, setGoalId] = useState<string | null>(null)

  const addPlanItem = useCallback((text: string) => {
    const trimmed = text.trim()
    if (!trimmed) return
    setPlan((prev) => [...prev, { id: crypto.randomUUID(), text: trimmed.slice(0, 120), done: false }])
  }, [])

  const togglePlanItem = useCallback((id: string) => {
    setPlan((prev) => prev.map((i) => (i.id === id ? { ...i, done: !i.done } : i)))
  }, [])

  const removePlanItem = useCallback((id: string) => {
    setPlan((prev) => prev.filter((i) => i.id !== id))
  }, [])

  const [accumulatedMs, setAccumulatedMs] = useState(0)
  const [segmentStart, setSegmentStart] = useState<number | null>(null)
  const [startedAt, setStartedAt] = useState<string | null>(null)
  const [, forceTick] = useState(0)

  const running = segmentStart !== null
  const elapsedMs = accumulatedMs + (segmentStart !== null ? Math.max(0, Date.now() - segmentStart) : 0)
  const remainingMs = mode === 'timer' ? Math.max(0, targetMs - elapsedMs) : 0
  const hasStarted = elapsedMs > 0 || running

  useEffect(() => {
    if (!running) return
    const id = setInterval(() => forceTick((n) => n + 1), TICK_MS)
    return () => clearInterval(id)
  }, [running])

  const clear = useCallback(() => {
    setAccumulatedMs(0)
    setSegmentStart(null)
    setStartedAt(null)
  }, [])

  const start = useCallback(() => {
    setStartedAt((prev) => prev ?? new Date().toISOString())
    setSegmentStart(Date.now())
  }, [])

  const pause = useCallback(() => {
    setSegmentStart((prev) => {
      if (prev === null) return null
      setAccumulatedMs((acc) => acc + Math.max(0, Date.now() - prev))
      return null
    })
  }, [])

  const reset = useCallback(() => {
    clear()
  }, [clear])

  const commit = useCallback(
    (durationMs: number, completed: boolean) => {
      if (durationMs < 1000) {
        clear()
        return
      }
      onSave({
        kind: mode,
        label,
        plan,
        goalId,
        durationMs,
        targetMs: mode === 'timer' ? targetMs : null,
        completed,
        startedAt: startedAt ?? new Date(Date.now() - durationMs).toISOString(),
      })
      clear()
      setLabel('')
      setPlan([])
    },
    [clear, goalId, label, mode, onSave, plan, startedAt, targetMs],
  )

  /** Save whatever has elapsed so far (used for the stopwatch, or to bank a
   * timer session early). */
  const save = useCallback(() => {
    commit(elapsedMs, false)
  }, [commit, elapsedMs])

  // Auto-finish a countdown the moment it reaches zero. The ref guard keeps a
  // burst of ticks from committing the same session twice.
  const finishing = useRef(false)
  useEffect(() => {
    if (mode !== 'timer' || !running) return
    if (elapsedMs < targetMs) return
    if (finishing.current) return
    finishing.current = true
    // Record the intended duration, not the few ms of tick overshoot.
    commit(targetMs, true)
    finishing.current = false
  }, [commit, elapsedMs, mode, running, targetMs])

  const setMode = useCallback(
    (next: SessionKind) => {
      if (next === mode) return
      clear()
      setModeRaw(next)
    },
    [clear, mode],
  )

  return {
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
  }
}

export type FocusClock = ReturnType<typeof useFocusClock>
